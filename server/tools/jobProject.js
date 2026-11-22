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

/**
 * Run `fn` as `agentId`'s work on a job in `project` (a project id or name; none: nothing changes).
 * ref: the commit or branch a job pinned to a GitHub project reads at (projectPin.js).
 * confined: a code job that works only on its project's own branch on GitHub (a Kraken fix):
 * no change may land anywhere else while it runs (confinedJobProject, codeJobRefusal).
 */
export function runInJobProject({ agentId, project, ref = null, confined = false }, fn) {
  const name = String(project || '').trim();
  if (!name || !key(agentId)) return fn();
  return jobForRun.run({ agentId: key(agentId), project: name, ref: ref ? String(ref) : null, confined: confined === true }, fn);
}

/** The project id a confined code job of `agentId` may change, right now, or null when no such job runs. */
export function confinedJobProject(agentId) {
  const job = jobForRun.getStore();
  return job?.confined && job.agentId === key(agentId) ? job.project : null;
}

// Tools that change files or run commands outside the project tools, which a confined job's
// changes must go through (they write only to its own branch: handlers/writeBranch.js).
const OUTSIDE_WRITES = new Set([
  'local_write_file', 'generate_tests', 'github_write_file', 'sandbox_exec', 'terminal_run',
  'local_git_checkpoint', 'local_git_pull_ff_only', 'local_git_fetch',
]);

// Tools that hand work to someone else, or to later: that work would run outside the fix's fence.
const HAND_OFFS = new Set([
  'create_sub_agent', 'submit_agent_task', 'start_helper', 'dispatch_squad', 'request_agent_help',
  'hand_off_jobs', 'jules_submit', 'wake_me_up',
]);

/** Plain words refusing `tool` during a confined code job of `agentId`, or null when it may run. */
export function codeJobRefusal(agentId, tool) {
  if (!confinedJobProject(agentId)) return null;
  if (HAND_OFFS.has(String(tool))) {
    return 'Error: Blocked. Nothing was handed on. During a fix, do the change yourself on the fix branch, with project_write, project_edit or project_multi_edit. Say this in your answer.';
  }
  // An outside (MCP) tool may change anything, and this app cannot tell which do.
  if (!OUTSIDE_WRITES.has(String(tool)) && !String(tool).startsWith('mcp__')) return null;
  return 'Error: Blocked. Nothing was changed. During this fix, changes go only to its own project on GitHub, on the fix branch, with project_write, project_edit or project_multi_edit. Say this in your answer, and do not try another way.';
}

/** The commit or branch the job running right now is pinned to in the project with this id, or undefined. */
export function jobRefFor(projectId) {
  const job = jobForRun.getStore();
  return job?.ref && job.project === String(projectId || '') ? job.ref : undefined;
}

/**
 * The project of the job `agentId` is working on right now, or null. Only the
 * job's own agent gets it: a helper it asks keeps its own project.
 */
export function jobProjectFor(agentId) {
  const job = jobForRun.getStore();
  return job && job.agentId === key(agentId) ? job.project : null;
}
