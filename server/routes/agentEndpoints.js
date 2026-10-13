// server/routes/agentEndpoints.js
//
// The owner's side of agent endpoints (behind the session guard): share an
// agent, turn sharing on and off, make and revoke keys, read the call log.
// Every route is scoped to the signed-in user; one person can never see or
// change another person's endpoints or keys.

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import * as store from '../agentEndpoints/store.js';
import { toolNameFor } from '../agentEndpoints/mcpProtocol.js';
import { OUTSIDE_CALLER_TOOLS } from '../agentEndpoints/runAgent.js';
import { LIMITS } from '../agentEndpoints/rateLimit.js';
import { outsideListenerPort } from '../agentEndpoints/outsideListener.js';
import { relayAddressFor, relayLinkStatus } from '../agentNetwork/relayLink.js';

const AGENT_ID = /^[A-Za-z0-9._-]{1,64}$/;
const WINDOW_ID = /^[A-Za-z0-9._:-]{1,96}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function endpointView(row) {
  return {
    id: row.id,
    cardId: row.card_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    windowId: row.window_id,
    enabled: Boolean(row.enabled),
    toolName: toolNameFor(row.agent_name),
    mcpPath: `/api/mcp/agents/${row.id}`,
    askPath: `/api/mcp/agents/${row.id}/ask`,
    createdAt: row.created_at,
  };
}

export function tokenView(row) {
  return {
    id: row.id,
    label: row.label,
    hint: row.token_hint,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

function callView(row) {
  return {
    id: String(row.id),
    via: row.via,
    status: row.status,
    question: row.question,
    answerChars: row.answer_chars,
    durationMs: row.duration_ms,
    keyLabel: row.token_label || null,
    at: row.created_at,
  };
}

export function createAgentEndpointsRouter({ db = pool, isReady = dbReady } = {}) {
  const router = express.Router();
  const userOf = (req) => req.session?.userId;

  router.use((req, res, next) => {
    if (!isReady()) return res.status(503).json({ error: 'The database is not ready yet.' });
    if (!userOf(req)) return res.status(401).json({ error: 'Sign in first.' });
    return next();
  });

  const fail = (res, error) => res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'Something went wrong.',
  });

  async function detail(endpoint) {
    const [tokens, calls] = await Promise.all([
      store.listTokens(db, { endpointId: endpoint.id }),
      store.listCalls(db, { endpointId: endpoint.id, limit: 20 }),
    ]);
    return {
      endpoint: endpointView(endpoint),
      keys: tokens.map(tokenView),
      calls: calls.map(callView),
      limits: LIMITS,
      outsidePort: outsideListenerPort(),
      outsideTools: OUTSIDE_CALLER_TOOLS,
      relay: relayLinkStatus(),
      relayAddress: relayAddressFor(endpoint.id),
    };
  }

  async function owned(req) {
    if (!UUID.test(String(req.params.id))) throw new store.AgentEndpointError('No shared agent with that id.', 404);
    const endpoint = await store.getEndpoint(db, { userId: userOf(req), endpointId: String(req.params.id) });
    if (!endpoint) throw new store.AgentEndpointError('No shared agent with that id.', 404);
    return endpoint;
  }

  router.get('/', async (req, res) => {
    try {
      const workspaceId = String(req.query.workspaceId || '');
      await requireWorkspaceMember(db, { userId: userOf(req), workspaceId });
      const rows = await store.listEndpoints(db, { userId: userOf(req), workspaceId });
      return res.json({ endpoints: rows.map(endpointView) });
    } catch (error) { return fail(res, error); }
  });

  // Find or create the endpoint for one agent. New endpoints start switched off.
  router.post('/', async (req, res) => {
    try {
      const { workspaceId, agentId, agentName, windowId } = req.body || {};
      if (!AGENT_ID.test(String(agentId || ''))) throw new store.AgentEndpointError('Pick an agent to share.');
      if (windowId && !WINDOW_ID.test(String(windowId))) throw new store.AgentEndpointError('That window id is not valid.');
      await requireWorkspaceMember(db, { userId: userOf(req), workspaceId: String(workspaceId || '') });
      const id = String(agentId).toLowerCase();
      const endpoint = await store.upsertEndpoint(db, {
        userId: userOf(req),
        workspaceId: String(workspaceId),
        cardId: `agent:${id}`,
        agentId: String(agentId),
        agentName: store.cleanLabel(agentName || agentId),
        windowId: windowId ? String(windowId) : null,
      });
      return res.json(await detail(endpoint));
    } catch (error) { return fail(res, error); }
  });

  router.get('/:id', async (req, res) => {
    try { return res.json(await detail(await owned(req))); } catch (error) { return fail(res, error); }
  });

  router.patch('/:id', async (req, res) => {
    try {
      await owned(req);
      if (typeof req.body?.enabled !== 'boolean') throw new store.AgentEndpointError('Say whether sharing is on or off.');
      const endpoint = await store.setEndpointEnabled(db, { userId: userOf(req), endpointId: String(req.params.id), enabled: req.body.enabled });
      return res.json(await detail(endpoint));
    } catch (error) { return fail(res, error); }
  });

  // The plain key is returned once, here, and never again.
  router.post('/:id/keys', async (req, res) => {
    try {
      const endpoint = await owned(req);
      const { token, row } = await store.createToken(db, { endpointId: endpoint.id, label: req.body?.label });
      return res.status(201).json({ key: token, created: tokenView(row), ...(await detail(endpoint)) });
    } catch (error) { return fail(res, error); }
  });

  router.delete('/:id/keys/:keyId', async (req, res) => {
    try {
      const endpoint = await owned(req);
      if (!UUID.test(String(req.params.keyId))) throw new store.AgentEndpointError('No key with that id.', 404);
      const row = await store.revokeToken(db, { endpointId: endpoint.id, tokenId: String(req.params.keyId) });
      if (!row) throw new store.AgentEndpointError('No key with that id.', 404);
      return res.json(await detail(endpoint));
    } catch (error) { return fail(res, error); }
  });

  return router;
}

export const agentEndpointsRouter = createAgentEndpointsRouter();
