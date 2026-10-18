// A board's skill set library: built-ins plus the board's own sets (and its
// edits of built-ins), the what-worked log, and which agent carries which set.

import { BUILTIN_SKILL_SETS, BUILTIN_SKILL_SET_BY_ID } from './builtins.js';
import { normalizeSkillSet, skillSetError } from './normalize.js';

const MAX_LOG_NOTE = 600;
const MAX_EQUIPPED = 4;

function fromRow(row) {
  const builtin = Boolean(BUILTIN_SKILL_SET_BY_ID[row.id]);
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    summary: row.summary,
    skills: Array.isArray(row.skills) ? row.skills : [],
    benchmark: row.benchmark,
    origin: builtin ? 'builtin' : row.origin,
    sources: Array.isArray(row.sources) ? row.sources : [],
    builtin,
    edited: builtin,
    mindsets: BUILTIN_SKILL_SET_BY_ID[row.id]?.mindsets || [],
    updatedAt: row.updated_at,
  };
}

function fromBuiltin(set) {
  return { ...set, skills: [...set.skills], sources: [...(set.sources || [])], mindsets: set.mindsets || [], builtin: true, edited: false };
}

// The list leaves out each set's research mindsets (hundreds of them); the
// window asks for one set's mindsets when it opens that set.
function brief({ mindsets = [], ...set }) {
  return { ...set, mindsetCount: mindsets.length };
}

export async function listSkillSets(db, workspaceId) {
  const { rows } = await db.query(
    'SELECT * FROM workspace_skill_sets WHERE workspace_id=$1 ORDER BY updated_at DESC', [workspaceId]);
  const own = rows.map(fromRow);
  const ownIds = new Set(own.map((set) => set.id));
  const builtins = BUILTIN_SKILL_SETS.filter((set) => !ownIds.has(set.id)).map(fromBuiltin);
  const edited = own.filter((set) => set.builtin);
  const mine = own.filter((set) => !set.builtin);
  const order = new Map(BUILTIN_SKILL_SETS.map((set, index) => [set.id, index]));
  const library = [...edited, ...builtins].sort((a, b) => order.get(a.id) - order.get(b.id));
  return [...mine, ...library].map(brief);
}

export async function getSkillSet(db, workspaceId, id) {
  const { rows } = await db.query(
    'SELECT * FROM workspace_skill_sets WHERE workspace_id=$1 AND id=$2', [workspaceId, id]);
  if (rows[0]) return fromRow(rows[0]);
  return BUILTIN_SKILL_SET_BY_ID[id] ? fromBuiltin(BUILTIN_SKILL_SET_BY_ID[id]) : null;
}

/** A new set gets a free id (software-engineer, software-engineer-2, ...). */
export async function freeSkillSetId(db, workspaceId, base) {
  const { rows } = await db.query(
    'SELECT id FROM workspace_skill_sets WHERE workspace_id=$1 AND id LIKE $2', [workspaceId, `${base}%`]);
  const taken = new Set([...rows.map((row) => row.id), ...BUILTIN_SKILL_SETS.map((set) => set.id)]);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!taken.has(`${base}-${n}`.slice(0, 80))) return `${base}-${n}`.slice(0, 80);
  throw skillSetError('Too many skill sets with this name.', 409);
}

export async function saveSkillSet(db, workspaceId, userId, input, { origin, isNew = false } = {}) {
  const set = normalizeSkillSet(input, { origin });
  if (isNew) set.id = await freeSkillSetId(db, workspaceId, set.id);
  const { rows } = await db.query(
    `INSERT INTO workspace_skill_sets
       (workspace_id, id, name, position, summary, skills, benchmark, origin, sources, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10)
     ON CONFLICT (workspace_id, id) DO UPDATE SET name=EXCLUDED.name, position=EXCLUDED.position,
       summary=EXCLUDED.summary, skills=EXCLUDED.skills, benchmark=EXCLUDED.benchmark,
       sources=EXCLUDED.sources, updated_at=NOW()
     RETURNING *`,
    [workspaceId, set.id, set.name, set.position, set.summary, JSON.stringify(set.skills), set.benchmark,
      set.origin, JSON.stringify(set.sources), userId || null]);
  return fromRow(rows[0]);
}

/** Removes a board's own set, or puts an edited built-in back the way it shipped. */
export async function deleteSkillSet(db, workspaceId, id) {
  await db.query('DELETE FROM workspace_skill_sets WHERE workspace_id=$1 AND id=$2', [workspaceId, id]);
  if (!BUILTIN_SKILL_SET_BY_ID[id]) {
    await db.query('DELETE FROM workspace_agent_skill_sets WHERE workspace_id=$1 AND skill_set_id=$2', [workspaceId, id]);
  }
}

export async function listSkillSetLog(db, workspaceId, skillSetId, limit = 50) {
  const { rows } = await db.query(
    `SELECT id, outcome, note, author_kind, author_id, created_at FROM workspace_skill_set_log
     WHERE workspace_id=$1 AND skill_set_id=$2 ORDER BY created_at DESC, id DESC LIMIT $3`,
    [workspaceId, skillSetId, limit]);
  return rows.map((row) => ({
    id: Number(row.id), outcome: row.outcome, note: row.note,
    authorKind: row.author_kind, authorId: row.author_id, createdAt: row.created_at,
  }));
}

export async function addSkillSetLog(db, workspaceId, { skillSetId, outcome, note, authorKind, authorId }) {
  if (!(await getSkillSet(db, workspaceId, skillSetId))) throw skillSetError('That skill set is not in this board\'s library.', 404);
  if (!['worked', 'didnt'].includes(outcome)) throw skillSetError('Say whether it worked or didn\'t.');
  const clean = String(note || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LOG_NOTE);
  if (!clean) throw skillSetError('Write what happened in a sentence.');
  const { rows } = await db.query(
    `INSERT INTO workspace_skill_set_log (workspace_id, skill_set_id, outcome, note, author_kind, author_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
    [workspaceId, skillSetId, outcome, clean, authorKind, String(authorId)]);
  return { id: Number(rows[0].id), outcome, note: clean, authorKind, authorId: String(authorId), createdAt: rows[0].created_at };
}

export async function getEquippedSkillSetIds(db, workspaceId, agentId) {
  const { rows } = await db.query(
    'SELECT skill_set_id FROM workspace_agent_skill_sets WHERE workspace_id=$1 AND agent_id=$2 ORDER BY equipped_at',
    [workspaceId, agentId]);
  return rows.map((row) => row.skill_set_id);
}

export async function setEquippedSkillSetIds(db, workspaceId, agentId, ids) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
  if (wanted.length > MAX_EQUIPPED) throw skillSetError(`An agent can carry up to ${MAX_EQUIPPED} skill sets at once.`);
  for (const id of wanted) {
    if (!(await getSkillSet(db, workspaceId, id))) throw skillSetError('That skill set is not in this board\'s library.', 404);
  }
  await db.query('DELETE FROM workspace_agent_skill_sets WHERE workspace_id=$1 AND agent_id=$2', [workspaceId, agentId]);
  for (const id of wanted) {
    await db.query(
      'INSERT INTO workspace_agent_skill_sets (workspace_id, agent_id, skill_set_id) VALUES ($1,$2,$3)',
      [workspaceId, agentId, id]);
  }
  return wanted;
}

/** The sets an agent carries, each with its latest log lines, for the prompt. */
export async function loadEquippedSkillSets(db, workspaceId, agentId) {
  if (!workspaceId || !agentId) return [];
  const ids = await getEquippedSkillSetIds(db, workspaceId, agentId);
  const sets = [];
  for (const id of ids) {
    const set = await getSkillSet(db, workspaceId, id);
    if (set) sets.push({ ...set, log: await listSkillSetLog(db, workspaceId, id, 3) });
  }
  return sets;
}
