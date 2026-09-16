import crypto from 'crypto';
import pool from '../db.js';

export function hashCanvasToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createCanvasIntegrationToken(db = pool, {
  workspaceId,
  name,
  scopes = ['canvas:write'],
  preApproved = true,
  createdByUserId = null,
}) {
  const wsId = String(workspaceId || '').trim();
  const tokenName = String(name || '').trim();
  if (!wsId) throw new Error('workspaceId is required');
  if (!tokenName) throw new Error('name is required');

  const randomPart = crypto.randomBytes(24).toString('hex');
  const token = `cit_${randomPart}`;
  const tokenHash = hashCanvasToken(token);
  const tokenPrefix = token.slice(0, 8);

  const cleanScopes = Array.isArray(scopes) && scopes.length ? scopes : ['canvas:write'];

  const { rows } = await db.query(
    `INSERT INTO canvas_integration_tokens
       (token_hash, token_prefix, name, workspace_id, scopes, pre_approved, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, token_prefix, name, workspace_id, scopes, pre_approved, created_at`,
    [tokenHash, tokenPrefix, tokenName, wsId, cleanScopes, Boolean(preApproved), createdByUserId || null]
  );

  return {
    token,
    id: rows[0].id,
    tokenPrefix: rows[0].token_prefix,
    name: rows[0].name,
    workspaceId: rows[0].workspace_id,
    scopes: rows[0].scopes,
    preApproved: rows[0].pre_approved,
    createdAt: rows[0].created_at,
  };
}

export async function verifyCanvasIntegrationToken(db = pool, rawToken, requiredScope = 'canvas:write') {
  const token = String(rawToken || '').trim();
  if (!token) {
    return {
      valid: false,
      statusCode: 401,
      error: 'unauthenticated',
      message: 'Authentication token is required.',
    };
  }

  const tokenHash = hashCanvasToken(token);
  const { rows } = await db.query(
    `SELECT id, name, workspace_id, scopes, pre_approved, created_at
     FROM canvas_integration_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  const tokenRecord = rows[0];
  if (!tokenRecord) {
    return {
      valid: false,
      statusCode: 403,
      error: 'invalid_token',
      message: 'Invalid or expired token.',
    };
  }

  const scopes = Array.isArray(tokenRecord.scopes) ? tokenRecord.scopes : [];
  if (requiredScope && !scopes.includes(requiredScope)) {
    return {
      valid: false,
      statusCode: 403,
      error: 'insufficient_scope',
      message: `Token missing required scope: ${requiredScope}`,
    };
  }

  return {
    valid: true,
    tokenRecord,
    tokenId: tokenRecord.id,
    name: tokenRecord.name,
    workspaceId: tokenRecord.workspace_id,
    scopes,
    preApproved: Boolean(tokenRecord.pre_approved),
  };
}

export async function listCanvasIntegrationTokens(db = pool, workspaceId) {
  const wsId = String(workspaceId || '').trim();
  if (!wsId) return [];

  const { rows } = await db.query(
    `SELECT id, token_prefix, name, workspace_id, scopes, pre_approved, created_at, updated_at
     FROM canvas_integration_tokens
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [wsId]
  );

  return rows;
}

export async function revokeCanvasIntegrationToken(db = pool, { id, workspaceId }) {
  const tokenId = String(id || '').trim();
  const wsId = String(workspaceId || '').trim();
  if (!tokenId || !wsId) return false;

  const { rowCount } = await db.query(
    `DELETE FROM canvas_integration_tokens WHERE id = $1 AND workspace_id = $2`,
    [tokenId, wsId]
  );

  return rowCount > 0;
}
