import { getSubAgentById } from '../../memory.js';
import { isGithubProject, logProjectActivity } from '../../workspaces.js';
import { getDefaultBranch } from '../../github.js';
import {
  createSession as createJulesSession,
  recordSession as recordJulesSession,
  refreshSession as refreshJulesSession,
  getSessionsForProject as getJulesSessionsForProject,
  findRecentMatchingSession,
  getLiveSessionForAgentTask
} from '../../jules.js';
import { resolveProjectForCall } from '../helpers.js';

export async function handleJulesTool(agentId, name, args, context = {}) {
  switch (name) {
    case 'jules_submit': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      if (!isGithubProject(project)) {
        return 'Error: Jules only works with GitHub-backed projects. Open the project with a `repo`.';
      }
      const sub = await getSubAgentById(agentId, context);
      let branch = args.branch || sub?.github_branch;
      if (!branch) {
        branch = await getDefaultBranch(project.repo);
      }
      const title = args.title || args.prompt.slice(0, 80);
      const existingForTask = await getLiveSessionForAgentTask(context.agentTaskId);
      if (existingForTask) {
        return [
          `This delegated task already has a live Jules session. Reusing it instead of submitting another. Session: ${existingForTask.jules_session_name}`,
          `Branch: ${existingForTask.branch || branch}`,
          existingForTask.jules_url ? `Watch: ${existingForTask.jules_url}` : null,
          `Status: ${existingForTask.status || 'UNKNOWN'}`,
        ].filter(Boolean).join('\n');
      }
      const existing = await findRecentMatchingSession({
        agentId,
        projectId: project.id,
        branch,
        prompt: args.prompt,
      });
      if (existing) {
        return [
          `Reused existing Jules session instead of submitting a duplicate. Session: ${existing.jules_session_name}`,
          `Branch: ${existing.branch || branch}`,
          existing.jules_url ? `Watch: ${existing.jules_url}` : null,
          `Status: ${existing.status || 'UNKNOWN'}`,
        ].filter(Boolean).join('\n');
      }

      const session = await createJulesSession({
        prompt: args.prompt,
        repo: project.repo,
        branch,
        title,
        requirePlanApproval: !!args.require_plan_approval,
        autoCreatePR: true,
      });

      const sessionName = session?.name || session?.session?.name;
      const julesUrl = sessionName ? `https://jules.google.com/${sessionName}` : null;

      await recordJulesSession({
        julesSessionName: sessionName,
        agentId,
        projectId: project.id,
        branch,
        prompt: args.prompt,
        title,
        julesUrl,
        agentTaskId: context.agentTaskId || null,
      });
      await logProjectActivity(project.id, agentId, 'jules_submit', title);

      return [
        `Submitted to Jules. Session: ${sessionName || '(unknown id)'}`,
        `Branch: ${branch}`,
        julesUrl ? `Watch: ${julesUrl}` : null,
        `Poll status with jules_status("${sessionName}"). PR will open automatically when ready.`,
      ].filter(Boolean).join('\n');
    }

    case 'jules_status': {
      const sessionName = args.session.startsWith('sessions/') ? args.session : `sessions/${args.session}`;
      const { remote, db } = await refreshJulesSession(sessionName);
      const lines = [
        `Session: ${sessionName}`,
        `Status: ${remote?.state || remote?.status || 'UNKNOWN'}`,
        db?.title ? `Title: ${db.title}` : null,
        db?.branch ? `Branch: ${db.branch}` : null,
        db?.pr_url ? `PR: ${db.pr_url}` : '(no PR yet)',
        db?.jules_url ? `Jules: ${db.jules_url}` : null,
      ].filter(Boolean);

      // Surface any error details Jules returns
      const errMsg = remote?.error?.message || remote?.errorMessage || remote?.failureReason || remote?.error;
      if (errMsg) {
        lines.push(`Error: ${typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg).slice(0, 400)}`);
      }
      const details = remote?.details || remote?.stateDetails;
      if (details) {
        lines.push(`Details: ${typeof details === 'string' ? details : JSON.stringify(details).slice(0, 400)}`);
      }

      return lines.join('\n');
    }

    case 'jules_list': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const sessions = await getJulesSessionsForProject(project.id, { activeOnly: !args.include_completed });
      if (sessions.length === 0) return 'No Jules sessions for this project.';
      return sessions.map(s => {
        const pr = s.pr_url ? ` → ${s.pr_url}` : '';
        return `[${s.status}] ${s.title || s.prompt?.slice(0, 60)} (${s.branch || 'no branch'})${pr}`;
      }).join('\n');
    }

    default:
      throw new Error(`Unknown Jules tool: ${name}`);
  }
}
