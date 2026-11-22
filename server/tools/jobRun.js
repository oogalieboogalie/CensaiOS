// Which plan and which of its jobs a run belongs to, exactly.
//
// A tool call made while a family agent works a job of Censai's knows the
// job's project (jobProject.js) but not the plan it came from. With two plans
// running for the same agent in the same project, the job's branch and pull
// request (handlers/writeBranch.js, handlers/workerPr.js) must be the ones of
// the plan this run belongs to, never a guess. Whoever starts the run wraps it
// in runInPlanJob: the plan runner does for every job's turn and its checks
// (censaiOrchestrator/job.js). A run that does not say, with a second matching
// job in hand, is refused.

import { AsyncLocalStorage } from 'node:async_hooks';

const planJobForRun = new AsyncLocalStorage();

/** Run `fn` as work on job number `part` of plan `planId` (no plan id: nothing changes). */
export function runInPlanJob({ planId, part }, fn) {
  if (!planId) return fn();
  return planJobForRun.run({ planId: String(planId), part: Number(part) || 0 }, fn);
}

/** { planId, part } of the plan job running right now, or null when the run did not say. */
export function planJobRun() {
  return planJobForRun.getStore() || null;
}
