import pool from '../db.js';
import {
  decryptCredential,
  encryptCredential,
} from '../security/credentialVault.js';

const SELECT_COLUMNS = `
  user_id, provider, encrypted_access_token, encrypted_refresh_token,
  access_token, refresh_token, expiry_date, scope
`;

export async function saveOAuthCredential({
  db = pool,
  userId,
  provider,
  tokens,
}) {
  const context = { ownerId: userId, provider };
  const encryptedAccess = encryptCredential(tokens.access_token, context);
  const encryptedRefresh = encryptCredential(tokens.refresh_token, context);
  await db.query(
    `INSERT INTO user_tokens (
       user_id, provider, encrypted_access_token, encrypted_refresh_token,
       access_token, refresh_token, expiry_date, scope
     ) VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       encrypted_access_token = $3,
       encrypted_refresh_token = COALESCE($4, user_tokens.encrypted_refresh_token),
       access_token = NULL,
       refresh_token = NULL,
       expiry_date = $5,
       scope = $6,
       updated_at = NOW()`,
    [
      userId,
      provider,
      encryptedAccess,
      encryptedRefresh,
      tokens.expiry_date || null,
      tokens.scope || null,
    ]
  );
}

function decryptRow(row) {
  const context = { ownerId: row.user_id, provider: row.provider };
  return {
    access_token: row.encrypted_access_token
      ? decryptCredential(row.encrypted_access_token, context)
      : row.access_token,
    refresh_token: row.encrypted_refresh_token
      ? decryptCredential(row.encrypted_refresh_token, context)
      : row.refresh_token,
    expiry_date: row.expiry_date ? Number(row.expiry_date) : undefined,
    scope: row.scope,
  };
}

export async function getOAuthCredential({
  db = pool,
  userId,
  provider,
}) {
  const values = userId ? [userId, provider] : [provider];
  const where = userId
    ? 'user_id = $1 AND provider = $2'
    : 'provider = $1 ORDER BY updated_at DESC LIMIT 1';
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM user_tokens WHERE ${where}`,
    values
  );
  if (!rows.length) return null;
  const row = {
    ...rows[0],
    user_id: rows[0].user_id ?? userId,
    provider: rows[0].provider ?? provider,
  };
  const tokens = decryptRow(row);
  if (row.access_token || row.refresh_token) {
    await saveOAuthCredential({
      db,
      userId: row.user_id,
      provider: row.provider,
      tokens,
    });
  }
  return tokens;
}

export async function migrateLegacyOAuthCredentials(db = pool) {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS}
       FROM user_tokens
      WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL`
  );
  for (const row of rows) {
    await saveOAuthCredential({
      db,
      userId: row.user_id,
      provider: row.provider,
      tokens: decryptRow(row),
    });
  }
  return rows.length;
}
