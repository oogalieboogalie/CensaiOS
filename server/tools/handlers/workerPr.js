// submit_pr: the worker a coding job was given to opens the pull request from
// that job's branch.
//
//   a worker sub-agent  from its own branch (reviewers and researchers never)
//   a family agent      only from the branch made for a coding job Censai
//                       handed it (a Kraken fix arm is one), while it has the job
//
// The pull request (number, link, branch, head commit) is noted against the
// job (server/workspaces/workerBranches.js). Asking twice for the same branch
// gives back the pull request that is already open.

import pool from '../../db.js';
import { getSubAgentById } from '../../memory.js';
import { openPR as ghOpenPR } from '../../github.js';
import { isGithubProject, logProjectActivity } from '../../workspaces.js';
import { writeBranchRefusal } from '../../workspaces/branchGuard.js';
import { findWorkerBranch, saveWorkerPr } from '../../workspaces/workerBranches.js';
import { fetchGithub, resolveProjectForCall } from '../helpers.js';
import { currentCodingJob } from './writeBranch.js';
import { noteToolFailure } from '../toolsLog.js';

const NONE = 'No pull request was opened.';

async function openPrOn(repo, branch) {
  const head = encodeURIComponent(`${repo.split('/')[0]}:${branch}`);
  const list = await fetchGithub(`/repos/${repo}/pulls?state=open&head=${head}&per_page=1`);
  return Array.isArray(list) && list[0] ? list[0] : null;
}

/** The commit `branch` is at right now, or null when GitHub does not say. */
async function branchHead(repo, branch) {
  try {
    return (await fetchGithub(`/repos/${repo}/git/refs/heads/${branch}`))?.object?.sha || null;
  } catch (error) {
    noteToolFailure('job branch head not read', {}, error);
    return null;
  }
}

/**
 * Open the pull request for `job` from `branch`, or find the one already open,
 * and note it against the job. For the orchestrator too, on a worker's behalf.
 * Returns { pr: { number, url, headSha }, already }.
 */
export async function openWorkerPr({ db = pool, workspaceId, agentId, job, project, branch, title, body }) {
  const refusal = await writeBranchRefusal(project.repo, branch);
  if (refusal) throw Object.assign(new Error(`${NONE} ${refusal}`), { code: 'JOB_BRANCH_BLOCKED' });
  let found = await openPrOn(project.repo, branch);
  let already = Boolean(found);
  if (!found) {
    try {
      found = await ghOpenPR(project.repo, branch, title, body);
    } catch (error) {
      if (!/^GitHub 422/.test(error?.message || '')) throw error;
      // GitHub takes no pull request with nothing new on the branch, or a second one for the same branch.
      found = await openPrOn(project.repo, branch);
      already = Boolean(found);
      if (!found) {
        throw Object.assign(new Error(`${NONE} GitHub would not take a pull request from "${branch}" (it answered 422). There may be no change on the branch yet.`), { code: 'JOB_BRANCH_BLOCKED', cause: error });
      }
    }
  }
  // The commit to check is the branch's own: GitHub can be a moment late moving the pull request to a new push.
  const pr = { number: found.number, url: found.html_url, headSha: await branchHead(project.repo, branch) };
  await saveWorkerPr(db, { workspaceId, agentId, job, repo: project.repo, branch, pr });
  return { pr, already };
}

export async function submitWorkerPr(agentId, args, context = {}, { db = pool } = {}) {
  const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
  if (sub && (sub.permission || 'worker') !== 'worker') {
    return `Error: ${sub.permission} sub-agents cannot open pull requests. Only workers can.`;
  }
  const { project } = await resolveProjectForCall(agentId, args.project || null, context, { github: true });
  if (!isGithubProject(project)) return `Error: ${NONE} This project is not kept on GitHub.`;

  let job;
  let branch;
  if (sub) {
    job = { kind: 'sub_agent', id: sub.id, part: 0 };
    branch = sub.github_branch;
    if (!branch) return `Error: ${NONE} You have no branch in this project yet. Change a file first: your branch is made then.`;
  } else {
    try {
      job = await currentCodingJob(agentId, context, db);
    } catch (error) {
      if (error?.code !== 'JOB_BRANCH_BLOCKED') throw error;
      return `Error: ${NONE} ${error.message}`;
    }
    if (!job) {
      return `Error: ${NONE} A family agent opens a pull request only from the branch made for a coding job Censai handed it, and you have no coding job in hand right now.`;
    }
    branch = (await findWorkerBranch(db, job, project.repo))?.branch;
    if (!branch) return `Error: ${NONE} Your coding job has no branch in this project yet. Change a file first: the branch is made then.`;
  }

  let opened;
  try {
    opened = await openWorkerPr({
      db, workspaceId: context.workspaceId, agentId, job, project, branch, title: args.title, body: args.body,
    });
  } catch (error) {
    if (error?.code !== 'JOB_BRANCH_BLOCKED') throw error;
    return `Error: ${error.message}`;
  }
  const { pr, already } = opened;
  if (already) return `Pull request #${pr.number} is already open for \`${branch}\`: ${pr.url}`;
  await logProjectActivity(project.id, agentId, 'pr', `${args.title} (#${pr.number})`);
  return `Opened PR #${pr.number}: ${pr.url}`;
}
