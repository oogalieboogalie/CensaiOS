// Censai the orchestrator: what a plan and its jobs look like. Pure, no database.
//
// A plan is what Censai hands out from one ask: a goal and 1-4 jobs, each
// for one family agent. Each job carries its checklist (what must be true
// before it counts as done, checked off item by item in check.js), a list of
// steps (one plain line per stage, so the chat never shows a spinner alone)
// and what Censai saw of the work.

import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import { familyDefaultToolNames } from '../tools/rbac/familyBaseline.js';

export const MAX_JOBS = 4;
export const MAX_ATTEMPTS = 2;
export const MAX_ANSWER_CHARS = 6000;
const MAX_GOAL = 300;
const MAX_TASK = 2000;
const MAX_STEPS = 16;
export const MAX_ITEMS = 6;
const MAX_ITEM = 200;
const CHECKS = new Set(['answer', 'file', 'tests']);
// A claim that tests pass is checked by running them, never taken from the reply:
// an item that is only that claim becomes a test run, and any other item that
// makes it brings a test run onto the list for the read-over to see.
const PURE_TESTS = /^(?:all |the |its )?(?:project'?s )?(?:own )?(?:unit )?tests? (?:still )?(?:all )?pass(?:es)?(?: again)?\.?$/i;
const TESTS_CLAIM = /\btests?\b.*\bpass(?:es|ing)?\b/i;
const NOT_A_CLAIM = /\b(?:not|never|why|whether|if|fail\w*)\b|n't/i;
const claimsTestsPass = (text) => TESTS_CLAIM.test(text) && !NOT_A_CLAIM.test(text);
export const TESTS_ITEM = 'The project\'s tests pass';
export const ANSWER_ITEM = 'The job is done as asked';
// Files no test reads, so changing only these brings no test run.
export const DOC_FILE = /\.(?:md|mdx|markdown|txt|rst|adoc|png|jpe?g|gif|webp|ico)$/i;

export const HANDOFF_AGENTS = Object.freeze(['atlas', 'nexus', 'foundation', 'genesis', 'echo', 'architect', 'phoenix']);
// Who can change project files (the rest can read them): from their tool lists.
export const FILE_CHANGERS = Object.freeze(HANDOFF_AGENTS.filter((id) => familyDefaultToolNames(id).includes('project_write')));
export const FINAL_PLAN = new Set(['done', 'stuck', 'stopped']);
export const FINAL_JOB = new Set(['done', 'stuck', 'stopped', 'skipped']);

export class PlanInputError extends Error {}

export function clip(text, max) {
  const flat = String(text ?? '').trim();
  if (flat.length <= max) return flat;
  // Never cut between the two halves of an emoji: the database refuses half of one.
  const end = /[\ud800-\udbff]/.test(flat[max - 2]) ? max - 2 : max - 1;
  return `${flat.slice(0, end).trimEnd()}…`;
}

export function agentName(agentId) {
  const id = String(agentId || '').toLowerCase();
  return FAMILY_AGENT_BY_ID[id]?.name || (id ? id[0].toUpperCase() + id.slice(1) : 'the family');
}

export function nameList(ids, joiner = 'or') {
  const names = ids.map(agentName);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${joiner} ${names[names.length - 1]}`;
}

/** "Nexus", "nexus", "The Architect" -> the agent id Censai can hand work to, or null. */
export function handoffAgentId(value) {
  const id = String(value || '').trim().toLowerCase().replace(/^the\s+/, '');
  return HANDOFF_AGENTS.includes(id) ? id : null;
}

function jobTitle(task) {
  const first = String(task).split(/\n|(?<=[.!?])\s/)[0];
  return clip(first, 80);
}

function listOf(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON: fall through */ }
  }
  return [];
}

/** A file path inside the project: no drive, no leading slash, no "..". */
function projectPath(raw, where) {
  const value = String(raw || '').trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!value || value.length > 300 || /^([a-z]:|\/)/i.test(value) || value.split('/').includes('..')) {
    throw new PlanInputError(`${where}: give the file's path inside the project, such as src/Header.jsx (path).`);
  }
  return value;
}

function checklistItem(raw, where) {
  const entry = typeof raw === 'string' ? { item: raw } : (raw || {});
  const text = clip(entry.item ?? entry.text, MAX_ITEM);
  if (!text) throw new PlanInputError(`${where}: say what must be true (item).`);
  const asked = String(entry.check || '').toLowerCase();
  let how = CHECKS.has(asked) ? asked : (entry.path ? 'file' : 'answer');
  if (how === 'answer' && PURE_TESTS.test(text)) how = 'tests';
  if (how !== 'file') return { text, how };
  if (!entry.path) throw new PlanInputError(`${where}: say which file must exist (path).`);
  return { text, how, path: projectPath(entry.path, where) };
}

/**
 * The job's checklist from Censai's plan (checklist, or done_when as one
 * item). Code work always carries the project's tests, and every list has at
 * least one item read against the reply, so the job itself is checked too.
 */
function normalizeChecklist(entry, n, kind) {
  const raw = listOf(entry?.checklist);
  const given = raw.length ? raw : [entry?.done_when ?? entry?.doneWhen].filter(Boolean);
  if (!given.length) {
    throw new PlanInputError(`Job ${n}: give a checklist (checklist): the things that must be true before it counts as done.`);
  }
  if (given.length > MAX_ITEMS) throw new PlanInputError(`Job ${n}: at most ${MAX_ITEMS} checklist items.`);
  const items = [];
  for (const [index, value] of given.entries()) {
    const item = checklistItem(value, `Job ${n}, item ${index + 1}`);
    if (!items.some((seen) => seen.text.toLowerCase() === item.text.toLowerCase())) items.push(item);
  }
  const wantsTests = kind === 'code' || items.some((item) => item.how === 'answer' && claimsTestsPass(item.text));
  if (wantsTests && !items.some((item) => item.how === 'tests')) items.push({ text: TESTS_ITEM, how: 'tests', auto: true });
  if (!items.some((item) => item.how === 'answer')) items.unshift({ text: ANSWER_ITEM, how: 'answer', auto: true });
  return items.map((item, index) => ({ n: index + 1, ...item, state: 'open', line: '' }));
}

/** Check Censai's hand_off_jobs arguments. Throws PlanInputError with words for Censai. */
export function normalizePlanInput(args = {}) {
  const goal = clip(args.goal, MAX_GOAL);
  if (!goal) throw new PlanInputError('Say the goal in one plain sentence (goal).');
  const raw = listOf(args.jobs);
  if (!raw.length) throw new PlanInputError('Give at least one job (jobs), each with agent, job and checklist.');
  if (raw.length > MAX_JOBS) throw new PlanInputError(`At most ${MAX_JOBS} jobs in one plan. Keep it to the next few steps.`);
  const jobs = raw.map((entry, index) => {
    const agentId = handoffAgentId(entry?.agent);
    if (!agentId) {
      throw new PlanInputError(`Job ${index + 1}: "${clip(entry?.agent, 40)}" is not a family member I can hand work to. Use ${nameList(HANDOFF_AGENTS)}.`);
    }
    const task = clip(entry?.job ?? entry?.task, MAX_TASK);
    if (!task) throw new PlanInputError(`Job ${index + 1}: say what ${agentName(agentId)} should do (job).`);
    const kind = String(entry?.kind || '').toLowerCase() === 'code' ? 'code' : 'answer';
    if (kind === 'code' && !FILE_CHANGERS.includes(agentId)) {
      throw new PlanInputError(`Job ${index + 1}: ${agentName(agentId)} can read project files but not change them. Code and file work goes to ${nameList(FILE_CHANGERS)}.`);
    }
    return {
      n: index + 1,
      agentId,
      title: jobTitle(task),
      task,
      kind,
      checklist: normalizeChecklist(entry, index + 1, kind),
      status: 'waiting',
      attempts: 0,
      answer: '',
      error: null,
      stuckOn: null,
      steps: [],
      seen: [],
    };
  });
  const project = clip(args.project, 200) || null;
  const looksForFile = jobs.find((job) => job.checklist.some((item) => item.how === 'file'));
  if (looksForFile && !project) throw new PlanInputError(`Job ${looksForFile.n}: a file check needs the project the file is in (project).`);
  // The tests run in the project's own folder, never in a guessed one.
  const runsTests = jobs.find((job) => job.checklist.some((item) => item.how === 'tests'));
  if (runsTests && !project) {
    const what = runsTests.kind === 'code' ? 'code work' : 'running the tests';
    throw new PlanInputError(`Job ${runsTests.n}: ${what} needs the project it is in (project), so I know where to run its tests.`);
  }
  return { goal, project, jobs };
}

function stamp(now) {
  return new Date(now ?? Date.now()).toISOString();
}

/** Add one step line. state: done | now (in progress) | bad | note. */
export function addStep(job, text, state = 'done', now) {
  job.steps.push({ at: stamp(now), text: clip(text, 240), state });
  if (job.steps.length > MAX_STEPS) job.steps.splice(0, job.steps.length - MAX_STEPS);
  return job;
}

/** Finish the step in progress with its outcome (or add one when none is in progress). */
export function settleStep(job, text, state = 'done', now) {
  const last = job.steps[job.steps.length - 1];
  if (last?.state === 'now') {
    job.steps[job.steps.length - 1] = { at: stamp(now), text: clip(text, 240), state };
    return job;
  }
  return addStep(job, text, state, now);
}

function publicItem({ n, text, how, path, auto, state, line, detail }) {
  return {
    n, text, how, state, line: line || '',
    ...(path ? { path } : {}), ...(auto ? { auto: true } : {}), ...(detail ? { detail: clip(detail, 1500) } : {}),
  };
}

function publicJob(job, { withAnswers }) {
  return {
    n: job.n,
    agentId: job.agentId,
    agent: agentName(job.agentId),
    title: job.title,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    error: job.error || null,
    stuckOn: job.stuckOn ?? null,
    checklist: (Array.isArray(job.checklist) ? job.checklist : []).map(publicItem),
    steps: Array.isArray(job.steps) ? job.steps : [],
    seen: Array.isArray(job.seen) ? job.seen.slice(0, 8) : [],
    ...(withAnswers ? { answer: clip(job.answer, 4000) } : {}),
  };
}

/** A plan row as the browser and Censai's tools see it. */
export function publicPlan(row, { withAnswers = false } = {}) {
  if (!row) return null;
  const iso = (value) => (value ? new Date(value).toISOString() : null);
  return {
    id: row.id,
    goal: row.goal,
    project: row.project || null,
    status: row.status,
    summary: row.summary || null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    finishedAt: iso(row.finished_at),
    reportedAt: iso(row.reported_at),
    jobs: (Array.isArray(row.jobs) ? row.jobs : []).map((job) => publicJob(job, { withAnswers })),
  };
}
