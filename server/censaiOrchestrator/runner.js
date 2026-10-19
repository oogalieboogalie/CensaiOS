// Censai the orchestrator: runs plans in the background, one job at a time, at
// most MAX_RUNNING plans at once in this server. Each job's checklist is
// checked off (job.js) before the next job starts or the person hears about
// it; a stuck job stops the plan, so later jobs never build on unchecked
// work, and a plan is done only when every item on every list is checked off.
//
// Plans live in censai_plans (store.js). After a restart, a plan that was
// between jobs carries on; a job that was cut off midway is marked stuck
// instead of being run twice.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { PlanStopped, runJob } from './job.js';
import { finish, markStopped, planFromRow, skipRest, stickJob } from './planState.js';
import { reportMessages, summaryLine } from './prompts.js';
import { FINAL_JOB, FINAL_PLAN, agentName } from './shape.js';
import { getPlan, insertPlan, listUnfinished, loadPlan, savePlan } from './store.js';

const log = createLogger('censai-orchestrator');
export const MAX_RUNNING = 2;

export const DEFAULT_DEPS = Object.freeze({
  db: pool,
  now: () => Date.now(),
  runAgent: async (input) => (await import('../runEngine/index.js')).runAgentTurn(input),
  sendMail: async (from, to, content, opts) => (await import('../memory.js')).sendAgentMessage(from, to, content, opts),
  markRead: async (id, opts) => (await import('../memory.js')).markMessageRead(id, opts),
  runTests: async (input) => (await import('./projectTests.js')).runProjectTests(input),
  readTestScript: async (input) => (await import('./projectTests.js')).readTestScript(input),
  findFile: async (input) => (await import('./projectFiles.js')).findProjectFile(input),
  censaiModel: async (input) => (await import('./model.js')).censaiModel(input),
  askCensai: async (model, messages, opts) => (await import('./model.js')).askCensai(model, messages, opts),
});

const running = new Map(); // plan id -> { id, plan, controller, stopped, chain, done }
const waiting = []; // [{ id, deps }]

const withDefaults = (deps = {}) => ({ ...DEFAULT_DEPS, ...deps });
const isQueued = (id) => running.has(id) || waiting.some((item) => item.id === id);

// One save after another, each writing the plan as it is by then, so the last write holds the latest state.
function saveEntry(entry, deps) {
  entry.chain = entry.chain.then(() => savePlan(deps.db, entry.plan)).catch((error) => {
    log.warn('plan not saved', { planId: entry.id, error: error.message });
  });
  return entry.chain;
}

async function finalLine(plan, censai, deps) {
  if (plan.status !== 'done') return summaryLine(plan);
  try {
    return summaryLine(plan, await deps.askCensai(await censai(), reportMessages(plan), { userId: plan.userId, reasoning: false }));
  } catch (error) {
    log.warn('report sentence not written, using the plain one', { planId: plan.id, error: error.message });
    return summaryLine(plan);
  }
}

async function runPlan(entry, deps) {
  const row = await loadPlan(deps.db, entry.id);
  if (!row || FINAL_PLAN.has(row.status) || entry.stopped) return;
  const plan = planFromRow(row);
  entry.plan = plan;
  const save = () => saveEntry(entry, deps);
  plan.status = 'running';
  await save();
  log.info('plan started', { planId: plan.id, parts: plan.jobs.length, agents: plan.jobs.map((job) => job.agentId) });
  let model = null;
  const censai = async () => {
    model ||= await deps.censaiModel({ userId: plan.userId, workspaceId: plan.workspaceId, goal: plan.goal });
    return model;
  };
  try {
    for (const job of plan.jobs) {
      if (job.status === 'done') continue;
      // Stuck or cut off before a restart: never build on it. finish() below says where it stopped.
      if (FINAL_JOB.has(job.status)) break;
      const earlier = plan.jobs.filter((done) => done.n < job.n && done.status === 'done');
      const outcome = await runJob({ entry, plan, job, earlier, deps, save, censai });
      if (entry.stopped) return;
      if (outcome !== 'done') {
        plan.status = 'stuck';
        skipRest(plan);
        break;
      }
    }
    if (plan.status === 'running') finish(plan);
    const line = await finalLine(plan, censai, deps);
    if (entry.stopped) return;
    plan.summary = line;
    await save();
    log.info(`plan ${plan.status}`, { planId: plan.id, parts: plan.jobs.length });
  } catch (error) {
    if (error instanceof PlanStopped || entry.stopped) return;
    // Something on my side broke: say so instead of leaving the plan running.
    log.error('plan failed', { planId: plan.id, error: error.message });
    const job = plan.jobs.find((item) => !FINAL_JOB.has(item.status));
    stickJob(plan, job, { why: 'something went wrong on my side', error: 'Something went wrong on my side while running this part.' });
    await save();
  }
}

function pump() {
  while (running.size < MAX_RUNNING && waiting.length) {
    const { id, deps } = waiting.shift();
    const entry = { id, plan: null, controller: new AbortController(), stopped: false, chain: Promise.resolve() };
    running.set(id, entry);
    entry.done = runPlan(entry, withDefaults(deps))
      .catch((error) => log.error('plan crashed', { planId: id, error: error.message }))
      .finally(() => {
        running.delete(id);
        pump();
      });
  }
}

export function startPlan(id, deps = {}) {
  if (isQueued(id)) return;
  waiting.push({ id, deps });
  pump();
}

/** Save a checked-in plan and start it in the background. Returns the saved row. */
export async function createPlan({ workspaceId, userId, goal, project, jobs }, deps = {}) {
  const row = await insertPlan(withDefaults(deps).db, { workspaceId, userId, goal, project, jobs });
  log.info('plan made', { planId: row.id, parts: jobs.length, agents: jobs.map((job) => job.agentId) });
  startPlan(row.id, deps);
  return row;
}

/** Stop the person's plan. Returns the saved row, or null when it is not theirs. */
export async function stopPlan({ id, workspaceId, userId }, deps = {}) {
  const all = withDefaults(deps);
  const row = await getPlan(all.db, { id, workspaceId, userId });
  if (!row) return null;
  if (FINAL_PLAN.has(row.status)) return row;
  const entry = running.get(id);
  if (entry?.plan) {
    entry.stopped = true;
    entry.controller.abort();
    markStopped(entry.plan);
    await saveEntry(entry, all);
    log.info('plan stopped', { planId: id });
    return loadPlan(all.db, id);
  }
  if (entry) entry.stopped = true;
  const queued = waiting.findIndex((item) => item.id === id);
  if (queued >= 0) waiting.splice(queued, 1);
  const plan = planFromRow(row);
  markStopped(plan);
  log.info('plan stopped before it started', { planId: id });
  // Null when it finished meanwhile: then the finished plan stands.
  return (await savePlan(all.db, plan)) || loadPlan(all.db, id);
}

async function recover(deps) {
  const rows = await listUnfinished(deps.db);
  let carriedOn = 0;
  let cutOff = 0;
  for (const row of rows) {
    if (isQueued(row.id)) continue;
    const plan = planFromRow(row);
    const job = plan.jobs.find((item) => item.status === 'working' || item.status === 'checking');
    if (!job) {
      startPlan(row.id, deps);
      carriedOn += 1;
      continue;
    }
    stickJob(plan, job, {
      why: 'censaiOS restarted',
      error: `censaiOS restarted while ${agentName(job.agentId)} was working on this. Ask me to run it again.`,
      step: 'Cut off when censaiOS restarted',
    });
    await savePlan(deps.db, plan);
    cutOff += 1;
  }
  if (rows.length) log.info('picked up plans from before a restart', { carriedOn, cutOff });
}

let recovering = null;
/** Once per server start, before the first plan: pick up plans an earlier run left. */
export function recoverOnce(deps = {}) {
  recovering ||= recover(withDefaults(deps)).catch((error) => {
    recovering = null;
    log.warn('could not pick up earlier plans', { error: error.message });
  });
  return recovering;
}

/** For tests: wait for a plan running here to finish. */
export function planSettled(id) {
  return running.get(id)?.done || Promise.resolve();
}

/** For tests: forget everything this server is running. */
export function resetPlansForTests() {
  for (const entry of running.values()) entry.stopped = true;
  running.clear();
  waiting.length = 0;
  recovering = null;
}
