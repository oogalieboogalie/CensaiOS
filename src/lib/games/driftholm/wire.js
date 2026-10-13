// Driftholm on the board. Every player's browser runs its own player on the
// island and, once a tick (600 ms), tells everyone else where they stand and
// what they are doing. The trees they fell ride along so every screen shows
// the same stumps. Nothing here lasts: each player's skills, pack and bank
// ride the shared window record instead (see save.js).
//
//   game.island  player -> everyone else
//     { windowId, name, tile:[x,y], from:[x,y], busy, face:[x,y], total, felled:[[tree, untilTick]], tick,
//       fight:{cow, at:[x,y], hp, since}, slain:[[cow, untilTick]], hits:[{on: cow|null, dmg}], hp:[now, most] }
//     { windowId, gone: true }   when a player closes the window

export const ISLAND_MESSAGE = 'game.island';
export const TICK_MS = 600;
const MAP_SPAN = 64;
const MAX_FELLED = 16;
const BUSY = new Set(['', 'chop', 'fish', 'fight', 'cook']);
const MAX_SLAIN = 8;
const MAX_HITS = 4;
const COWS = 64;

const int = (v, lo, hi) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

function tile(v) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const x = int(v[0], -MAP_SPAN, MAP_SPAN);
  const y = int(v[1], -MAP_SPAN, MAP_SPAN);
  return x === null || y === null ? null : [x, y];
}

/** `[[index, untilTick], ...]`, trimmed to `max` pairs with indexes up to `top`. */
function pairs(v, max, top) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max)
    .map((f) => (Array.isArray(f) ? [int(f[0], 0, top), int(f[1], 0, Number.MAX_SAFE_INTEGER)] : [null, null]))
    .filter(([i, until]) => i !== null && until !== null);
}

/** One blow: on a cow (its index) or on the player (null), and how hard. */
function blow(h) {
  if (!h || typeof h !== 'object') return null;
  const on = h.on === null ? null : int(h.on, 0, COWS);
  const dmg = int(h.dmg, 0, 99);
  if (dmg === null || (on === null && h.on !== null)) return null;
  return { on, dmg };
}

/** Validate an island message; returns the clean fields or null. Used by the server relay too. */
export function normalizePresence(message) {
  if (message?.type !== ISLAND_MESSAGE) return null;
  const windowId = typeof message.windowId === 'string' ? message.windowId.slice(0, 80) : '';
  if (!windowId) return null;
  if (message.gone === true) return { windowId, gone: true };
  const at = tile(message.tile);
  if (!at) return null;
  const out = { windowId, name: typeof message.name === 'string' ? message.name.slice(0, 40) : 'Player', tile: at };
  const from = tile(message.from);
  if (from) out.from = from;
  out.busy = BUSY.has(message.busy) ? message.busy : '';
  const face = tile(message.face);
  if (face) out.face = face;
  out.total = int(message.total, 0, 10000) ?? 0;
  out.tick = int(message.tick, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const fight = message.fight;
  if (fight && typeof fight === 'object') {
    const cow = int(fight.cow, 0, COWS);
    const held = tile(fight.at);
    const hp = int(fight.hp, 0, 99);
    const since = int(fight.since, 0, Number.MAX_SAFE_INTEGER);
    if (cow !== null && held && hp !== null && since !== null) out.fight = { cow, at: held, hp, since };
  }
  out.slain = pairs(message.slain, MAX_SLAIN, COWS);
  out.hits = Array.isArray(message.hits)
    ? message.hits.slice(0, MAX_HITS).map(blow).filter(Boolean)
    : [];
  if (Array.isArray(message.hp) && message.hp.length === 2) {
    const now = int(message.hp[0], 0, 99);
    const most = int(message.hp[1], 1, 99);
    if (now !== null && most !== null) out.hp = [Math.min(now, most), most];
  }
  out.felled = pairs(message.felled, MAX_FELLED, 4096);
  return out;
}

/** What the game itself expects for another player (the Rust `Presence`). */
export function toPeer(clean) {
  const { windowId: _w, gone: _g, ...rest } = clean;
  return { ...rest, face: rest.face ?? null, from: rest.from ?? null, fight: rest.fight ?? null, hp: rest.hp ?? null };
}
