// hand_off_jobs / jobs_status / stop_jobs: Censai the orchestrator (server/censaiOrchestrator).
// Plans belong to the person chatting on this board: only they see the plan card,
// its checks and its result, and only they stop it. The hand-offs and answers
// themselves are family mail, so the board's Family desk shows them like any other.
import pool from '../../db.js';
import { dbReady } from '../../dbState.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { TRUSTED_ROLES, agentIsTrusted } from '../../approvals/trustMode.js';
import { PlanInputError, agentName, clip, normalizePlanInput, publicPlan } from '../../censaiOrchestrator/shape.js';
import { tickWords } from '../../censaiOrchestrator/checklist.js';
import { whyNoTestsHere, whyTestsCannotRun } from '../../censaiOrchestrator/projectTests.js';
import { HANDOFF_GIVER } from '../../censaiOrchestrator/projectShare.js';
import { folderIsOtherRepo, planProject } from '../../censaiOrchestrator/planProject.js';
import { MAX_OPEN_PLANS, countOpenPlans, getPlan, listPlans } from '../../censaiOrchestrator/store.js';
import { createPlan, recoverOnce, stopPlan } from '../../censaiOrchestrator/runner.js';

const JOB_WORDS = {
  waiting: 'not started yet',
  working: 'working on it',
  checking: 'being checked',
  done: 'done and checked',
  stuck: 'stuck',
  stopped: 'stopped',
  skipped: 'did not start',
  waiting_checks: 'waiting for the pull request\'s checks',
  sendback: 'sent back to fix what the checks found',
};
const ITEM_MARKS = { ticked: '[x]', failed: '[ ] not yet:', unknown: '[?] could not check:', checking: '[ ] checking:', open: '[ ]' };

/** A plan as Censai reads it in a tool result. */
export function planText(plan, { answers = false } = {}) {
  const lines = [`Plan ${plan.id} (${plan.status}): ${plan.goal}${plan.project ? ` [project: ${plan.project}]` : ''}`];
  if (plan.summary) lines.push(`Result told to the person: ${plan.summary}`);
  for (const job of plan.jobs) {
    lines.push(`${job.n}. ${job.agent}: ${job.title} - ${JOB_WORDS[job.status] || job.status} (${tickWords(job).toLowerCase()})`);
    const last = job.steps[job.steps.length - 1];
    if (last && ['working', 'checking'].includes(job.status)) lines.push(`   now: ${last.text}`);
    for (const item of job.checklist) {
      lines.push(`   ${ITEM_MARKS[item.state] || '[ ]'} ${item.text}${item.line && item.state !== 'open' ? ` - ${item.line}` : ''}`);
    }
    if (job.error) lines.push(`   why: ${job.error}`);
    if (answers && job.answer) lines.push(`   answer: ${clip(job.answer, 1500)}`);
  }
  return lines.join('\n');
}

function scopeOf(context) {
  const workspaceId = context.workspaceId;
  const userId = Number(context.userId);
  if (!workspaceId || !Number.isInteger(userId) || userId <= 0) return null;
  // Typed at this computer: an owner-only refusal may name the owner account.
  return context.atThisComputer === true ? { workspaceId, userId, atThisComputer: true } : { workspaceId, userId };
}

// Code changes and test runs are the computer owner's (server/tools/rbac/hostOwnerOnly.js),
// so a job that needs them could never be checked off for anyone else: refuse it now.
async function ownerGap(input, scope, db, deps) {
  const job = input.jobs.find((entry) => entry.kind === 'code' || entry.checklist.some((item) => item.how === 'tests'));
  if (!job) return null;
  const why = await (deps.whyTestsCannotRun || whyTestsCannotRun)(db, scope);
  if (!why) return null;
  return [
    `Error: ${why} Job ${job.n} changes code or needs the project's tests, so it could never be checked off for this person.`,
    'Hand out jobs that look into it and write up what to change instead, and tell the person that code changes here need this computer\'s owner.',
  ].join(' ');
}

// The tests run in the project's folder on this computer, so a job that needs them
// could never be checked off in a project that has none here (on GitHub only, say).
// The folder is looked up as Censai: each family member works in the plan's project
// with Censai's own access to it on this board while the plan runs (projectShare.js).
async function projectGap(input, scope, db, deps, repo = null) {
  const job = input.jobs.find((entry) => entry.checklist.some((item) => item.how === 'tests'));
  if (!job) return null;
  const why = await (deps.whyNoTestsHere || whyNoTestsHere)({ agentId: HANDOFF_GIVER, project: input.project, context: scope });
  if (!why) return null;
  const hint = await folderHereHint(input, scope, db, why, repo);
  const instead = 'hand out jobs that look into it and write up what to change instead, and tell the person why.';
  return `Error: ${why} Job ${job.n} needs the project's tests, so it could never be checked off. `
    + (hint ? `${hint} If not, ${instead}` : `${instead[0].toUpperCase()}${instead.slice(1)}`);
}

// A row kept on GitHub with no checkout of it here is refused. When Censai's own
// project here might be the same code (its folder names no GitHub repo), name it,
// so a retry there needs no guessing; a folder that is known other code is not offered.
async function folderHereHint(input, scope, db, why, repo) {
  if (!/lives on GitHub/.test(why)) return '';
  let own = null;
  try {
    own = await planProject(db, { ...scope, project: null });
  } catch { /* quiet: with no project to name, the refusal stays the plain one */ }
  if (!own?.path || own.repo || own.id === input.project) return '';
  if (await folderIsOtherRepo(own.path, repo)) return '';
  return `Your own project on this board, "${own.name}", has its folder on this computer: if it is the same code, `
    + `hand off again with project "${own.name}".`;
}

// A code job's agent saves files with project_write. Those go through without
// waiting only for a person who could OK them themselves with trust mode on
// (server/approvals/requests.js). A job whose saves would wait could never be
// checked off: refuse it now.
async function writerGap(input, scope, member, db) {
  for (const job of input.jobs.filter((entry) => entry.kind === 'code')) {
    const name = agentName(job.agentId);
    const where = { workspaceId: scope.workspaceId, agentId: job.agentId };
    if (!TRUSTED_ROLES.includes(member?.role) || !await agentIsTrusted(db, where)) {
      return [
        `Error: ${name}'s file saves for this person wait for an OK in Action Approvals (trust mode is off,`,
        `or the person is not this board's owner or admin), so job ${job.n} could not be checked off while it waits.`,
        'Tell the person, or hand out a job that looks into it and writes up what to change instead.',
      ].join(' ');
    }
  }
  return null;
}

/** Why this plan could never be checked off for this person here ("Error: ..."), or null when it can. */
export async function handOffGap(input, scope, member, db, deps = {}, repo = null) {
  return await ownerGap(input, scope, db, deps) || await projectGap(input, scope, db, deps, repo)
    || await writerGap(input, scope, member, db);
}

/** Whether a job in the plan is checked by this computer's tests, read the way the plan itself reads its list. */
function needsTestsHere(args) {
  try {
    return normalizePlanInput({ ...args, project: args.project || 'any' }).jobs
      .some((job) => job.checklist.some((item) => item.how === 'tests'));
  } catch { /* quiet: a plan that does not read here is refused just below, with the reason */
    return false;
  }
}

async function handOff(args, scope, db, deps) {
  // Viewers can look at a board but not set work running on it.
  const member = await requireWorkspaceMember(db, { ...scope, roles: ['owner', 'admin', 'member'] });
  // The plan's project is found once, by the board's rules, and kept by its id
  // (planProject.js): no name means Censai's own project on this board.
  // A job checked by this computer's tests needs the project's folder here (planProject.js).
  const testsHere = needsTestsHere(args);
  const pinned = await planProject(db, { ...scope, project: args.project, testsHere });
  let input;
  try {
    input = normalizePlanInput(pinned ? { ...args, project: pinned.id } : args);
  } catch (error) {
    if (error instanceof PlanInputError) return `Error: ${error.message}`;
    throw error;
  }
  const gap = await handOffGap(input, scope, member, db, deps, pinned?.repo || null);
  if (gap) return gap;
  await recoverOnce(deps);
  if (await countOpenPlans(db, scope) >= MAX_OPEN_PLANS) {
    return `Error: ${MAX_OPEN_PLANS} plans are already running for this person. Wait for one to finish, or stop one with stop_jobs.`;
  }
  const row = await createPlan({ ...scope, ...input }, deps);
  const plan = publicPlan(row);
  return [
    planText(plan),
    '',
    'Handed off; it has only started. The person sees every step and every item in this chat, and one line once every item is checked off, or where it got stuck.',
    'Tell them the plan in a few plain lines. Do not say it is done.',
  ].join('\n');
}

const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_PLAN = 'Error: No plan of this person has that id.';

async function status(args, scope, db) {
  if (args.plan_id) {
    const id = String(args.plan_id).trim();
    const row = PLAN_ID.test(id) ? await getPlan(db, { ...scope, id }) : null;
    return row ? planText(publicPlan(row, { withAnswers: true }), { answers: true }) : NO_PLAN;
  }
  const rows = await listPlans(db, { ...scope, open: !args.include_finished, limit: 5 });
  if (!rows.length) return args.include_finished ? 'There are no plans for this person yet.' : 'No plans are open for this person.';
  return rows.map((row) => planText(publicPlan(row, { withAnswers: true }), { answers: true })).join('\n\n');
}

async function stop(args, scope, db, deps) {
  await requireWorkspaceMember(db, { ...scope, roles: ['owner', 'admin', 'member'] });
  let id = args.plan_id ? String(args.plan_id).trim() : null;
  if (id && !PLAN_ID.test(id)) return NO_PLAN;
  if (!id) {
    const open = (await listPlans(db, { ...scope, open: true, limit: 10 }))
      .find((row) => ['queued', 'running'].includes(row.status));
    if (!open) return 'No plan is running for this person.';
    id = open.id;
  }
  const row = await stopPlan({ ...scope, id }, deps);
  if (!row) return NO_PLAN;
  return row.status === 'stopped' ? `Stopped. ${row.summary || ''}`.trim() : `That plan had already finished (${row.status}).`;
}

export async function handleCensaiPlanTool(agentId, name, args = {}, context = {}, db = pool, deps = {}) {
  if (String(agentId || '').toLowerCase() !== 'censai') return 'Error: Only Censai hands out plans to the family.';
  if (db === pool && !dbReady()) return 'Error: The database is not running, so I cannot keep track of jobs right now.';
  const scope = scopeOf(context);
  if (!scope) return 'Error: There is no board and signed-in person here to run jobs for.';
  try {
    // onGithub is the Kraken's to set (a fix pinned to a GitHub repo), never a chat hand-off's.
    if (name === 'hand_off_jobs') return await handOff({ ...args, onGithub: false }, scope, db, deps);
    if (name === 'jobs_status') return await status(args, scope, db);
    if (name === 'stop_jobs') return await stop(args, scope, db, deps);
    return `Error: Unknown plan tool ${name}.`;
  } catch (error) {
    if (error.statusCode === 403) return 'Error: This person can look at this board but not start or stop work on it.';
    return `Error: ${clip(error.message || 'the jobs could not be handled', 200)}`;
  }
}

export const PLAN_TOOL_HANDLERS = Object.freeze({
  hand_off_jobs: handleCensaiPlanTool,
  jobs_status: handleCensaiPlanTool,
  stop_jobs: handleCensaiPlanTool,
});
