// Agent Registry — CRUD handlers.
// Backed by server/agent-registry/factories.js. Card access is resolved through
// the shared membership-aware policy in server/agent-registry/access.js:
// built-in family cards remain public, workspace cards require membership, and
// private cards require both ownership and membership in their owning workspace.
//
// owner_id format: we use the actor id (the session userId, stringified).
// This is consistent with the factory's TEXT owner_id column.

import {
  createAgentCard,
  getAgentCard,
  listAgentCards,
  updateAgentCard,
  deleteAgentCard,
} from '../../agent-registry/factories.js';
import {
  actorWithWorkspaceAccess,
  canActorReadCard,
  resolveRegistryWorkspace,
} from '../../agent-registry/access.js';
import { canReadCard, isSystemAgentCard } from '../../agent-card-runs/contract.js';
import {
  sanitizeUserCardMetadata,
  sanitizeUserCardPatch,
} from '../../agent-registry/reservedMetadata.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseIntParam(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function generateOwnerScopedId(actorId, requestedId) {
  // The built-in "agent:*" namespace is reserved. Imported user cards
  // may keep an explicit external id; otherwise mint an owner-scoped id.
  if (requestedId && typeof requestedId === 'string' && requestedId.trim()) {
    const normalized = requestedId.trim();
    if (normalized.toLowerCase().startsWith('agent:')) {
      throw new Error('The agent: id namespace is reserved for built-in family agents');
    }
    return normalized;
  }
  const slug = Math.random().toString(36).slice(2, 8);
  return `ext:${actorId}:${Date.now().toString(36)}-${slug}`;
}

function routeError(res, err, fallback = 400) {
  return res.status(err.statusCode || fallback).json({ error: err.message, code: err.code });
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function listCards(req, res) {
  try {
    const { visibility, owner_id, workspace_id } = req.query;
    const limit = parseIntParam(req.query.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
    const offset = parseIntParam(req.query.offset, 0, { min: 0 });

    const actor = req.agentActor
      ? await actorWithWorkspaceAccess(req.agentActor)
      : null;
    if (workspace_id && actor) {
      await resolveRegistryWorkspace({ userId: actor.id, workspaceId: workspace_id });
    }
    const rows = await listAgentCards({ visibility, owner_id, limit: 500, offset: 0 });
    const accessible = rows
      .filter((row) => canReadCard(row, actor))
      .filter((row) => !workspace_id || isSystemAgentCard(row) || row.workspace_id === workspace_id);
    const items = accessible.slice(offset, offset + limit);

    res.json({
      items,
      total: accessible.length,
      limit,
      offset,
    });
  } catch (err) {
    routeError(res, err);
  }
}

// ─── READ ONE ────────────────────────────────────────────────────────────────

export async function readCard(req, res) {
  try {
    const card = await getAgentCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Visibility-aware auth: a private card MUST know its caller to
    // decide whether to hide. resolveActor in index.js always sets
    // req.agentActor (null when unauthenticated), so we just check
    // visibility here. Public and workspace cards stay reachable
    // without auth; private cards need an authenticated owner.
    const actor = req.agentActor;
    if (card.visibility !== 'public' && !actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!(await canActorReadCard(card, actor))) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json(card);
  } catch (err) {
    routeError(res, err);
  }
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export async function createCard(req, res) {
  try {
    const actor = req.agentActor;
    if (!actor) return res.status(401).json({ error: 'Authentication required' });

    const body = req.body || {};
    const id = generateOwnerScopedId(actor.id, body.id);
    const workspace = await resolveRegistryWorkspace({
      userId: actor.id,
      workspaceId: body.workspaceId || body.workspace_id || null,
    });

    const card = await createAgentCard({
      id,
      name: body.name,
      description: body.description,
      version: body.version,
      skills: body.skills,
      endpoint: body.endpoint,
      auth: body.auth,
      metadata: sanitizeUserCardMetadata(body.metadata),
      // Default to 'private' at the route level so the factory's arg
      // always carries an explicit visibility. The factory would
      // default to 'private' anyway, but passing it through makes the
      // surface easier to reason about in tests and dashboards.
      visibility: body.visibility || 'private',
      owner_id: actor.id,
      workspace_id: workspace.id,
    });
    res.status(201).json(card);
  } catch (err) {
    routeError(res, err);
  }
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

export async function updateCard(req, res) {
  try {
    const actor = req.agentActor;
    if (!actor) return res.status(401).json({ error: 'Authentication required' });

    const existing = await getAgentCard(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Card not found' });
    if (existing.owner_id !== actor.id) {
      return res.status(403).json({ error: 'Only the owner can update this card' });
    }
    if (!existing.workspace_id) {
      return res.status(409).json({ error: 'Legacy AgentCard requires an explicit ownership claim.' });
    }
    if (!(await canActorReadCard(existing, actor))) {
      return res.status(403).json({ error: 'Workspace access denied' });
    }

    const patch = sanitizeUserCardPatch(req.body || {});
    // owner_id and id are immutable after creation — strip them defensively.
    delete patch.id;
    delete patch.owner_id;
    delete patch.workspaceId;
    delete patch.workspace_id;

    const updated = await updateAgentCard(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'Card not found' });
    res.json(updated);
  } catch (err) {
    routeError(res, err);
  }
}

// ─── SOFT DELETE ─────────────────────────────────────────────────────────────

export async function deleteCard(req, res) {
  try {
    const actor = req.agentActor;
    if (!actor) return res.status(401).json({ error: 'Authentication required' });

    const existing = await getAgentCard(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Card not found' });
    if (existing.owner_id !== actor.id) {
      return res.status(403).json({ error: 'Only the owner can delete this card' });
    }
    if (!existing.workspace_id) {
      return res.status(409).json({ error: 'Legacy AgentCard requires an explicit ownership claim.' });
    }
    if (!(await canActorReadCard(existing, actor))) {
      return res.status(403).json({ error: 'Workspace access denied' });
    }

    const removed = await deleteAgentCard(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Card not found' });
    res.status(204).end();
  } catch (err) {
    routeError(res, err);
  }
}
