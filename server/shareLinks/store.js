// server/shareLinks/store.js
//
// Postgres access for share links, their audit list and canvas comments.
// Every function takes the db (pool or client) first so tests can pass a
// fake and routes can pass the shared pool.

import { SHARE_ROLES, SHARE_SCOPES } from './access.js';
import { createShareToken, hashPasscode, hashShareToken } from './tokens.js';

const MAX_LABEL_LENGTH = 80;
const MAX_EXPIRY_HOURS = 24 * 90;
const MAX_AGENT_BUDGET = 2_000_000;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

export class ShareLinkError extends Error {
  constructor(message, { code = 'SHARE_LINK_ERROR', statusCode = 400 } = {}) {
    super(message);
    this.name = 'ShareLinkError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Always selected through the alias `l` so joins (workspaces, joins) stay unambiguous.
const LINK_COLUMNS = `l.id, l.workspace_id, l.role, l.scope_kind, l.scope_id, l.mode, l.stage, l.label,
  (l.passcode_hash IS NOT NULL) AS has_passcode, l.expires_at, l.agent_budget_tokens,
  l.agent_tokens_used, l.created_by_user_id, l.created_at, l.revoked_at`;

export function linkIsActive(link, now = new Date()) {
  if (!link || link.revoked_at) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

export function normalizeLinkInput(input = {}) {
  const role = String(input.role || 'view');
  if (!SHARE_ROLES.includes(role)) {
    throw new ShareLinkError('Pick view, comment or edit.', { code: 'INVALID_SHARE_ROLE' });
  }
  const mode = input.mode === 'live' ? 'live' : 'link';
  const scopeKind = String(input.scopeKind || 'board');
  if (!SHARE_SCOPES.includes(scopeKind)) {
    throw new ShareLinkError('Pick the whole board, a group or one window.', { code: 'INVALID_SHARE_SCOPE' });
  }
  const scopeId = scopeKind === 'board' ? null : String(input.scopeId || '').trim();
  if (scopeKind !== 'board' && !ID_PATTERN.test(scopeId)) {
    throw new ShareLinkError('Choose which group or window to share.', { code: 'INVALID_SHARE_SCOPE_ID' });
  }
  if (role === 'edit' && (scopeKind !== 'board' || mode === 'live')) {
    throw new ShareLinkError('Edit links share the whole board. Use view or comment for a group or window.', {
      code: 'EDIT_SCOPE_UNSUPPORTED',
    });
  }
  let expiresAt = null;
  const hours = Number(input.expiresInHours);
  if (input.expiresInHours !== undefined && input.expiresInHours !== null && input.expiresInHours !== '') {
    if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_EXPIRY_HOURS) {
      throw new ShareLinkError('Expiry must be between a few minutes and 90 days.', { code: 'INVALID_SHARE_EXPIRY' });
    }
    expiresAt = new Date(Date.now() + hours * 3600_000);
  }
  const budget = Math.floor(Number(input.agentBudgetTokens || 0));
  if (!Number.isFinite(budget) || budget < 0 || budget > MAX_AGENT_BUDGET) {
    throw new ShareLinkError('Agent budget must be between 0 and 2,000,000 tokens.', { code: 'INVALID_AGENT_BUDGET' });
  }
  const passcode = String(input.passcode ?? '');
  return {
    role,
    mode,
    scopeKind,
    scopeId: scopeId || null,
    stage: Boolean(input.stage),
    label: String(input.label || '').trim().slice(0, MAX_LABEL_LENGTH) || null,
    expiresAt,
    passcodeHash: passcode ? hashPasscode(passcode) : null,
    // Stream links never reach the agents; the bill is the owner's.
    agentBudgetTokens: mode === 'live' || role === 'view' ? 0 : budget,
  };
}

/** Create a link. Returns the stored row plus the raw token (shown once). */
export async function createShareLink(db, { workspaceId, userId, input }) {
  const fields = normalizeLinkInput(input);
  const token = createShareToken();
  const { rows } = await db.query(
    `INSERT INTO share_links AS l (workspace_id, token_hash, role, scope_kind, scope_id, mode, stage,
       label, passcode_hash, expires_at, agent_budget_tokens, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING ${LINK_COLUMNS}`,
    [workspaceId, hashShareToken(token), fields.role, fields.scopeKind, fields.scopeId, fields.mode,
      fields.stage, fields.label, fields.passcodeHash, fields.expiresAt, fields.agentBudgetTokens, userId],
  );
  return { link: rows[0], token };
}

export async function listShareLinks(db, { workspaceId }) {
  const { rows } = await db.query(
    `SELECT ${LINK_COLUMNS},
            (SELECT COUNT(*)::int FROM share_link_joins j WHERE j.link_id = l.id) AS join_count
       FROM share_links l
      WHERE l.workspace_id = $1
      ORDER BY l.created_at DESC
      LIMIT 100`,
    [workspaceId],
  );
  return rows;
}

export async function getShareLink(db, { workspaceId, linkId }) {
  const { rows } = await db.query(
    `SELECT ${LINK_COLUMNS} FROM share_links l WHERE l.workspace_id = $1 AND l.id::text = $2`,
    [workspaceId, String(linkId)],
  );
  return rows[0] || null;
}

/** Look a link up by its raw token, with the hash needed to check a passcode. */
export async function findShareLinkByToken(db, token) {
  const { rows } = await db.query(
    `SELECT ${LINK_COLUMNS}, l.passcode_hash, w.name AS workspace_name
       FROM share_links l JOIN workspaces w ON w.id = l.workspace_id
      WHERE l.token_hash = $1`,
    [hashShareToken(token)],
  );
  return rows[0] || null;
}

export async function getShareLinkById(db, linkId) {
  const { rows } = await db.query(
    `SELECT ${LINK_COLUMNS}, w.name AS workspace_name
       FROM share_links l JOIN workspaces w ON w.id = l.workspace_id
      WHERE l.id::text = $1`,
    [String(linkId)],
  );
  return rows[0] || null;
}

export async function revokeShareLink(db, { workspaceId, linkId }) {
  const { rows } = await db.query(
    `UPDATE share_links l SET revoked_at = COALESCE(l.revoked_at, NOW())
      WHERE l.workspace_id = $1 AND l.id::text = $2
      RETURNING ${LINK_COLUMNS}`,
    [workspaceId, String(linkId)],
  );
  return rows[0] || null;
}

export async function revokeLiveLinks(db, { workspaceId }) {
  const { rows } = await db.query(
    `UPDATE share_links SET revoked_at = NOW()
      WHERE workspace_id = $1 AND mode = 'live' AND revoked_at IS NULL
      RETURNING id`,
    [workspaceId],
  );
  return rows.map((row) => row.id);
}

export async function setLinkStage(db, { workspaceId, linkId, stage }) {
  const { rows } = await db.query(
    `UPDATE share_links l SET stage = $3 WHERE l.workspace_id = $1 AND l.id::text = $2
      RETURNING ${LINK_COLUMNS}`,
    [workspaceId, String(linkId), Boolean(stage)],
  );
  return rows[0] || null;
}

export async function recordShareLinkJoin(db, { linkId, guestId, name, color }) {
  await db.query(
    `INSERT INTO share_link_joins (link_id, guest_id, display_name, color) VALUES ($1,$2,$3,$4)`,
    [linkId, guestId, name, color],
  );
}

export async function listShareLinkJoins(db, { workspaceId, linkId }) {
  const { rows } = await db.query(
    `SELECT j.guest_id, j.display_name, j.color, j.joined_at
       FROM share_link_joins j JOIN share_links l ON l.id = j.link_id
      WHERE l.workspace_id = $1 AND l.id::text = $2
      ORDER BY j.joined_at DESC
      LIMIT 500`,
    [workspaceId, String(linkId)],
  );
  return rows;
}

/**
 * Reserve agent budget before a call. Returns false when the link has no
 * budget left; the caller then answers "budget used up" without a model call.
 */
export async function linkHasAgentBudget(db, linkId) {
  const { rows } = await db.query(
    `SELECT agent_budget_tokens, agent_tokens_used FROM share_links WHERE id::text = $1`,
    [String(linkId)],
  );
  const row = rows[0];
  return Boolean(row && row.agent_tokens_used < row.agent_budget_tokens);
}

export async function chargeAgentBudget(db, linkId, tokens) {
  const spent = Math.max(0, Math.ceil(Number(tokens) || 0));
  const { rows } = await db.query(
    `UPDATE share_links SET agent_tokens_used = agent_tokens_used + $2
      WHERE id::text = $1
      RETURNING agent_budget_tokens, agent_tokens_used`,
    [String(linkId), spent],
  );
  return rows[0] || null;
}

export function publicShareLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    role: row.role,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    mode: row.mode,
    stage: Boolean(row.stage),
    label: row.label,
    hasPasscode: Boolean(row.has_passcode),
    expiresAt: row.expires_at,
    agentBudgetTokens: row.agent_budget_tokens,
    agentTokensUsed: row.agent_tokens_used,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    active: linkIsActive(row),
    joinCount: row.join_count ?? undefined,
  };
}

export * from './commentRows.js';
