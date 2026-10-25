// WeeWoo avatars: the pixel characters that stand in for agents on the
// office floor. Each body is a 14x14 grid of cells (from the WeeWoo
// design handoff). An avatar is { body, color, eyes, accessory }: an agent
// can pick its own with the choose_avatar tool, a person can build one in
// the avatar builder, and every agent without one gets a default from its
// role. Pure data and functions, shared by the browser and the server.
//
// Extra cells drawn over a body: 'y' gold, 'g' leaf green.

import { BODIES } from './avatarBodies.js';

export { BODIES };

export const BODY_LABELS = Object.freeze({
  slime: 'Slime', loaf: 'Loaf', bird: 'Bird', cube: 'Cube', crab: 'Crab', owl: 'Owl', rocket: 'Rocket',
  fox: 'Fox', book: 'Book', compass: 'Compass', droplet: 'Droplet', heart: 'Heart', star: 'Star', egg: 'Egg',
});

// Avatar colors, from the WeeWoo prototype's roster.
export const AVATAR_COLORS = Object.freeze([
  '#7fb3d5', '#e8b56b', '#d28aa8', '#86c39a', '#b59ad8', '#e48f6e',
  '#7ec7c0', '#c8a76b', '#9aa6b2', '#e6c34f', '#a3c46b', '#d97a7a',
]);

// Plain names for the palette, so an agent can say "teal".
export const COLOR_NAMES = Object.freeze({
  blue: '#7fb3d5', orange: '#e8b56b', pink: '#d28aa8', green: '#86c39a', purple: '#b59ad8', coral: '#e48f6e',
  teal: '#7ec7c0', tan: '#c8a76b', gray: '#9aa6b2', yellow: '#e6c34f', lime: '#a3c46b', red: '#d97a7a',
});

// Fixed cell colors. They stay the same in light and dark looks so an
// avatar is recognisable on any board.
export const CELL_COLORS = Object.freeze({
  e: '#1a1916', k: '#1a1916', s: '#ffffff', w: '#ffffff', r: '#d83a2a', y: '#e6b422', g: '#5c9e4f',
});

export const EYES = Object.freeze({
  dots: 'Dots',
  sparkle: 'Sparkle',
  shades: 'Shades',
});

// Accessories are drawn over the body: [x, y, cell] triples.
export const ACCESSORIES = Object.freeze({
  none: { label: 'None', cells: [] },
  party: { label: 'Party hat', cells: [[6, 0, 'r'], [7, 0, 'r'], [5, 1, 'r'], [6, 1, 'w'], [7, 1, 'r'], [8, 1, 'w']] },
  crown: { label: 'Crown', cells: [[4, 0, 'y'], [6, 0, 'y'], [7, 0, 'y'], [9, 0, 'y'], [4, 1, 'y'], [5, 1, 'y'], [6, 1, 'y'], [7, 1, 'y'], [8, 1, 'y'], [9, 1, 'y']] },
  sprout: { label: 'Sprout', cells: [[6, 0, 'g'], [8, 0, 'g'], [7, 1, 'g'], [7, 2, 'g']] },
  headset: { label: 'Headset', cells: [[4, 1, 'k'], [5, 1, 'k'], [6, 1, 'k'], [7, 1, 'k'], [8, 1, 'k'], [9, 1, 'k'], [3, 2, 'k'], [10, 2, 'k'], [0, 6, 'k'], [0, 7, 'k'], [13, 6, 'k'], [13, 7, 'k'], [1, 8, 'k'], [2, 9, 'k']] },
  bow: { label: 'Bow', cells: [[9, 1, 'r'], [10, 1, 'r'], [12, 1, 'r'], [13, 1, 'r'], [11, 2, 'r'], [9, 3, 'r'], [10, 3, 'r'], [12, 3, 'r'], [13, 3, 'r']] },
});

const HEX = /^#[0-9a-f]{6}$/i;

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Shade a #rrggbb color toward black (amt < 0) or white (amt > 0). */
export function shade(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return hex;
  const target = amt < 0 ? 0 : 255;
  return `#${m.slice(1).map((part) => {
    const v = parseInt(part, 16);
    return Math.round(v + (target - v) * Math.abs(amt)).toString(16).padStart(2, '0');
  }).join('')}`;
}

// Bodies that suit each kind of work, used for an agent's default avatar.
const BODIES_BY_DEPT = {
  ops: ['slime', 'bird', 'compass'],
  engineering: ['cube', 'crab', 'bird', 'rocket'],
  research: ['owl', 'book', 'compass'],
  growth: ['fox', 'rocket', 'star'],
  people: ['heart', 'egg', 'droplet'],
  lobby: ['egg', 'slime', 'droplet', 'loaf'],
};

/** A sensible avatar for an agent that has not picked one: from its role and id. */
export function defaultAvatar(seed, dept = 'lobby') {
  const h = hash(seed);
  const bodies = BODIES_BY_DEPT[dept] || BODIES_BY_DEPT.lobby;
  return { body: bodies[h % bodies.length], color: AVATAR_COLORS[(h >>> 8) % AVATAR_COLORS.length], eyes: 'dots', accessory: 'none' };
}

/**
 * Clean an avatar from any source (a person, an agent's tool call, an old
 * board). Unknown parts fall back to `base`; returns null when nothing valid.
 */
export function normalizeAvatar(input, base = null) {
  if (!input || typeof input !== 'object') return base ? { ...base } : null;
  const body = String(input.body || input.species || '').toLowerCase();
  const named = COLOR_NAMES[String(input.color || '').trim().toLowerCase()];
  const color = named || String(input.color || '').trim();
  const eyes = String(input.eyes || '').toLowerCase();
  const accessory = String(input.accessory || '').toLowerCase();
  const out = {
    body: BODIES[body] ? body : base?.body,
    color: HEX.test(color) ? color.toLowerCase() : base?.color,
    eyes: EYES[eyes] ? eyes : (base?.eyes || 'dots'),
    accessory: ACCESSORIES[accessory] ? accessory : (base?.accessory || 'none'),
  };
  if (!out.body || !out.color) return null;
  if (input.by === 'agent' || input.by === 'person') out.by = input.by;
  if (typeof input.name === 'string' && input.name.trim()) out.name = input.name.trim().slice(0, 40);
  return out;
}

/** The 14x14 cell grid for an avatar: body, then eyes, then accessory. */
export function avatarCells(avatar) {
  const rows = (BODIES[avatar?.body] || BODIES.slime).map((row) => row.split(''));
  if (avatar?.eyes === 'sparkle' || avatar?.eyes === 'shades') {
    const eyes = [];
    rows.forEach((row, y) => row.forEach((cell, x) => { if (cell === 'e') eyes.push([x, y]); }));
    if (avatar.eyes === 'sparkle') {
      for (const [x, y] of eyes) if (y > 0) rows[y - 1][x] = 'w';
    } else if (eyes.length) {
      const y = eyes[0][1];
      const xs = eyes.filter((eye) => eye[1] === y).map((eye) => eye[0]);
      for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x += 1) if (rows[y][x] !== undefined && rows[y][x] !== '.') rows[y][x] = 'k';
    }
  }
  for (const [x, y, cell] of ACCESSORIES[avatar?.accessory]?.cells || []) rows[y][x] = cell;
  return rows;
}

/** Fill color for one cell of an avatar. */
export function cellFill(cell, avatar) {
  if (cell === 'c') return avatar.color;
  if (cell === 'd') return shade(avatar.color, -0.18);
  return CELL_COLORS[cell] || avatar.color;
}
