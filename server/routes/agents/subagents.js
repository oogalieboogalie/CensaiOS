import express from 'express';
import { requireDb } from './shared.js';
import { agentRouteError } from './scope.js';
import { resolveSubAgentRouteScope } from './subagentScope.js';
import pool from '../../db.js';
import { resolveAuthorizedWorkspaceProject } from '../../workspaces/projectAccess.js';
import {
  getAllSubAgents,
  getSubAgents,
  getSubAgentById,
  createSubAgent,
  updateSubAgent,
  deleteSubAgent,
  scratchpadRead,
  scratchpadWrite,
  scratchpadClear,
} from '../../memory.js';


export const subagentsRouter = express.Router();

subagentsRouter.get('/sub-agents', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const subs = await getAllSubAgents(scope);
    res.json(subs);
  } catch (err) {
    agentRouteError(res, err);
  }
});

subagentsRouter.get('/sub-agents/:parentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const subs = await getSubAgents(req.params.parentId, scope);
    res.json(subs);
  } catch (err) {
    agentRouteError(res, err);
  }
});

subagentsRouter.post('/sub-agents', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const { parentId, name, role, specialty, systemPrompt, hue, permission, projectId, modelProvider, modelName, model_provider, model_name, toolScopes, tool_scopes } = req.body;
    if (!parentId || !name) return res.status(400).json({ error: 'parentId and name required' });
    const authorizedProject = projectId ? await resolveAuthorizedWorkspaceProject(pool, {
      workspaceId: scope.workspaceId,
      agentId: parentId,
      projectIdentifier: projectId,
      requiredPermission: 'read',
    }) : null;
    const sub = await createSubAgent(parentId, {
      name,
      role,
      specialty,
      systemPrompt,
      hue,
      permission,
      projectId: authorizedProject?.id || null,
      modelProvider: modelProvider || model_provider,
      modelName: modelName || model_name,
      toolScopes,
      tool_scopes,
    }, scope);
    res.json(sub);
  } catch (err) {
    agentRouteError(res, err);
  }
});

subagentsRouter.put('/sub-agents/:id', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const current = await getSubAgentById(req.params.id, scope);
    if (!current) return res.status(404).json({ error: 'Sub-agent not found' });
    const requestedProjectId = req.body?.projectId || req.body?.project_id || null;
    const authorizedProject = requestedProjectId ? await resolveAuthorizedWorkspaceProject(pool, {
      workspaceId: scope.workspaceId,
      agentId: current.parent_id,
      projectIdentifier: requestedProjectId,
      requiredPermission: 'read',
    }) : null;
    const patch = { ...req.body };
    if (requestedProjectId) patch.project_id = authorizedProject.id;
    delete patch.projectId;
    const sub = await updateSubAgent(req.params.id, patch, scope);
    if (!sub) return res.status(404).json({ error: 'Sub-agent not found' });
    res.json(sub);
  } catch (err) {
    agentRouteError(res, err);
  }
});

subagentsRouter.delete('/sub-agents/:id', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const deleted = await deleteSubAgent(req.params.id, scope);
    if (!deleted) return res.status(404).json({ error: 'Sub-agent not found' });
    res.json({ ok: true });
  } catch (err) {
    agentRouteError(res, err);
  }
});

subagentsRouter.get('/scratchpad/:subAgentId/:project', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const sub = await getSubAgentById(req.params.subAgentId, scope);
    if (!sub) return res.status(404).json({ error: 'Sub-agent not found' });
    const data = await scratchpadRead(req.params.subAgentId, req.params.project, req.query.key, scope);
    res.json(data || []);
  } catch (err) {
    agentRouteError(res, err);
  }
});

subagentsRouter.post('/scratchpad/:subAgentId/:project', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    const entry = await scratchpadWrite(req.params.subAgentId, req.params.project, key, value, scope);
    if (!entry) return res.status(404).json({ error: 'Sub-agent not found' });
    res.json(entry);
  } catch (err) {
    agentRouteError(res, err);
  }
});

subagentsRouter.delete('/scratchpad/:subAgentId/:project', requireDb, async (req, res) => {
  try {
    const scope = await resolveSubAgentRouteScope(req);
    const sub = await getSubAgentById(req.params.subAgentId, scope);
    if (!sub) return res.status(404).json({ error: 'Sub-agent not found' });
    const count = await scratchpadClear(req.params.subAgentId, req.params.project, scope);
    res.json({ cleared: count });
  } catch (err) {
    agentRouteError(res, err);
  }
});
