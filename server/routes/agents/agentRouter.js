import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import { createLogger } from '../../logger.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { getAgents as getDbAgents, getAllSubAgents } from '../../memory.js';
import { listBlueprints } from '../../blueprints/store.js';
import { currentFacts } from '../../agentMemory/store.js';
import { buildRoutePlan } from '../../../src/lib/agentRouter/routePlan.js';
import { routerWords } from '../../../src/lib/agentRouter/readRequest.js';

// Message router (diagram 03): one shared line per board, and a
// router that reads a request, cuts it into parts and sends each part to
// the right agent with that agent's memory and the right template.
// This route only plans; the window posts each routed part to its agent.
export const agentRouterRouter = express.Router();
const log = createLogger('agent-router');

const MAX_REQUEST = 2000;
const MAX_NOTES = 3;

async function scopeFor(req) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Sign in first.'), { statusCode: 401 });
  const workspaceId = String(req.query?.workspaceId || req.body?.workspaceId || '').trim();
  if (!workspaceId) throw Object.assign(new Error('Open a workspace first.'), { statusCode: 400 });
  const workspace = await requireWorkspaceMember(pool, { userId, workspaceId });
  return { userId, workspaceId: workspace.id };
}

async function boardAgents(scope) {
  const [main, subs] = await Promise.all([
    getDbAgents().catch(() => []),
    getAllSubAgents({ workspaceId: scope.workspaceId, userId: scope.userId }).catch(() => []),
  ]);
  return [...main, ...subs];
}

/** The picked agent's own notes that mention this part's topic (its memory for the route). */
async function notesFor(scope, agentId, intent) {
  const want = new Set(intent.topicWords?.length ? intent.topicWords : routerWords(intent.thing || ''));
  if (!want.size) return [];
  const facts = await currentFacts(pool, { userId: scope.userId, agentId, limit: 200 }).catch(() => []);
  return facts
    .map((fact) => [fact.subject, fact.attribute, fact.value].filter(Boolean).join(' ').trim())
    .filter((text) => routerWords(text).some((word) => want.has(word)))
    .slice(0, MAX_NOTES)
    .map((text) => text.slice(0, 160));
}

agentRouterRouter.post('/agent-router/plan', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    const text = String(req.body?.text || '').trim().slice(0, MAX_REQUEST);
    if (!text) return res.status(400).json({ error: 'Say what you need, like "make some documents for work and a microapp for invoices".' });
    const [agents, blueprints] = await Promise.all([
      boardAgents(scope),
      listBlueprints(pool, scope.workspaceId).catch(() => []),
    ]);
    const first = buildRoutePlan(text, { agents, blueprints, workspaceId: scope.workspaceId });
    const notes = new Map();
    await Promise.all(first.parts.map(async (part) => {
      notes.set(`${part.agent.id}\n${part.text}`, await notesFor(scope, part.agent.id, part));
    }));
    const plan = buildRoutePlan(text, {
      agents, blueprints, workspaceId: scope.workspaceId,
      memoryFor: (agentId, intent) => notes.get(`${agentId}\n${intent.text}`) || [],
    });
    // Only the board, the part count and the agent ids: never the request itself.
    log.info('routed', { workspaceId: scope.workspaceId, parts: plan.parts.length, agents: plan.parts.map((part) => part.agent.id) });
    return res.json({ plan });
  } catch (error) {
    const status = Number(error?.statusCode || error?.status);
    if (Number.isInteger(status) && status >= 400 && status < 600) return res.status(status).json({ error: error.message });
    return res.status(500).json({ error: 'The message router is not available right now.' });
  }
});
