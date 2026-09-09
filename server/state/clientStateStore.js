import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_STATE_DIR = path.resolve(path.join(__dirname, '..', '..', '.homebase-state'));

export const CLIENT_STATE_KEYS = new Map([
  ['homebase.workspace.v1', 'workspace.json'],
  ['homebase.presets.v1', 'presets.json'],
  ['homebase.theme.customPresets.v1', 'theme-custom-presets.json'],
  ['homebase.journals.v1', 'journals.json'],
  ['homebase.scheduler.v1', 'schedules.json'],
]);

export const WORKSPACE_STATE_KEY = 'homebase.workspace.v1';

function clientStatePath(key) {
  const file = CLIENT_STATE_KEYS.get(key);
  return file ? path.join(LOCAL_STATE_DIR, file) : null;
}

export function isSupportedClientStateKey(key) {
  return CLIENT_STATE_KEYS.has(key);
}

export async function getUserState({ db, userId, key }) {
  const dbRes = await db.query(
    'SELECT value FROM user_client_state WHERE user_id = $1 AND key = $2',
    [userId, key]
  );

  if (dbRes.rows.length > 0) {
    return { found: true, source: 'database', value: dbRes.rows[0].value };
  }

  const filePath = clientStatePath(key);
  if (!filePath || !fs.existsSync(filePath)) {
    return { found: false, source: 'missing', value: null };
  }

  const raw = await fs.promises.readFile(filePath, 'utf8');
  const value = JSON.parse(raw);
  await setUserState({ db, userId, key, value });
  return { found: true, source: 'local-file', value };
}

export async function setUserState({ db, userId, key, value }) {
  await db.query(
    `INSERT INTO user_client_state (user_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE
     SET value = $3, updated_at = NOW()`,
    [userId, key, JSON.stringify(value)]
  );
}

export async function deleteUserState({ db, userId, key }) {
  await db.query(
    'DELETE FROM user_client_state WHERE user_id = $1 AND key = $2',
    [userId, key]
  );
}

export async function getWorkspaceState({ db, workspaceId, key = WORKSPACE_STATE_KEY }) {
  const result = await db.query(
    'SELECT value, revision, updated_at FROM workspace_client_state WHERE workspace_id = $1 AND key = $2',
    [workspaceId, key]
  );
  return result.rows[0]
    ? {
      found: true,
      source: 'database',
      value: result.rows[0].value,
      revision: Number(result.rows[0].revision),
      updatedAt: result.rows[0].updated_at,
    }
    : { found: false, source: 'missing', value: null, revision: 0, updatedAt: null };
}

function requireRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    const error = new Error('A non-negative expectedRevision is required');
    error.statusCode = 400;
    throw error;
  }
  return revision;
}

export async function setWorkspaceState({
  db, workspaceId, key = WORKSPACE_STATE_KEY, value, expectedRevision,
}) {
  const revision = requireRevision(expectedRevision);
  const result = await db.query(
    `WITH updated AS (
       UPDATE workspace_client_state
       SET value = $3, revision = revision + 1, updated_at = NOW()
       WHERE workspace_id = $1 AND key = $2 AND revision = $4
       RETURNING revision, updated_at
     ), inserted AS (
       INSERT INTO workspace_client_state (workspace_id, key, value, revision)
       SELECT $1, $2, $3, 1 WHERE $4 = 0 AND NOT EXISTS (SELECT 1 FROM updated)
       ON CONFLICT (workspace_id, key) DO NOTHING
       RETURNING revision, updated_at
     )
     SELECT revision, updated_at FROM updated
     UNION ALL
     SELECT revision, updated_at FROM inserted`,
    [workspaceId, key, JSON.stringify(value), revision]
  );
  if (!result.rows[0]) {
    const error = new Error('Workspace changed since it was loaded');
    error.statusCode = 409;
    error.code = 'workspace_revision_conflict';
    throw error;
  }
  return {
    revision: Number(result.rows[0].revision),
    updatedAt: result.rows[0].updated_at,
  };
}

export async function deleteWorkspaceState({
  db, workspaceId, key = WORKSPACE_STATE_KEY, expectedRevision,
}) {
  const revision = requireRevision(expectedRevision);
  const result = await db.query(
    `DELETE FROM workspace_client_state
     WHERE workspace_id = $1 AND key = $2 AND revision = $3
     RETURNING revision`,
    [workspaceId, key, revision]
  );
  if (result.rows[0]) return { removed: true, revision };
  if (revision === 0) return { removed: false, revision: 0 };
  const error = new Error('Workspace changed since it was loaded');
  error.statusCode = 409;
  error.code = 'workspace_revision_conflict';
  throw error;
}
