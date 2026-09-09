import { readProjectBrief } from './briefs.js';
import {
  listWorkspaceAgentProjects,
  markProjectContextPrewarmed,
} from './projectMemberships.js';

const MAX_PROJECTS = 3;
const MAX_SUMMARY_CHARS = 800;
const MAX_BRIEF_CHARS = 6000;
const MAX_ACTIVITY_ROWS = 5;

export function clipProjectText(value, maxChars) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  // Prune at the last newline inside the budget so trees and lists are
  // never sliced mid-entry; fall back to a hard cut for wall-of-text.
  const cut = text.slice(0, maxChars);
  const boundary = cut.lastIndexOf('\n');
  const end = boundary > Math.floor(maxChars / 2) ? boundary : maxChars;
  return `${cut.slice(0, end)}\n[truncated]`;
}

function clip(value, maxChars) {
  return clipProjectText(value, maxChars);
}

function projectLocation(project) {
  if (project.project_repo) return `GitHub repository ${project.project_repo}`;
  if (project.project_path) return `local path ${project.project_path}`;
  return 'no project location recorded';
}

async function loadRecentActivity(db, projectId) {
  const { rows } = await db.query(
    `SELECT agent_id, action, detail, created_at
       FROM project_activity
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [projectId, MAX_ACTIVITY_ROWS]
  );
  return rows;
}

export function selectEffectiveProjectMemberships(rows = []) {
  const byProject = new Map();
  for (const row of rows) {
    const current = byProject.get(row.project_id);
    if (!current || (current.permission === 'read' && row.permission === 'work')) {
      byProject.set(row.project_id, row);
    }
  }
  return [...byProject.values()].slice(0, MAX_PROJECTS);
}

export async function buildAuthorizedProjectContext(db, { workspaceId, agentId }) {
  if (!workspaceId || !agentId) return { prompt: '', contexts: [] };
  const memberships = selectEffectiveProjectMemberships(
    await listWorkspaceAgentProjects(db, { workspaceId, agentId })
  );
  if (memberships.length === 0) return { prompt: '', contexts: [] };

  const lines = [
    '',
    '## Authorized project context',
    'This context comes from explicit workspace membership. Stay within the listed permission and use project tools for deeper reads.',
  ];
  const contexts = [];

  for (const membership of memberships) {
    lines.push('', `### ${membership.project_name}`);
    lines.push(`- Permission: ${membership.permission}`);
    lines.push(`- Location: ${projectLocation(membership)}`);
    lines.push(`- Membership source: ${membership.source_kind}`);
    const summary = clip(membership.project_summary, MAX_SUMMARY_CHARS);
    if (summary) lines.push(`- Summary: ${summary}`);

    let brief = '';
    try {
      brief = clip(await readProjectBrief({
        id: membership.project_id,
        name: membership.project_name,
        path: membership.project_path,
        repo: membership.project_repo,
      }), MAX_BRIEF_CHARS);
    } catch {}
    if (brief) lines.push('', '#### Project brief', brief);

    let activity = [];
    try { activity = await loadRecentActivity(db, membership.project_id); } catch {}
    if (activity.length > 0) {
      lines.push('', '#### Recent project activity');
      for (const item of activity) {
        const detail = item.detail ? `: ${clip(item.detail, 240)}` : '';
        lines.push(`- ${item.agent_id} ${item.action}${detail}`);
      }
    }

    await markProjectContextPrewarmed(db, {
      workspaceId,
      projectId: membership.project_id,
      agentId,
    });
    contexts.push({
      workspaceId,
      projectId: membership.project_id,
      projectName: membership.project_name,
      permission: membership.permission,
      sourceKind: membership.source_kind,
      briefIncluded: Boolean(brief),
      activityCount: activity.length,
    });
  }

  return { prompt: lines.join('\n'), contexts };
}
