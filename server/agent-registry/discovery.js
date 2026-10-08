// AGENT NETWORK — workspace-aware discovery.
// Answers "which agents can help with X?" for a signed member of a
// workspace: only cards that member may read are ranked, and each result
// says whether it can actually be called (has an executor adapter),
// whether it is pinned here, and whether a help request would run at once
// (same team) or wait for the card owner's consent.

import { actorWithWorkspaceAccess } from './access.js';
import { canReadCard, isSystemAgentCard, resolveAgentCardExecutor } from '../agent-card-runs/contract.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { cardSkills, rankAgentCards } from './discoveryRank.js';

const MAX_CANDIDATES = 500;

export function executorKind(card) {
  try {
    return resolveAgentCardExecutor(card).kind;
  } catch {
    return null;
  }
}

export function acceptsHelpRequests(card) {
  return card?.metadata?.acceptsHelpRequests !== false;
}

export function isSameTeamCard(card, { workspaceId, userId }) {
  return isSystemAgentCard(card)
    || (Boolean(card?.workspace_id) && String(card.workspace_id) === String(workspaceId))
    || (card?.owner_id != null && String(card.owner_id) === String(userId));
}

export function visibleInWorkspace(card, workspaceId) {
  return isSystemAgentCard(card) || card?.visibility === 'public'
    || String(card?.workspace_id || '') === String(workspaceId);
}

export function summarizeCandidate(entry, { workspaceId, userId, installedIds }) {
  const { card } = entry;
  const kind = executorKind(card);
  return {
    cardId: card.id,
    name: card.name,
    description: card.description,
    version: card.version,
    visibility: card.visibility,
    score: Math.round(entry.score * 10) / 10,
    reasons: entry.reasons,
    matchedSkills: entry.matchedSkills.map(({ id, name, description, tags }) => ({ id, name, description, tags })),
    skills: cardSkills(card).map(({ id, name, tags }) => ({ id, name, tags })),
    installed: installedIds.has(card.id),
    callable: Boolean(kind),
    executorKind: kind,
    acceptsRequests: acceptsHelpRequests(card),
    approval: isSameTeamCard(card, { workspaceId, userId }) ? 'auto' : 'owner',
    agentCanRequest: isSystemAgentCard(card) || installedIds.has(card.id),
  };
}

export async function listReadableCards(db, { userId, workspaceId }) {
  const actor = await actorWithWorkspaceAccess({ kind: 'user', id: String(userId) }, db);
  const { rows } = await db.query(
    `SELECT * FROM agent_cards WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT ${MAX_CANDIDATES}`,
  );
  return rows.filter((card) => canReadCard(card, actor) && visibleInWorkspace(card, workspaceId));
}

/**
 * @param {object} db  pg pool / client
 * @param {object} input { userId, workspaceId, query, tags, limit, excludeCardIds }
 */
export async function discoverAgents(db, {
  userId, workspaceId, query = '', tags = [], limit = 10, excludeCardIds = [],
} = {}) {
  await requireWorkspaceMember(db, { workspaceId, userId });
  const exclude = new Set((excludeCardIds || []).map(String));
  const [cards, installs] = await Promise.all([
    listReadableCards(db, { userId, workspaceId }),
    db.query('SELECT card_id FROM workspace_agent_card_installs WHERE workspace_id=$1', [workspaceId]),
  ]);
  const installedIds = new Set(installs.rows.map((row) => row.card_id));
  const ranked = rankAgentCards(cards.filter((card) => !exclude.has(card.id)), {
    query, tags, limit, isPreferred: (card) => installedIds.has(card.id) || Boolean(executorKind(card)),
  });
  return {
    query: String(query || ''),
    tags: Array.isArray(tags) ? tags : [],
    items: ranked.map((entry) => summarizeCandidate(entry, { workspaceId, userId, installedIds })),
  };
}
