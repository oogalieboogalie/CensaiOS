import fs from 'fs';
import path from 'path';
import { createAgentTask } from '../../memory/tasks.js';
import { getSubAgents } from '../../memory/subagents.js';
import {
  resolveRequestedProject,
  slugify,
  escapeMd,
  findExistingHandoffBySourceId,
  inferProjectName,
} from './shared.js';
import { chooseHandoffSubAgent } from './scoring.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import pool from '../../db.js';
import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { shareTaskProject } from '../../censaiOrchestrator/projectShare.js';
import { folderKey, refuseNewProjectToTeammate } from './newProjectOwnerOnly.js';
import { invalidCanvasAgentIds, ownerMayAuthorizeCustomAgents } from '../../workspaces/canvasAgentAccess.js';

const log = createLogger('project-handoffs');

// The hand-off's folder as a project: the one current-project.json names when
// it is that folder, else one this board already has there, else the newest.
async function projectIdFor(folder, { workspaceId, knownId }) {
  const key = folderKey(folder);
  if (knownId) {
    const { rows } = await pool.query('SELECT id, path FROM projects WHERE id = $1', [knownId]);
    if (rows[0]?.path && folderKey(rows[0].path) === key) return rows[0].id;
  }
  const { rows } = await pool.query(
    `SELECT p.id, p.path FROM projects p
       LEFT JOIN workspace_agent_projects wap ON wap.project_id = p.id AND wap.workspace_id = $1
      WHERE p.path IS NOT NULL
      ORDER BY (wap.project_id IS NOT NULL) DESC, p.updated_at DESC`,
    [workspaceId],
  );
  return rows.find((row) => folderKey(row.path) === key)?.id || null;
}

// The access the person handing off has to the project on this board: what a
// save of the board would let them give this agent ('work', as a board save
// gives), or null when they could give it none: they only view the board or
// are not on it, the agent is one a board save of theirs would refuse (a
// custom agent, unless they own the board), or the project is new to the
// board and they do not own this computer (server/workspaces/projectMemberships.js
// and ./memberships.js make the same checks on a board save).
async function handerAccess({ workspaceId, userId, projectId, agentId }) {
  try {
    await resolveWorkspaceContext(pool, { workspaceId, userId, roles: ['owner', 'admin', 'member'] });
  } catch (error) {
    if (error.statusCode === 403 || error.statusCode === 404) return null;
    throw error;
  }
  const { rows: agents } = await pool.query('SELECT * FROM agents WHERE id = ANY($1)', [[agentId]]);
  const allowCustom = await ownerMayAuthorizeCustomAgents(pool, { workspaceId, userId });
  if (invalidCanvasAgentIds([agentId], agents, { allowCustom }).length > 0) return null;
  const refused = await refuseNewProjectToTeammate({ session: { userId } }, {
    workspaceId, projectId, memberships: [{ agentId, permission: 'work' }],
  });
  return refused ? null : 'work';
}

// The agent doing the task reaches projects through its parent agent's access
// on the board, which a hand-off to an agent with no window there never had.
// So the parent gets the hand-off's one project, with the access of the person
// handing off, while the task is open (server/censaiOrchestrator/projectShare.js);
// it is taken back as the task ends (server/memory/tasks/crud.js).

// The project to lend and the access to lend it with, or null when there is
// none to lend. A failure lends nothing and is logged; the task is handed off as before.
async function loanFor(folder, { workspaceId, userId, knownId, agentId }) {
  if (!workspaceId) return null;
  try {
    const projectId = await projectIdFor(folder, { workspaceId, knownId });
    if (!projectId) return null;
    const permission = await handerAccess({ workspaceId, userId, projectId, agentId });
    return permission ? { projectId, permission } : null;
  } catch (error) {
    log.warn('hand-off project not lent to the agent doing it', { code: safeErrorCode(error) });
    return null;
  }
}

async function lendTaskProject(loan, { task, workspaceId, userId, agentId }) {
  if (!loan) return;
  try {
    await shareTaskProject(pool, { taskId: task.id, workspaceId, agentId, userId, ...loan });
  } catch (error) {
    log.warn('hand-off project not lent to the agent doing it', { taskId: task.id, code: safeErrorCode(error) });
  }
}

export async function createProjectHandoffRecord(input = {}) {
  const {
    title, text, assignee, sourceTitle, priority = 'normal', sourceId,
    contractLines = [], workspaceId, userId, projectPath,
  } = input;
  // A window tied to its own project sends that project's path.
  const currentProject = await resolveRequestedProject(projectPath);

  if (!currentProject?.path) {
    throw new Error('Open a local project before handing off work.');
  }

  const cleanTitle = String(title || text || '').trim();
  const cleanText = String(text || title || '').trim();
  const cleanSourceId = String(sourceId || '').trim().slice(0, 200);
  if (!cleanTitle || !cleanText) {
    throw new Error('Todo handoff needs a title or text.');
  }

  const handedOffAt = new Date();
  const runtimeProjectPath = resolveProjectPathForRuntime(currentProject.path);
  const handoffDir = path.join(runtimeProjectPath, '.team', 'handoffs');
  await fs.promises.mkdir(handoffDir, { recursive: true });

  const existingPath = await findExistingHandoffBySourceId(handoffDir, cleanSourceId);
  if (existingPath) {
    return {
      ok: true,
      path: existingPath,
      relativePath: path.relative(runtimeProjectPath, existingPath).replace(/\\/g, '/'),
      task: null,
      taskSkipped: 'This todo was already handed off.',
    };
  }

  const baseName = `${handedOffAt.toISOString().slice(0, 10)}-${slugify(cleanTitle)}`;
  let filePath = path.join(handoffDir, `${baseName}.md`);
  let counter = 2;
  while (fs.existsSync(filePath)) {
    filePath = path.join(handoffDir, `${baseName}-${counter++}.md`);
  }

  const body = [
    `# ${escapeMd(cleanTitle)}`,
    '',
    `Project: ${currentProject.name || inferProjectName(currentProject.path)}`,
    `Source: ${sourceTitle || 'Todo List'}`,
    cleanSourceId ? `Source ID: ${cleanSourceId}` : null,
    `Assignee: ${assignee || 'unassigned'}`,
    `Priority: ${priority || 'normal'}`,
    `Handed off: ${handedOffAt.toISOString()}`,
    '',
    '## Work',
    escapeMd(cleanText),
    '',
    '## Handoff Contract',
    '- Treat this as the source of truth for this todo item.',
    '- Make the smallest scoped change that completes the work.',
    '- Update this handoff or leave a report before marking complete.',
    ...contractLines.map(line => `- ${escapeMd(line)}`),
    '',
  ].filter(v => v !== null).join('\n');

  await fs.promises.writeFile(filePath, body, 'utf8');

  let task = null;
  let taskSkipped = null;
  if (assignee) {
    const subs = await getSubAgents(assignee, { workspaceId, userId });
    const chosen = chooseHandoffSubAgent(subs, currentProject, cleanText);
    if (chosen) {
      // The task carries the hand-off's project when it is lent, so its helper works there.
      const loan = await loanFor(currentProject.path, {
        workspaceId, userId, knownId: currentProject.projectId, agentId: chosen.parent_id || assignee,
      });
      task = await createAgentTask({
        parentId: assignee,
        assigneeId: chosen.id,
        projectId: loan?.projectId || chosen.project_id || currentProject.name || null,
        project: currentProject.name || currentProject.path,
        title: cleanTitle,
        prompt: [
          cleanText,
          '',
          `Handoff file: ${filePath}`,
          `Project path: ${currentProject.path}`,
        ].join('\n'),
        priority,
        workspaceId,
        userId,
      });
      await lendTaskProject(loan, { task, workspaceId, userId, agentId: chosen.parent_id || assignee });
    } else {
      taskSkipped = `No active sub-agent exists under ${assignee}. Handoff file was still written.`;
    }
  }

  return {
    ok: true,
    path: filePath,
    relativePath: path.relative(runtimeProjectPath, filePath).replace(/\\/g, '/'),
    task,
    taskSkipped,
  };
}
