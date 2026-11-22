// Censai the orchestrator: one job, from hand-off to a checked answer.
//
//   1. Censai hands the job to the family agent by family mail, so the
//      Family desk shows who asked whom
//   2. the agent does it through the run engine (server/runEngine): its own
//      model, the person's key, its memory and its tools
//   3. Censai checks the work against the job's checklist (check.js) before
//      the person hears about it: done only once every item is checked off
//   4. items not true yet: back to the agent once, with what the checks
//      showed; still not, an item that cannot be checked here, or the agent
//      could not run: the job is stuck on that item
//
// Every stage is a step line on the job, and every item change is saved as it happens.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { publicChatError } from '../chatModel/errors.js';
import { runInJobProject } from '../tools/jobProject.js';
import { runInPlanJob } from '../tools/jobRun.js';
import { runFenced } from '../workspaces/ownerTrust.js';
import { checkAnswer } from './check.js';
import { PR_CHECKS_WAIT_MS, onGithubBranch } from './jobPr.js';
import { closeChecklist, reopenChecklist, tickCount } from './checklist.js';
import { checkPin } from './projectPin.js';
import { jobPrompt, sendBackPrompt } from './prompts.js';
import { loadPlan } from './store.js';
import { JOB_ROUNDS, MAX_ANSWER_CHARS, MAX_ATTEMPTS, addStep, agentName, clip, settleStep } from './shape.js';

const log = createLogger('censai-orchestrator');
// Room for JOB_ROUNDS on a slow model; the turn is asked to answer before this runs out.
const configured = Number(process.env.CENSAI_JOB_TIMEOUT_MS) || 20 * 60 * 1000;
export const JOB_TIMEOUT_MS = Math.min(30 * 60 * 1000, Math.max(30_000, configured));

/** Thrown inside a job once the person stopped the plan; the plan is already saved as stopped. */
export class PlanStopped extends Error {}

// Another server may have stopped this plan, or carried it on, since it was loaded here: then no turn starts.
async function stillRunning(deps, plan) {
  if (typeof deps.db?.query !== 'function') return true;
  try {
    return (await loadPlan(deps.db, plan.id))?.status === 'running';
  } catch (error) {
    log.warn('plan not read again before a turn', { planId: plan.id, code: safeErrorCode(error) });
    return true;
  }
}

/** Plain words for why the agent's turn did not finish. */
export function turnError(error, name, elapsedMs, limitMs = JOB_TIMEOUT_MS) {
  const aborted = error?.code === 'CHAT_ABORTED' || error?.name === 'AbortError';
  if (aborted || elapsedMs >= limitMs - 1000) {
    return `${name} did not finish within ${Math.round(limitMs / 60000)} minutes.`;
  }
  return publicChatError(error).body.message;
}

async function quietly(work, what, meta) {
  try {
    return await work();
  } catch (error) {
    log.warn(`${what} failed`, { ...meta, code: safeErrorCode(error) });
    return null;
  }
}

/**
 * Run one job. deps: { runAgent, sendMail, markRead, runTests, readTestScript, findFile, askCensai, now }.
 * censai(): Censai's model, resolved once per plan. Returns 'done' or 'stuck';
 * throws PlanStopped when the person stopped the plan meanwhile.
 */
export async function runJob({ entry, plan, job, earlier = [], deps, save, censai }) {
  const name = agentName(job.agentId);
  const scope = { workspaceId: plan.workspaceId, userId: plan.userId };
  const meta = { planId: plan.id, part: job.n, agentId: job.agentId };
  const alive = () => { if (entry.stopped) throw new PlanStopped(); };
  // A stop can land during any wait, so every change after a wait goes through here.
  const change = async (mutate) => {
    alive();
    mutate();
    await save();
  };
  const step = (text, state = 'done', { settle = false } = {}) => change(() => (settle ? settleStep : addStep)(job, text, state));
  const stuck = async (why, item = null) => {
    alive();
    job.status = 'stuck';
    job.error = clip(why, 300);
    job.stuckOn = item?.n ?? null;
    settleStep(job, item ? `Stuck on "${clip(item.text, 80)}"` : job.error, 'bad');
    await save();
    log.warn('job stuck', { ...meta, attempts: job.attempts, item: job.stuckOn, why: job.error });
    return 'stuck';
  };

  alive();
  // Pinned work (a Kraken arm) runs only while the project is still the one the person looked at.
  const moved = plan.pin ? await (deps.checkPin || checkPin)(deps.db, scope, plan.pin) : null;
  if (moved) {
    closeChecklist(job, 'the project is not the one you looked at');
    return stuck(moved.why);
  }
  // A call that names no project means the plan's project, at its pinned commit on GitHub (tools/jobProject.js).
  const pinnedRef = plan.pin?.kind === 'github' ? plan.pin.commit || plan.pin.branch : null;
  // A code job on GitHub works on its own branch there and ends in a pull request (jobPr.js).
  // Its turn runs behind the board's fence whatever Trust mode says, so a checkout of the same
  // repo on this computer is never written to in its place (workspaces/ownerTrust.js).
  const onGithub = onGithubBranch(plan, job);
  const fenced = (work) => (onGithub ? runFenced(work) : work());
  // Which plan and job this run is, exactly, so two plans at once each find their own branch (tools/jobRun.js).
  const inProject = (work) => runInPlanJob({ planId: plan.id, part: job.n }, () => fenced(
    () => runInJobProject({ agentId: job.agentId, project: plan.project, ref: pinnedRef, confined: onGithub }, work),
  ));
  const prompt = jobPrompt({ plan, job, earlier, total: plan.jobs.length });
  // Back from waiting on its pull request's checks, which failed: the next try, with what they showed.
  const resuming = job.status === 'sendback';
  const messages = [{ from: 'me', text: prompt }];
  if (resuming) {
    const failed = job.checklist.filter((item) => item.state === 'failed');
    messages.push({ from: job.agentId, text: job.answer || '(no answer)' }, { from: 'me', text: sendBackPrompt(failed) });
  }
  job.status = 'working';
  const handoffId = resuming ? null : await quietly(() => deps.sendMail('censai', job.agentId, prompt, {
    ...scope, messageType: 'work_request', subject: clip(`From Censai: ${job.title}`, 120),
    wake: false, idempotencyKey: `censai-plan:${plan.id}:${job.n}`,
  }), 'hand-off mail', meta);
  if (!resuming) {
    await step(`Handed to ${name}`);
    log.info('job handed off', meta);
  }
  // The agent gets the job right here, so it is not waiting in its mail too.
  if (handoffId) await quietly(() => deps.markRead(handoffId, scope), 'marking the hand-off read', meta);

  // Its branch starts where the person looked, before the agent's first change.
  if (onGithub) {
    const made = await deps.prepareJobBranch({ db: deps.db, plan, job });
    if (!made.ok) {
      closeChecklist(job, 'no branch could be made on GitHub');
      return stuck(made.line);
    }
    await step(made.line);
  }

  // How the tests run before the agent touches anything, so a changed test script cannot pass for them.
  if (!onGithub && plan.project && deps.readTestScript && job.testScript === undefined) {
    job.testScript = await quietly(() => deps.readTestScript({ agentId: job.agentId, project: plan.project, context: scope }), 'reading the test script', meta);
  }

  for (let attempt = resuming ? (job.attempts || 1) + 1 : 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    alive();
    job.attempts = attempt;
    job.status = 'working';
    await step(attempt === 1 ? `${name} is working on it` : `${name} is fixing it`, 'now');
    if (!(await stillRunning(deps, plan))) {
      entry.stopped = true;
      throw new PlanStopped();
    }
    const startedAt = deps.now();
    let turn;
    try {
      turn = await inProject(() => deps.runAgent({
        origin: 'help', agentId: job.agentId, messages, userId: plan.userId,
        workspaceId: plan.workspaceId, loopWorkspaceId: plan.workspaceId,
        conversationId: `censai-plan:${plan.id}:${job.n}`, signal: entry.controller.signal,
        timeoutMs: JOB_TIMEOUT_MS, rounds: JOB_ROUNDS, rememberQuestion: `Censai asked: ${job.task}`,
      }));
    } catch (error) {
      alive();
      log.warn('agent turn failed', { ...meta, attempt, code: safeErrorCode(error) });
      // Nothing of this try was checked, so no earlier tick stands either.
      reopenChecklist(job);
      closeChecklist(job, `${name} did not finish`);
      return stuck(turnError(error, name, deps.now() - startedAt));
    }
    alive();
    const answer = clip(turn?.finalText, MAX_ANSWER_CHARS);
    job.answer = answer;
    const tools = Array.isArray(turn?.toolActions) ? turn.toolActions : [];
    log.info('job answered', { ...meta, attempt, ms: deps.now() - startedAt, tools: tools.length, chars: answer.length });
    const answerId = answer ? await quietly(() => deps.sendMail(job.agentId, 'censai', answer, {
      ...scope, messageType: 'agent_report', threadId: handoffId || undefined, wake: false,
      idempotencyKey: `censai-plan:${plan.id}:${job.n}:answer:${attempt}`,
    }), 'answer mail', meta) : null;
    // Censai reads it now, in the check below.
    if (answerId) await quietly(() => deps.markRead(answerId, scope), 'marking the answer read', meta);
    await step(answer ? `${name} answered` : `${name} sent back an empty answer`, answer ? 'done' : 'bad', { settle: true });

    alive();
    job.status = 'checking';
    const { seen, verdict, parked } = await checkAnswer({
      job, answer, toolActions: tools,
      deps: {
        change,
        step,
        findFile: (item) => inProject(() => deps.findFile({ agentId: job.agentId, project: plan.project, path: item.path, context: scope })),
        runTests: ({ files, projects, shell }) => deps.runTests({
          agentId: job.agentId, project: plan.project, files, projects, shell,
          expectScript: job.testScript ?? null, signal: entry.controller.signal, context: scope,
        }),
        openPr: () => deps.openJobPr({ db: deps.db, plan, job }),
        review: async (reviewMessages) => {
          try {
            return await deps.askCensai(await censai(), reviewMessages, { userId: plan.userId });
          } catch (error) {
            throw new Error(publicChatError(error).body.message, { cause: error });
          }
        },
      },
    });
    alive();
    job.seen = seen;
    if (parked) {
      // Waits for the pull request's checks outside the runner's slots (runner.js looks every little while).
      const since = deps.now();
      job.status = 'waiting_checks';
      job.prWait = { number: parked.number, url: parked.url, sha: parked.headSha, since, until: since + (deps.prChecksWaitMs ?? PR_CHECKS_WAIT_MS), attempt };
      await step(`Pull request #${parked.number} is open. Waiting for its checks on GitHub`, 'now');
      log.info('job waits for checks', { ...meta, attempt, pr: parked.number });
      return 'parked';
    }
    log.info('job checked', { ...meta, attempt, ok: verdict.ok, ...tickCount(job) });
    if (verdict.ok === true) {
      job.status = 'done';
      job.error = null;
      job.stuckOn = null;
      await save();
      return 'done';
    }
    if (verdict.ok === null) return stuck(verdict.item?.line || 'There was nothing on the list to check.', verdict.item);
    const [first] = verdict.items;
    if (attempt >= MAX_ATTEMPTS) return stuck(`${name} tried twice and it still does not check out. ${first.line}`, first);
    await step(`Sent it back to ${name} to fix: ${verdict.items.map((item) => item.text).join('; ')}`, 'note');
    log.info('job sent back', { ...meta, attempt, items: verdict.items.map((item) => item.n) });
    messages.push({ from: job.agentId, text: answer || '(no answer)' }, { from: 'me', text: sendBackPrompt(verdict.items) });
  }
  closeChecklist(job, `${name} did not finish`);
  return stuck(`${name} did not finish.`);
}
