// Who has played a Rhythm Run window and how well. Each player owns one
// field on the shared window record (`player_<name>`) holding their best
// scores and, during a run, a live score everyone else can watch. The
// "play together" countdown is the window's `match` field. Pure.
import { DIFFICULTIES } from './sequence.js';
import { songById } from './songs.js';

export const PLAYER_PREFIX = 'player_';
const DIFF_IDS = new Set(DIFFICULTIES.map((d) => d.id));
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
// Words from the shared board, to show on screen. Anyone on the board can
// write the record, so only real text counts: a list or an object in its place
// would otherwise show as "[object Object]".
const words = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The longest a "play together" countdown may run. A match further off than this is not offered. */
export const MATCH_MAX_WAIT_MS = 5 * 60 * 1000;

export function playerField(name) {
  const slug = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return PLAYER_PREFIX + (slug || 'player');
}

export const bestKey = (songId, difficulty) => `${String(songId).slice(0, 60)}:${difficulty}`;

function cleanResult(raw) {
  return { score: Math.floor(num(raw?.score, 0, 1e9)), accuracy: num(raw?.accuracy, 0, 100), grade: /^[SABCD]$/.test(raw?.grade) ? raw.grade : 'D', maxCombo: Math.floor(num(raw?.maxCombo, 0, 1e6)), at: num(raw?.at, 0, 1e15) };
}

export function cleanPlayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const best = {};
  for (const [key, value] of Object.entries(raw.best || {})) {
    const diff = key.split(':').pop();
    if (DIFF_IDS.has(diff)) best[key] = cleanResult(value);
  }
  const live = raw.live && typeof raw.live === 'object'
    ? { song: words(raw.live.song, 80), score: Math.floor(num(raw.live.score, 0, 1e9)), combo: Math.floor(num(raw.live.combo, 0, 1e6)), at: num(raw.live.at, 0, 1e15) }
    : null;
  return { name: words(raw.name, 40) || 'Player', best, live };
}

export function readPlayers(win) {
  const out = {};
  for (const [field, value] of Object.entries(win || {})) {
    if (!field.startsWith(PLAYER_PREFIX)) continue;
    const p = cleanPlayer(value);
    if (p) out[field] = p;
  }
  return out;
}

/** Keep the better of two results for a song and difficulty. */
export function recordBest(player, name, key, result) {
  const base = player || { name: String(name || 'Player').slice(0, 40), best: {}, live: null };
  const prev = base.best[key];
  if (prev && prev.score >= result.score) return { ...base, live: null };
  return { ...base, name: String(name || base.name).slice(0, 40), best: { ...base.best, [key]: cleanResult(result) }, live: null };
}

/** Top scores on one song and difficulty, best first. */
export function leaderboard(players, key, limit = 8) {
  return Object.entries(players)
    .filter(([, p]) => p.best[key])
    .map(([field, p]) => ({ field, name: p.name, ...p.best[key] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Players who are mid-song right now (live score updated in the last few seconds). */
export function livePlayers(players, nowMs, staleMs = 4000) {
  return Object.entries(players)
    .filter(([, p]) => p.live && nowMs - p.live.at < staleMs)
    .map(([field, p]) => ({ field, name: p.name, ...p.live }))
    .sort((a, b) => b.score - a.score);
}

/**
 * A "play together" match: one song, one difficulty, one start time for everyone.
 * The song has to be one every player has (a built-in one), so nobody is
 * offered Join for a song their window cannot play.
 */
export function cleanMatch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const startAt = Number(raw.startAt);
  if (!Number.isFinite(startAt) || !DIFF_IDS.has(raw.difficulty) || typeof raw.song !== 'string' || !songById(raw.song)) return null;
  return { song: raw.song, difficulty: raw.difficulty, startAt, by: words(raw.by, 40) };
}

/** Is this match still ahead, and close enough to be a real countdown? */
export function matchIsPending(match, nowMs) {
  return Boolean(match) && match.startAt > nowMs && match.startAt - nowMs <= MATCH_MAX_WAIT_MS;
}
