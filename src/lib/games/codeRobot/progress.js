// The class's progress on a Code Robot window. Each player has one field on
// the shared window record (`coder_<name>`), so two students solving levels
// at the same moment never overwrite each other. Pure.
import { LEVELS } from './levels.js';

export const CODER_PREFIX = 'coder_';
const MAX_CODE = 4000;
const LEVEL_IDS = new Set(LEVELS.map((l) => l.id));

export function coderField(name) {
  const slug = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return CODER_PREFIX + (slug || 'player');
}

function cleanEntry(raw) {
  const stars = Math.max(0, Math.min(3, Math.floor(Number(raw?.stars) || 0)));
  const lines = Math.max(0, Math.floor(Number(raw?.lines) || 0));
  const code = typeof raw?.code === 'string' ? raw.code.slice(0, MAX_CODE) : '';
  return { stars, lines, code, at: Number(raw?.at) || 0 };
}

export function cleanCoder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const solved = {};
  for (const [id, entry] of Object.entries(raw.solved || {})) if (LEVEL_IDS.has(id)) solved[id] = cleanEntry(entry);
  return { name: String(raw.name || 'Player').slice(0, 40), solved };
}

export function readCoders(win) {
  const out = {};
  for (const [field, value] of Object.entries(win || {})) {
    if (!field.startsWith(CODER_PREFIX)) continue;
    const coder = cleanCoder(value);
    if (coder) out[field] = coder;
  }
  return out;
}

/**
 * Record a run on my seat. Only solved runs count, and a level keeps its
 * best result: more stars wins, then fewer lines. Returns the seat unchanged
 * when the run is no better.
 */
export function mergeSolve(seat, name, levelId, { stars, lines, code, at }) {
  const base = seat || { name: String(name || 'Player').slice(0, 40), solved: {} };
  if (!stars || !LEVEL_IDS.has(levelId)) return base;
  const prev = base.solved[levelId];
  const better = !prev || stars > prev.stars || (stars === prev.stars && lines < prev.lines);
  if (!better) return base;
  return { ...base, name: String(name || base.name).slice(0, 40), solved: { ...base.solved, [levelId]: cleanEntry({ stars, lines, code, at }) } };
}

/** One row per player: stars per level in ladder order, most solved first. */
export function classProgress(coders) {
  return Object.entries(coders).map(([field, c]) => ({
    field,
    name: c.name,
    levels: LEVELS.map((l) => c.solved[l.id]?.stars || 0),
    solved: LEVELS.filter((l) => c.solved[l.id]).length,
    stars: LEVELS.reduce((n, l) => n + (c.solved[l.id]?.stars || 0), 0),
  })).sort((a, b) => b.solved - a.solved || b.stars - a.stars || a.name.localeCompare(b.name));
}
