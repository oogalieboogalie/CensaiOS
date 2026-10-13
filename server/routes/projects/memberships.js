import express from 'express';
import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import {
  listWorkspaceAgentProjects,
  replaceCanvasProjectMemberships,
} from '../../workspaces/projectMemberships.js';

export const projectMembershipsRouter = express.Router();

function publicMembership(row) {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectPath: row.project_path,
    projectRepo: row.project_repo,
    projectSummary: row.project_summary,
    agentId: row.agent_id,
    permission: row.permission,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    updatedAt: row.updated_at,
    lastPrewarmedAt: row.last_prewarmed_at,
  };
}

projectMembershipsRouter.get('/workspaces/:workspaceId/agent-projects', async (req, res) => {
  try {
    await requireWorkspaceMember(pool, {
      userId: req.session.userId,
      workspaceId: req.params.workspaceId,
    });
    const rows = await listWorkspaceAgentProjects(pool, {
      workspaceId: req.params.workspaceId,
      agentId: req.query.agentId || null,
    });
    res.json({ memberships: rows.map(publicMembership) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
});

projectMembershipsRouter.put('/workspaces/:workspaceId/agent-projects/:projectId', async (req, res) => {
  try {
    await requireWorkspaceMember(pool, {
      userId: req.session.userId,
      workspaceId: req.params.workspaceId,
      roles: ['owner', 'admin', 'member'],
    });
    const rows = await replaceCanvasProjectMemberships(pool, {
      workspaceId: req.params.workspaceId,
      projectId: req.params.projectId,
      memberships: req.body?.memberships,
      sourceId: req.body?.sourceId || req.params.workspaceId,
      userId: req.session.userId,
    });
    res.json({ ok: true, memberships: rows.map(publicMembership) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
});
