// Censai the orchestrator in the pinned chat: plain words for a plan and its jobs
// (the shape server/censaiOrchestrator/shape.js publicPlan sends). Pure, no React.

const RUNNING = new Set(['queued', 'running']);
const FINISHED = new Set(['done', 'stuck', 'stopped']);

export const planIsRunning = (plan) => RUNNING.has(plan?.status);
export const planIsFinished = (plan) => FINISHED.has(plan?.status);

const PLAN_WORDS = { queued: 'Starting', running: 'Working', done: 'Done and checked', stuck: 'Stuck', stopped: 'Stopped' };
const JOB_WORDS = {
  waiting: 'Waiting its turn', working: 'Working', checking: 'Being checked', done: 'Checked',
  stuck: 'Stuck', stopped: 'Stopped', skipped: 'Did not start',
};
const MARKS = { done: '✓', now: '•', bad: '✗', note: '–' };
// A checklist item: checked off only after Censai checked it itself.
const ITEM_MARKS = { ticked: '✓', failed: '✗', unknown: '–', checking: '•', open: '○' };
const ITEM_WORDS = {
  ticked: 'Checked off', failed: 'Not true yet', unknown: 'Could not check', checking: 'Checking now', open: 'Not checked yet',
};

export const planWord = (status) => PLAN_WORDS[status] || status;
export const jobWord = (status) => JOB_WORDS[status] || status;
export const stepMark = (state) => MARKS[state] || MARKS.now;
export const itemMark = (state) => ITEM_MARKS[state] || ITEM_MARKS.open;
export const itemWord = (state) => ITEM_WORDS[state] || ITEM_WORDS.open;

/** "2 of 3 checked off" (server/censaiOrchestrator/checklist.js tickWords). */
export function checkedOff(job) {
  const items = Array.isArray(job?.checklist) ? job.checklist : [];
  if (!items.length) return '';
  const ticked = items.filter((item) => item.state === 'ticked').length;
  if (items.length === 1) return ticked ? 'Checked off' : 'Not checked off yet';
  return ticked === items.length ? `All ${items.length} checked off` : `${ticked} of ${items.length} checked off`;
}

/** The live card shows the list of the job at work or being checked, and of one that got stuck. */
export const showChecklist = (job) => ['working', 'checking', 'stuck'].includes(job?.status);

function clip(text, max) {
  const flat = String(text ?? '').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * The step lines a job shows on the live card: every step of the job in
 * progress (the newest few), the last line of a finished one, none while
 * it waits its turn.
 */
export function visibleSteps(job, { keep = 5 } = {}) {
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  if (!steps.length || job.status === 'waiting' || job.status === 'skipped') return [];
  if (job.status === 'working' || job.status === 'checking') return steps.slice(-keep);
  return steps.slice(-1);
}

/** What the result message keeps of a plan: enough for the "What I checked" fold, no more. */
export function planSnapshot(plan) {
  return {
    id: plan.id,
    goal: clip(plan.goal, 300),
    status: plan.status,
    jobs: (plan.jobs || []).map((job) => ({
      n: job.n,
      agentId: job.agentId,
      agent: job.agent,
      title: clip(job.title, 120),
      status: job.status,
      error: job.error ? clip(job.error, 300) : null,
      stuckOn: job.stuckOn ?? null,
      checklist: (job.checklist || []).map((item) => ({
        n: item.n, text: clip(item.text, 200), how: item.how, state: item.state, line: clip(item.line, 300),
        ...(item.detail ? { detail: clip(item.detail, 1500) } : {}),
      })),
      seen: (job.seen || []).slice(0, 8).map((line) => clip(line, 300)),
      ...(job.answer ? { answer: clip(job.answer, 1500) } : {}),
    })),
  };
}

/** The one line Censai posts when a plan finishes, with the fold behind it. */
export function planResultMessage(plan, now = Date.now()) {
  const fallback = plan.status === 'done' ? `Done: ${plan.goal}` : `${planWord(plan.status)}: ${plan.goal}`;
  return { from: 'censai', text: plan.summary || fallback, ts: now, plan: planSnapshot(plan) };
}

/** Header line while plans run in the background. */
export function runningLine(count) {
  if (!count) return '';
  return count === 1 ? 'Working on a plan in the background' : `Working on ${count} plans in the background`;
}
