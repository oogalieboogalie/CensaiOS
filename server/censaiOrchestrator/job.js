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
import { publicChatError } from '../routes/chat/httpErrors.js';
import { checkAnswer } from './check.js';
import { closeChecklist, reopenChecklist, tickCount } from './checklist.js';
import { jobPrompt, sendBackPrompt } from './prompts.js';
import { MAX_ANSWER_CHARS, MAX_ATTEMPTS, addStep, agentName, clip, settleStep } from './shape.js';

const log = createLogger('censai-orchestrator');
const configured = Number(process.env.CENSAI_JOB_TIMEOUT_MS) || 8 * 60 * 1000;
export const JOB_TIMEOUT_MS = Math.min(30 * 60 * 1000, Math.max(30_000, configured));

/** Thrown inside a job once the person stopped the plan; the plan is already saved as stopped. */
export class PlanStopped extends Error {}

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
    log.warn(`${what} failed`, { ...meta, error: error?.message });
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
  const prompt = jobPrompt({ plan, job, earlier, total: plan.jobs.length });
  job.status = 'working';
  const handoffId = await quietly(() => deps.sendMail('censai', job.agentId, prompt, {
    ...scope, messageType: 'work_request', subject: clip(`From Censai: ${job.title}`, 120),
    wake: false, idempotencyKey: `censai-plan:${plan.id}:${job.n}`,
  }), 'hand-off mail', meta);
  await step(`Handed to ${name}`);
  log.info('job handed off', meta);
  // The agent gets the job right here, so it is not waiting in its mail too.
  if (handoffId) await quietly(() => deps.markRead(handoffId, scope), 'marking the hand-off read', meta);

  // How the tests run before the agent touches anything, so a changed test script cannot pass for them.
  if (plan.project && deps.readTestScript && job.testScript === undefined) {
    job.testScript = await quietly(() => deps.readTestScript({ agentId: job.agentId, project: plan.project, context: scope }), 'reading the test script', meta);
  }

  const messages = [{ from: 'me', text: prompt }];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    alive();
    job.attempts = attempt;
    job.status = 'working';
    await step(attempt === 1 ? `${name} is working on it` : `${name} is fixing it`, 'now');
    const startedAt = deps.now();
    let turn;
    try {
      turn = await deps.runAgent({
        origin: 'help', agentId: job.agentId, messages, userId: plan.userId,
        workspaceId: plan.workspaceId, loopWorkspaceId: plan.workspaceId,
        conversationId: `censai-plan:${plan.id}:${job.n}`, signal: entry.controller.signal,
        timeoutMs: JOB_TIMEOUT_MS, rememberQuestion: `Censai asked: ${job.task}`,
      });
    } catch (error) {
      alive();
      log.warn('agent turn failed', { ...meta, attempt, code: error?.code, error: error?.message });
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
    const { seen, verdict } = await checkAnswer({
      job, answer, toolActions: tools,
      deps: {
        change,
        step,
        findFile: (item) => deps.findFile({ agentId: job.agentId, project: plan.project, path: item.path, context: scope }),
        runTests: ({ files, projects, shell }) => deps.runTests({
          agentId: job.agentId, project: plan.project, files, projects, shell,
          expectScript: job.testScript ?? null, signal: entry.controller.signal, context: scope,
        }),
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
