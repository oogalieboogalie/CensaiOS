// A job Censai hands off (server/censaiOrchestrator/job.js) names its project
// once, in the job's words. While the family member works that job, a tool
// call that names no project means that project: its file tools and its test
// runs land where the plan's own checks look.
//
// Before this, a call that named none went to the member's own project on the
// board (the one its window is set to), so its saves landed in another project,
// and run_tests ran this app's own tests. Censai then found nothing changed in
// the plan's project and the plan stopped, stuck. A call that names a project
// is unchanged, and so is every call outside a job.

import { AsyncLocalStorage } from 'node:async_hooks';

const jobForRun = new AsyncLocalStorage();

const key = (agentId) => String(agentId || '').trim().toLowerCase();

/** Run `fn` as `agentId`'s work on a job in `project` (a project id or name; none: nothing changes). */
export function runInJobProject({ agentId, project }, fn) {
  const name = String(project || '').trim();
  if (!name || !key(agentId)) return fn();
  return jobForRun.run({ agentId: key(agentId), project: name }, fn);
}

/**
 * The project of the job `agentId` is working on right now, or null. Only the
 * job's own agent gets it: a helper it asks keeps its own project.
 */
export function jobProjectFor(agentId) {
  const job = jobForRun.getStore();
  return job && job.agentId === key(agentId) ? job.project : null;
}
