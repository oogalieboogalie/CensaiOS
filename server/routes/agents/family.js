import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import {
  getConsciousness,
  updateConsciousness,
  parseWorkingStatePatch,
  addAssociation,
  getAssociations,
  entangleMemories,
  getEntanglements,
} from '../../memory.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import {
  getFamilyBlueprintAgent,
  getFamilyWatchGraph,
} from '../../agents/familyBlueprint.js';
import { memoryRouteError, resolveRequestMemoryScope } from './memoryScope.js';

export const familyRouter = express.Router();

const IMMUTABLE_META = Object.freeze({ scope: 'product_blueprint', mutable: false });

function canonicalAgentOr404(res, candidateId) {
  const agent = getFamilyBlueprintAgent(candidateId);
  if (agent) return agent;
  res.status(404).json({ error: 'Canonical family agent not found.', code: 'FAMILY_AGENT_NOT_FOUND' });
  return null;
}

function rejectBlueprintMutation(res) {
  return res.status(409).json({
    error: 'The family blueprint is product-owned and cannot be modified at runtime.',
    code: 'FAMILY_BLUEPRINT_IMMUTABLE',
  });
}

async function resolveWorkingStateScope(req, write = false) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw Object.assign(new Error('Authentication required for agent state.'), { statusCode: 401 });
  }
  const workspaceId = String(req.body?.workspaceId || req.query?.workspaceId || '').trim();
  if (!workspaceId) {
    throw Object.assign(new Error('Open a workspace to access agent state.'), { statusCode: 400 });
  }
  const workspace = await resolveWorkspaceContext(pool, { userId, workspaceId });
  if (write && workspace.role === 'viewer') {
    throw Object.assign(new Error('Workspace role does not allow agent state updates.'), { statusCode: 403 });
  }
  return { workspaceId: workspace.id, userId };
}

function publicWorkingState(agentId, scope, row) {
  const stored = row?.emotional_state;
  const emotionalState = stored && typeof stored === 'object' ? {
    ...(typeof stored.current === 'string' ? { current: stored.current } : {}),
    ...(typeof stored.updatedAt === 'string' ? { updatedAt: stored.updatedAt } : {}),
    ...(stored.provenance && typeof stored.provenance === 'object' ? {
      provenance: {
        ...(typeof stored.provenance.source === 'string'
          ? { source: stored.provenance.source } : {}),
        ...(Number.isInteger(stored.provenance.userId)
          ? { userId: stored.provenance.userId } : {}),
      },
    } : {}),
  } : null;
  return {
    agentId,
    workspaceId: scope.workspaceId,
    emotional_state: emotionalState,
  };
}

familyRouter.get('/state/:agentId', requireDb, async (req, res) => {
  const agent = canonicalAgentOr404(res, req.params.agentId);
  if (!agent) return;
  try {
    const scope = await resolveWorkingStateScope(req);
    const state = await getConsciousness(agent.id, scope);
    res.json(publicWorkingState(agent.id, scope, state));
  } catch (err) {
    memoryRouteError(res, err);
  }
});

familyRouter.patch('/state/:agentId', requireDb, async (req, res) => {
  const agent = canonicalAgentOr404(res, req.params.agentId);
  if (!agent) return;
  try {
    const scope = await resolveWorkingStateScope(req, true);
    const current = parseWorkingStatePatch(req.body);
    const state = await updateConsciousness(agent.id, { emotional_state: { current } }, scope);
    res.json({ ok: true, state: publicWorkingState(agent.id, scope, state) });
  } catch (err) {
    memoryRouteError(res, err);
  }
});

for (const path of ['/api/associations', '/associations']) {
  familyRouter.post(path, requireDb, async (req, res) => {
    try {
      const { agentId, conceptA, conceptB, strength, type } = req.body;
      if (!agentId || !conceptA || !conceptB) {
        return res.status(400).json({ error: 'agentId, conceptA, conceptB required' });
      }
      const scope = await resolveRequestMemoryScope(req);
      const id = await addAssociation(agentId, conceptA, conceptB, strength, type, null, scope);
      return res.json({ id });
    } catch (err) {
      return memoryRouteError(res, err);
    }
  });
}

familyRouter.get('/associations/:agentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveRequestMemoryScope(req);
    const rows = await getAssociations(
      req.params.agentId, req.query.concept || '', Number(req.query.limit) || 20, scope,
    );
    res.json(rows);
  } catch (err) {
    memoryRouteError(res, err);
  }
});

familyRouter.post('/entanglements', requireDb, async (req, res) => {
  try {
    const { agentId, memoryA, memoryB, correlation } = req.body;
    if (!agentId || !memoryA || !memoryB) {
      return res.status(400).json({ error: 'agentId, memoryA, memoryB required' });
    }
    const scope = await resolveRequestMemoryScope(req);
    const id = await entangleMemories(agentId, memoryA, memoryB, correlation, scope);
    return res.json({ id });
  } catch (err) {
    return memoryRouteError(res, err);
  }
});

familyRouter.get('/entanglements/:agentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveRequestMemoryScope(req);
    const rows = await getEntanglements(req.params.agentId, req.query.memory || '', scope);
    res.json(rows);
  } catch (err) {
    memoryRouteError(res, err);
  }
});

familyRouter.get('/watch/:agentId', (req, res) => {
  const agent = canonicalAgentOr404(res, req.params.agentId);
  if (!agent) return;
  const graph = getFamilyWatchGraph(agent.id);
  res.json({ agentId: agent.id, ...graph, ...IMMUTABLE_META });
});

familyRouter.post('/watch', (_req, res) => rejectBlueprintMutation(res));

familyRouter.get('/genetics/:agentId', (req, res) => {
  const agent = canonicalAgentOr404(res, req.params.agentId);
  if (!agent) return;
  res.json({ ...agent, ...IMMUTABLE_META });
});

familyRouter.post('/genetics/:agentId/evolve', (_req, res) => rejectBlueprintMutation(res));
