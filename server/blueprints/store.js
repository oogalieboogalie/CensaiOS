// A board's blueprint shelf (docker/062-blueprints.sql): save, list, look up,
// and the board's own "Do we have ..." phrase list.
import { blueprintCode, makeBlueprintId, parseBlueprintId, shelfName, shelfNumber } from '../../src/lib/blueprints/blueprintIds.js';
import { blueprintSearchWords, DEFAULT_BLUEPRINT_PHRASES, matchBlueprintPhrase, normalizePhrases } from '../../src/lib/blueprints/blueprintPhrases.js';
import { rankBlueprints } from '../../src/lib/blueprints/blueprintSearch.js';

export const BLUEPRINT_LIMITS = Object.freeze({ title: 140, type: 60, purpose: 140, body: 6000, shelf: 500 });

const line = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function blueprintError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode, code: 'BLUEPRINT_INVALID' });
}

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    shelf: Number(row.category),
    shelfName: shelfName(row.category),
    type: row.type,
    purpose: row.purpose,
    body: row.body,
    authorKind: row.author_kind,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeBlueprint(input = {}) {
  const title = line(input.title, BLUEPRINT_LIMITS.title);
  if (!title) throw blueprintError('Give the blueprint a name, like "Alex Finance Blueprint for Budgeting".');
  return {
    title,
    shelf: shelfNumber(input.shelf ?? input.category),
    type: line(input.type, BLUEPRINT_LIMITS.type),
    purpose: line(input.purpose, BLUEPRINT_LIMITS.purpose),
    body: String(input.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, BLUEPRINT_LIMITS.body),
  };
}

export async function listBlueprints(db, workspaceId, { shelf } = {}) {
  const params = [workspaceId];
  let where = 'workspace_id=$1';
  if (shelf) { params.push(shelfNumber(shelf)); where += ' AND category=$2'; }
  const { rows } = await db.query(
    `SELECT * FROM workspace_blueprints WHERE ${where} ORDER BY updated_at DESC LIMIT ${BLUEPRINT_LIMITS.shelf}`, params);
  return rows.map(fromRow);
}

export async function getBlueprint(db, workspaceId, id) {
  const { rows } = await db.query('SELECT * FROM workspace_blueprints WHERE workspace_id=$1 AND id=$2', [workspaceId, String(id || '').trim()]);
  return rows[0] ? fromRow(rows[0]) : null;
}

/** The next number on a shelf: one past the highest ID already there. */
async function nextNumber(db, workspaceId, shelf) {
  const { rows } = await db.query('SELECT id FROM workspace_blueprints WHERE workspace_id=$1 AND category=$2', [workspaceId, shelf]);
  return rows.reduce((max, row) => Math.max(max, parseBlueprintId(row.id)?.number || 0), 0) + 1;
}

/**
 * New blueprint (no id): gets its ID here. Existing one: name, type, purpose
 * and steps change; the shelf is part of the ID, so it stays.
 */
export async function saveBlueprint(db, workspaceId, input = {}, author = {}) {
  const blueprint = normalizeBlueprint(input);
  if (input.id) {
    const existing = await getBlueprint(db, workspaceId, input.id);
    if (!existing) throw blueprintError('That blueprint is not on this board\'s shelf.', 404);
    const { rows } = await db.query(
      `UPDATE workspace_blueprints SET title=$3, type=$4, purpose=$5, body=$6, updated_at=NOW()
       WHERE workspace_id=$1 AND id=$2 RETURNING *`,
      [workspaceId, existing.id, blueprint.title, blueprint.type, blueprint.purpose, blueprint.body]);
    return fromRow(rows[0]);
  }
  // One save per shelf at a time, so two saves never both become "the 5th".
  const client = typeof db.connect === 'function' ? await db.connect() : null;
  const q = client || db;
  try {
    if (client) {
      await q.query('BEGIN');
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`blueprints:${workspaceId}:${blueprint.shelf}`]);
    }
    const saved = await insertBlueprint(q, workspaceId, blueprint, author);
    if (client) await q.query('COMMIT');
    return saved;
  } catch (error) {
    if (client) await q.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

async function insertBlueprint(db, workspaceId, blueprint, author) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = makeBlueprintId({ shelf: blueprint.shelf, number: await nextNumber(db, workspaceId, blueprint.shelf), year, code: blueprintCode() });
    const { rows } = await db.query(
      `INSERT INTO workspace_blueprints (workspace_id, id, title, category, type, purpose, body, author_kind, author_id, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING *`,
      [workspaceId, id, blueprint.title, blueprint.shelf, blueprint.type, blueprint.purpose, blueprint.body,
        author.kind === 'agent' ? 'agent' : 'person', line(author.id, 64), author.userId || null]);
    if (rows[0]) return fromRow(rows[0]);
  }
  throw blueprintError('Could not give the blueprint an ID. Try again.', 409);
}

export async function deleteBlueprint(db, workspaceId, id) {
  const { rowCount } = await db.query('DELETE FROM workspace_blueprints WHERE workspace_id=$1 AND id=$2', [workspaceId, String(id || '').trim()]);
  return rowCount > 0;
}

export async function getBlueprintPhrases(db, workspaceId) {
  const { rows } = await db.query('SELECT phrases FROM workspace_blueprint_phrases WHERE workspace_id=$1', [workspaceId]);
  const own = normalizePhrases(rows[0]?.phrases);
  return own.length ? own : [...DEFAULT_BLUEPRINT_PHRASES];
}

export async function saveBlueprintPhrases(db, workspaceId, phrases) {
  const list = normalizePhrases(phrases);
  if (!list.length) throw blueprintError('Keep at least one phrase, or press Reset to get the ones from your drawing back.');
  await db.query(
    `INSERT INTO workspace_blueprint_phrases (workspace_id, phrases, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET phrases=EXCLUDED.phrases, updated_at=NOW()`,
    [workspaceId, JSON.stringify(list)]);
  return list;
}

/** Search the shelf with plain words (or a whole "Do we have ..." question). */
export async function searchBlueprints(db, workspaceId, query, { limit = 8, phrases } = {}) {
  const list = phrases || await getBlueprintPhrases(db, workspaceId);
  const caught = matchBlueprintPhrase(query, list);
  const words = blueprintSearchWords(caught ? caught.rest : query);
  const all = await listBlueprints(db, workspaceId);
  return { phrase: caught?.phrase || null, words, matches: rankBlueprints(all, words, limit) };
}

/** For chat: only when the message uses one of the board's phrases. */
export async function lookupBlueprintsForMessage(db, workspaceId, message) {
  if (!workspaceId || !String(message || '').trim()) return null;
  const phrases = await getBlueprintPhrases(db, workspaceId);
  const caught = matchBlueprintPhrase(message, phrases);
  if (!caught) return null;
  // "Do you know?" alone is not a blueprint question; "Do we have any blueprints?" is.
  if (!blueprintSearchWords(caught.rest).length && !/blueprint/i.test(message)) return null;
  return searchBlueprints(db, workspaceId, message, { limit: 5, phrases });
}
