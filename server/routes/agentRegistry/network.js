// Agent Registry — agent network (discovery + help requests).
//   GET  /discover?workspaceId&q&tags&limit   rank agents by advertised skills
//   GET  /help-requests?workspaceId           outgoing (this workspace) + incoming (cards I own)
//   POST /help-requests                       { workspaceId, cardId, task, skillId?, onBehalfOf? }
//   GET  /help-requests/:id?workspaceId
//   POST /help-requests/:id/decision          { decision: accept|decline, note? }  (card owner)
//   POST /help-requests/:id/cancel            { workspaceId }                      (requester)
// The router-level requireActor guard has already run; req.agentActor is set.

import pool from '../../db.js';
import { discoverAgents } from '../../agent-registry/discovery.js';
import {
  AgentHelpError,
  cancelHelpRequest,
  createHelpRequest,
  decideHelpRequest,
  getHelpRequest,
  listHelpRequests,
} from '../../agent-registry/helpRequests.js';
import { FAMILY_AGENT_BY_ID } from '../../../src/data/family-agents.js';

function scope(req) {
  const queryId = String(req.query?.workspaceId || '').trim();
  const bodyId = String(req.body?.workspaceId || '').trim();
  if (queryId && bodyId && queryId !== bodyId) {
    throw new AgentHelpError('Conflicting workspace IDs are not allowed.', 400, 'AGENT_NETWORK_SCOPE_CONFLICT');
  }
  const workspaceId = queryId || bodyId;
  if (!workspaceId) {
    throw new AgentHelpError('Open a workspace to use the agent network.', 400, 'AGENT_NETWORK_SCOPE_REQUIRED');
  }
  return { workspaceId, userId: Number(req.agentActor.id) };
}

function fail(res, error) {
  const status = Number(error?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: 'The agent network is temporarily unavailable.' });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestId(req) {
  const id = String(req.params?.id || '');
  if (!UUID.test(id)) throw new AgentHelpError('Help request not found.', 404, 'AGENT_HELP_NOT_FOUND');
  return id;
}

function parseTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 10);
}

// A person may file a request on behalf of one of the built-in family
// agents (so the helper knows who is asking); anything else is the user.
export function requesterFrom(body, userId) {
  const agentId = String(body?.onBehalfOf || '').trim().toLowerCase();
  if (agentId && FAMILY_AGENT_BY_ID[agentId]) return { kind: 'agent', id: agentId };
  return { kind: 'user', id: String(userId) };
}

export async function discover(req, res) {
  try {
    const auth = scope(req);
    res.json(await discoverAgents(pool, {
      ...auth,
      query: String(req.query?.q || '').slice(0, 500),
      tags: parseTags(req.query?.tags),
      limit: req.query?.limit,
    }));
  } catch (error) {
    fail(res, error);
  }
}

export async function listRequests(req, res) {
  try {
    const auth = scope(req);
    res.json({ workspaceId: auth.workspaceId, ...(await listHelpRequests(pool, auth)) });
  } catch (error) {
    fail(res, error);
  }
}

export async function createRequest(req, res) {
  try {
    const auth = scope(req);
    const body = req.body || {};
    const request = await createHelpRequest(pool, {
      ...auth,
      cardId: body.cardId,
      task: body.task,
      skillId: body.skillId,
      requester: requesterFrom(body, auth.userId),
    });
    res.status(201).json(request);
  } catch (error) {
    fail(res, error);
  }
}

export async function readRequest(req, res) {
  try {
    res.json(await getHelpRequest(pool, { ...scope(req), id: requestId(req) }));
  } catch (error) {
    fail(res, error);
  }
}

export async function decideRequest(req, res) {
  try {
    res.json(await decideHelpRequest(pool, {
      id: requestId(req),
      userId: Number(req.agentActor.id),
      decision: String(req.body?.decision || ''),
      note: req.body?.note,
    }));
  } catch (error) {
    fail(res, error);
  }
}

export async function cancelRequest(req, res) {
  try {
    res.json(await cancelHelpRequest(pool, { ...scope(req), id: requestId(req) }));
  } catch (error) {
    fail(res, error);
  }
}
