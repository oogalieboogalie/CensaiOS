// Censai the orchestrator: a plan's state as the runner moves it along
// (runner.js). Pure: no database and no waiting. However a job ends, its
// checklist ends with no item left open, so a check that never ran is said.

import { allTicked, checklistOf, closeChecklist, reopenChecklist } from './checklist.js';
import { summaryLine } from './prompts.js';
import { settleStep } from './shape.js';

/** A plan row as the runner works on it. */
export function planFromRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    goal: row.goal,
    project: row.project || null,
    status: row.status,
    summary: row.summary || null,
    jobs: (Array.isArray(row.jobs) ? row.jobs : []).map((job) => ({
      ...job,
      steps: [...(job.steps || [])],
      seen: [...(job.seen || [])],
      checklist: (job.checklist || []).map((item) => ({ ...item })),
    })),
  };
}

export function skipRest(plan) {
  for (const job of plan.jobs) {
    if (job.status !== 'waiting') continue;
    job.status = 'skipped';
    closeChecklist(job, 'this part did not start');
  }
}

/** A job cut off midway: ticks from an earlier try no longer stand while the agent was redoing the work. */
export function cutOff(job, why) {
  if (job.status === 'working') reopenChecklist(job);
  closeChecklist(job, why);
}

export function markStopped(plan) {
  plan.status = 'stopped';
  for (const job of plan.jobs) {
    if (job.status === 'working' || job.status === 'checking') {
      cutOff(job, 'you stopped the plan');
      job.status = 'stopped';
      settleStep(job, 'Stopped, as you asked', 'note');
    }
  }
  skipRest(plan);
  plan.summary = summaryLine(plan);
}

/** Done means every job is done with every item checked off; anything less is stuck on the first gap. */
export function finish(plan) {
  const gap = plan.jobs.find((job) => job.status !== 'done' || !allTicked(job));
  if (!gap) {
    plan.status = 'done';
    return;
  }
  gap.status = 'stuck';
  gap.error ||= 'Not every item on this part\'s list was checked off.';
  gap.stuckOn ??= checklistOf(gap).find((item) => item.state !== 'ticked')?.n ?? null;
  closeChecklist(gap, 'the part stopped here');
  plan.status = 'stuck';
  skipRest(plan);
}

/** A job that cannot carry on: stuck with why, the rest of the plan skipped and said. */
export function stickJob(plan, job, { why, error, step = error }) {
  if (job) {
    cutOff(job, why);
    job.status = 'stuck';
    job.error = error;
    settleStep(job, step, 'bad');
  }
  plan.status = 'stuck';
  skipRest(plan);
  plan.summary = summaryLine(plan);
}
