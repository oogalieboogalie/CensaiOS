import pool from '../db.js';
import { hkdfSync, randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { calculateEmotionalWeight } from './scoring.js';
import { resolveMemoryScope } from './tenancy.js';

// ═══════════════════════════════════════════════════════════════════
//  JOURNAL ENCRYPTION (private sanctuary)
// ═══════════════════════════════════════════════════════════════════

const MASTER_SECRET = process.env.JOURNAL_SECRET || 'homebase-family-sanctuary-default-key';

function deriveAgentKey(agentId, workspaceId) {
  return Buffer.from(hkdfSync('sha256', MASTER_SECRET, `${agentId}:${workspaceId}`, 'journal-encryption', 32));
}

function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(ciphertext, key) {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
}

export async function ensureAgentKey(agentId, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  const { rows } = await pool.query(
    'SELECT key_hash FROM journal_key_scopes WHERE agent_id = $1 AND workspace_id = $2',
    [agentId, scope.workspaceId],
  );
  if (rows.length > 0) return;

  const key = deriveAgentKey(agentId, scope.workspaceId);
  const keyHash = createHash('sha256').update(key).digest('hex');
  await pool.query(
    `INSERT INTO journal_key_scopes (agent_id, workspace_id, key_hash, created_by_user_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (workspace_id, agent_id) DO NOTHING`,
    [agentId, scope.workspaceId, keyHash, scope.userId]
  );
}

export async function writeJournal(agentId, content, entryType = 'reflection', opts = {}) {
  const scope = resolveMemoryScope(opts, { requireUser: true });
  await ensureAgentKey(agentId, scope);
  const key = deriveAgentKey(agentId, scope.workspaceId);
  const encryptedContent = encrypt(content, key);
  const emotionalWeight = opts.emotionalWeight ?? calculateEmotionalWeight(content);

  const { rows } = await pool.query(
    `INSERT INTO journals (agent_id, encrypted_content, entry_type, emotional_weight, project, tags,
       workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
    [agentId, encryptedContent, entryType, emotionalWeight, opts.project || null, opts.tags || [],
      scope.workspaceId, scope.userId]
  );
  return rows[0];
}

export async function countJournals(agentId, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM journals WHERE agent_id = $1 AND workspace_id = $2',
    [agentId, scope.workspaceId]
  );
  return rows[0].count;
}

export async function readJournals(agentId, opts = {}) {
  const scope = resolveMemoryScope(opts);
  const key = deriveAgentKey(agentId, scope.workspaceId);
  const limit = opts.limit || 20;
  const entryType = opts.entryType || null;

  let sql = 'SELECT * FROM journals WHERE agent_id = $1 AND workspace_id = $2';
  const params = [agentId, scope.workspaceId];
  let pi = 3;

  if (entryType) { sql += ` AND entry_type = $${pi++}`; params.push(entryType); }
  sql += ` ORDER BY created_at DESC LIMIT $${pi}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);

  return rows.map(row => {
    try {
      return { ...row, content: decrypt(row.encrypted_content, key), encrypted_content: undefined };
    } catch {
      return { ...row, content: '[decryption failed]', encrypted_content: undefined };
    }
  });
}
