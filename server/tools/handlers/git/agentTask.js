// hand_coding_job_to_github: an agent hands a coding job to the repository's GitHub
// coding agent. The issue tags @grok (or @claude), whose workflow builds it
// and opens a pull request; the task is saved so the webhook
// (server/routes/githubAgentWebhook.js) can tell this agent when the pull
// request opens or merges. Owner only (server/tools/rbac/hostOwnerOnly.js):
// it posts with this computer's GitHub key.
import pool from '../../../db.js';
import { createIssue } from '../../../github.js';
import { createLogger } from '../../../logger.js';
import { safeErrorCode } from '../../../security/errorCode.js';
import {
  AGENT_TASK_LABELS, buildTaskBody, saveAgentTask, taskRepo, taskWorker,
} from '../../../github/agentTasks.js';

const log = createLogger('agent-github-task');

export async function createGithubTaskIssue(agentId, args = {}, context = {}, deps = {}) {
  const db = deps.db || pool;
  const fileIssue = deps.createIssue || createIssue;
  const title = String(args.title || '').trim();
  if (!title) return 'Error: title is required.';
  let repo;
  let worker;
  try {
    repo = taskRepo(args.repo, deps.env || process.env);
    worker = taskWorker(args.worker);
  } catch (error) {
    return `Error: ${error.message}`;
  }
  const body = buildTaskBody({ goal: args.goal, steps: args.steps, acceptance: args.acceptance, worker });
  const issue = await fileIssue(repo, title.slice(0, 250), body, [...AGENT_TASK_LABELS]);
  const issueNumber = Number(issue?.number);
  const issueUrl = String(issue?.html_url || '');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return 'Error: GitHub did not return an issue number.';
  try {
    await saveAgentTask(db, {
      repo, issueNumber, issueUrl, worker, agentId,
      workspaceId: context.workspaceId || null,
      conversationId: context.conversationId ? String(context.conversationId) : null,
      createdBy: Number.isInteger(Number(context.userId)) && Number(context.userId) > 0 ? Number(context.userId) : null,
    });
  } catch (error) {
    // The issue is filed either way; only the call back is lost.
    log.warn('task not saved', { agentId, issueNumber, code: safeErrorCode(error) });
    return JSON.stringify({ issue_number: issueNumber, issue_url: issueUrl, note: 'Filed, but not saved here, so no notice will come when its pull request opens.' });
  }
  log.info('task filed', { agentId, issueNumber, worker });
  return JSON.stringify({ issue_number: issueNumber, issue_url: issueUrl });
}
