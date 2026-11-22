// Which branch a project tool reads or writes on GitHub.
//
// A change to a project kept on GitHub goes on the worker's own branch, made
// and read back first (server/workspaces/branchGuard.js):
//   a worker sub-agent  its own branch, made when it was created or here on its first change
//   a family agent      the branch of the coding job Censai handed it (a Kraken
//                       fix arm is one), made here on the job's first change
// Anyone else, or a branch that could not be made, gets plain words and nothing
// is written. A folder on this computer has no branch and works as before.

import pool from '../../db.js';
import { branchExists } from '../../github.js';
import { updateSubAgent } from '../../memory/subagents.js';
import { isGithubProject } from '../../workspaces.js';
import { ensureSubAgentBranch } from '../../workspaces/subagents.js';
import { BAD_PATH, BranchBlocked, makeVerifiedBranch, repoPathParts, writeBranchRefusal } from '../../workspaces/branchGuard.js';
import { codingJobsFor, findWorkerBranch, saveWorkerBranch } from '../../workspaces/workerBranches.js';
import { fetchGithub } from '../helpers.js';
import { confinedJobProject, jobProjectFor } from '../jobProject.js';
import { planJobRun } from '../jobRun.js';
import { noteToolFailure } from '../toolsLog.js';

const NOTHING = 'Nothing was changed.';
const TELL = 'Say this in your answer, and do not try another way to change this project.';

export function jobBranchName(agentId, job) {
  const who = String(agentId).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return `agent/${who}-job-${String(job.id).slice(0, 8)}-${job.part}`;
}

const SHA = /^[0-9a-f]{40,64}$/i;

/**
 * Make `name` in `repo` starting at `from` (a commit, or a branch), then read it back.
 * No `from`: the main branch, as makeVerifiedBranch does. Throws BranchBlocked with plain words.
 */
async function makeBranchAt(repo, name, from) {
  if (!from) return makeVerifiedBranch(repo, name);
  const refusal = await writeBranchRefusal(repo, name);
  if (refusal) throw new BranchBlocked(refusal);
  if (await branchExists(repo, name)) return name;
  let sha = SHA.test(from) ? from : null;
  try {
    sha ||= (await fetchGithub(`/repos/${repo}/commits/${encodeURIComponent(from)}`))?.sha || null;
  } catch (error) {
    throw new BranchBlocked(`No branch could be made for this work: GitHub could not find "${from}", the place the work was pinned to.`, { cause: error });
  }
  if (!sha) throw new BranchBlocked(`No branch could be made for this work: GitHub could not find "${from}", the place the work was pinned to.`);
  try {
    await fetchGithub(`/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${name}`, sha }) });
  } catch (error) {
    if (await branchExists(repo, name)) return name;
    const code = /error (\d{3})/.exec(error?.message || '')?.[1];
    throw new BranchBlocked(`No branch could be made for this work. GitHub ${code ? `answered ${code}` : 'could not be reached'} when asked to make it.`, { cause: error });
  }
  if (!(await branchExists(repo, name))) {
    throw new BranchBlocked('No branch could be made for this work. GitHub took the request, but the branch is not there when read back.');
  }
  return name;
}

/**
 * The branch of one coding job of Censai's in `repo`: the one noted for it, or a new one made
 * at `from` (the commit the work was pinned to) and noted. The orchestrator makes it before the
 * job's agent starts, so the agent's first change already lands on a branch that starts where
 * the person looked. Throws BranchBlocked with plain words, after noting why.
 */
export async function jobBranchFor({ db = pool, workspaceId, agentId, job, repo, from = null }) {
  const noted = await findWorkerBranch(db, job, repo);
  if (noted?.branch) return { branch: noted.branch, made: false };
  const ids = { workspaceId, agentId, job, repo };
  try {
    const branch = await makeBranchAt(repo, jobBranchName(agentId, job), from);
    await saveWorkerBranch(db, { ...ids, branch });
    return { branch, made: true };
  } catch (error) {
    if (!(error instanceof BranchBlocked)) throw error;
    noteToolFailure('no branch could be made for a coding job', { agentId, planId: job.id, part: job.part }, error);
    await saveWorkerBranch(db, { ...ids, blockedReason: error.message })
      .catch((err) => noteToolFailure('blocked job branch not noted', { agentId, planId: job.id }, err));
    throw error;
  }
}

/**
 * The coding job Censai handed `agentId` that this tool call is part of, or
 * null. Exact when the run says which plan and job it is; otherwise the one
 * working coding job of this person's in this project. With more than one it
 * throws BranchBlocked: which job a change belongs to is never guessed.
 */
export async function currentCodingJob(agentId, context = {}, db = pool) {
  const planProject = jobProjectFor(agentId);
  if (!context.workspaceId || !planProject) return null;
  const run = planJobRun();
  const jobs = await codingJobsFor(db, {
    workspaceId: context.workspaceId, userId: context.userId, agentId,
    planProject, planId: run?.planId, part: run?.part,
  });
  if (jobs.length > 1) {
    throw new BranchBlocked('You have more than one coding job in hand in this project at the same time, and it cannot be told which one this belongs to. It will work once the other job has finished.');
  }
  return jobs[0] || null;
}

async function subAgentBranch(sub, project, context) {
  if (['reviewer', 'researcher'].includes(sub.permission)) throw new BranchBlocked(`A ${sub.permission} sub-agent does not change project files.`);
  if (sub.github_branch) return { branch: sub.github_branch };
  // Its branch could not be made when it was created: try once more before its first change.
  const branch = await ensureSubAgentBranch(project, sub);
  sub.github_branch = branch;
  // Not saved (no one behind the call, or the database is down): the branch is found again next time.
  await updateSubAgent(sub.id, { github_branch: branch }, context)
    .catch((error) => noteToolFailure('sub-agent branch not saved', { agentId: sub.id }, error));
  return { branch, fresh: true };
}

async function familyJobBranch(agentId, project, context, db) {
  const job = await currentCodingJob(agentId, context, db);
  if (!job) {
    throw new BranchBlocked(`"${project.name}" is kept on GitHub, and a change there only goes on a branch made for a coding job. You have no coding job in hand right now, so there is no branch to change it on. Ask Censai to hand this to you as a coding job, or give it to a worker sub-agent.`);
  }
  const noted = await findWorkerBranch(db, job, project.repo);
  if (noted?.branch) return { branch: noted.branch };
  const ids = { workspaceId: context.workspaceId, agentId, job, repo: project.repo };
  try {
    const branch = await makeVerifiedBranch(project.repo, jobBranchName(agentId, job));
    await saveWorkerBranch(db, { ...ids, branch });
    return { branch, fresh: true };
  } catch (error) {
    if (!(error instanceof BranchBlocked)) throw error;
    noteToolFailure('no branch could be made for a coding job', { agentId, planId: job.id, part: job.part }, error);
    await saveWorkerBranch(db, { ...ids, blockedReason: error.message })
      .catch((err) => noteToolFailure('blocked job branch not noted', { agentId, planId: job.id }, err));
    throw error;
  }
}

/**
 * Where a change to `project` goes. { branch } (undefined for a folder on this
 * computer), or { refused } in plain words: then nothing may be written.
 */
export async function branchForWrite({ agentId, sub, project, paths = [], context = {}, db = pool }) {
  // A fix's own agent changes only the fix's project, on GitHub: never a folder on this computer,
  // whatever project the call names and whatever Trust mode would let through.
  const confined = sub ? null : confinedJobProject(agentId);
  if (confined && (String(project?.id ?? '') !== confined || !isGithubProject(project))) {
    return { refused: `Error: Blocked. ${NOTHING} During this fix, changes go only to its own project on GitHub, on the fix's own branch, never to another project or a folder on this computer. ${TELL}` };
  }
  if (!isGithubProject(project)) return { branch: undefined };
  try {
    // A path with ".." in it could point the call at another repo, past the branch.
    if (paths.some((path) => !repoPathParts(path))) throw new BranchBlocked(BAD_PATH);
    const { branch, fresh } = sub
      ? await subAgentBranch(sub, project, context)
      : await familyJobBranch(agentId, project, context, db);
    // A branch made a moment ago was checked as it was made; one noted earlier is checked again.
    const refusal = fresh ? null : await writeBranchRefusal(project.repo, branch);
    if (refusal) throw new BranchBlocked(refusal);
    return { branch };
  } catch (error) {
    if (!(error instanceof BranchBlocked)) throw error;
    return { refused: `Error: Blocked. ${NOTHING} ${error.message} ${TELL}` };
  }
}

/** The branch a read looks at: the worker's own when it has one, so it sees its own changes; else the main one. */
export async function branchForRead({ agentId, sub, project, context = {}, db = pool }) {
  if (sub) return sub.github_branch || undefined;
  if (!context.workspaceId || !isGithubProject(project)) return undefined;
  try {
    const run = planJobRun();
    const jobs = await codingJobsFor(db, {
      workspaceId: context.workspaceId, userId: context.userId, agentId, checking: true,
      planId: run?.planId, part: run?.part,
    });
    const branches = new Set();
    for (const job of jobs) {
      const noted = await findWorkerBranch(db, job, project.repo);
      if (noted?.branch) branches.add(noted.branch);
    }
    // Two jobs with a branch each: which one is meant is not guessed, so the main branch is read.
    if (branches.size === 1) return [...branches][0];
  } catch (error) {
    noteToolFailure('job branch not looked up for a read', { agentId }, error);
  }
  return undefined;
}
