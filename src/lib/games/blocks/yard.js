// Blockyard's building rules: the plot of land, the stacks on it, placing
// and taking blocks, and the milestones that open up the yard. Pure.
//
// Each player's blocks live in their own seat (`cells: { "x,y": [ids] }`),
// so two people stacking on the same square at once both keep their block.
// A square's stack is everyone's blocks there, oldest player first, which
// every browser computes the same way.

import { BLOCKS, BLOCK_BY_ID, unlockedBlocks } from './economy.js';

export const MAX_HEIGHT = 12;

/** The plot grows as the yard digs more over its life. */
export const LAND = [
  { size: 6, at: 0 },
  { size: 8, at: 300 },
  { size: 10, at: 3000 },
  { size: 12, at: 30000 },
];

/** Dig this much and the flat grid opens up into the isometric view. */
export const ISO_AT = 120;

export const cellKey = (x, y) => `${x},${y}`;

export function landSize(earned) {
  return LAND.reduce((size, step) => (earned >= step.at ? step.size : size), LAND[0].size);
}

export function isoUnlocked(earned) {
  return earned >= ISO_AT;
}

function seatOrder(seats) {
  return Object.entries(seats).sort(([fa, a], [fb, b]) => (a.joinedAt - b.joinedAt) || (fa < fb ? -1 : fa > fb ? 1 : 0));
}

/**
 * Every square's stack inside the plot: { "x,y": [{ id, field }] }, bottom
 * first. Blocks outside the plot or above MAX_HEIGHT are left out.
 */
export function stacksOf(seats, size) {
  const stacks = {};
  for (const [field, seat] of seatOrder(seats)) {
    for (const [key, list] of Object.entries(seat.cells || {})) {
      const [x, y] = key.split(',').map(Number);
      if (x >= size || y >= size) continue;
      const stack = stacks[key] || (stacks[key] = []);
      for (const id of list) if (stack.length < MAX_HEIGHT) stack.push({ id, field });
    }
  }
  return stacks;
}

export function placedCount(stacks) {
  return Object.values(stacks).reduce((n, s) => n + s.length, 0);
}

export function tallest(stacks) {
  return Object.values(stacks).reduce((h, s) => Math.max(h, s.length), 0);
}

/** Put a block on a square. Returns the new seat, or null when it can't. */
export function placeBlock(seat, eco, stacks, size, x, y, id) {
  const block = BLOCK_BY_ID.get(id);
  if (!block || x < 0 || y < 0 || x >= size || y >= size) return null;
  if (!unlockedBlocks(eco).some((b) => b.id === id)) return null;
  const key = cellKey(x, y);
  if ((stacks[key]?.length || 0) >= MAX_HEIGHT) return null;
  if (!(eco.wallet >= block.cost)) return null;
  const mine = seat.cells[key] || [];
  return { ...seat, spent: seat.spent + block.cost, cells: { ...seat.cells, [key]: [...mine, id] } };
}

/**
 * Take my most recent block off a square and get its blocks back. Other
 * players' blocks are theirs to take, so a square I never built on is a no-op.
 */
export function takeBlock(seat, x, y) {
  const key = cellKey(x, y);
  const mine = seat.cells[key];
  if (!mine?.length) return null;
  const id = mine[mine.length - 1];
  const cells = { ...seat.cells };
  if (mine.length > 1) cells[key] = mine.slice(0, -1);
  else delete cells[key];
  const refund = BLOCK_BY_ID.get(id)?.cost || 0;
  return { ...seat, spent: Math.max(0, seat.spent - refund), cells };
}

/** The next thing the yard is working toward, for the progress bar. */
export function nextMilestone(earned) {
  const goals = [
    { at: ISO_AT, label: 'opens the 3D view' },
    ...LAND.slice(1).map((s) => ({ at: s.at, label: `grows the plot to ${s.size} by ${s.size}` })),
    ...BLOCKS.slice(1).map((b) => ({ at: b.unlock, label: `unlocks ${b.name.toLowerCase()}` })),
  ];
  const ahead = goals.filter((g) => g.at > earned).sort((a, b) => a.at - b.at);
  if (!ahead.length) return null;
  const prev = [0, ...goals.map((g) => g.at)].filter((at) => at <= earned).reduce((a, b) => Math.max(a, b), 0);
  const goal = ahead[0];
  return { ...goal, progress: Math.min(1, (earned - prev) / Math.max(1, goal.at - prev)) };
}

/** Who built what, biggest builder first. */
export function builders(seats) {
  return Object.entries(seats).map(([field, s]) => ({
    field,
    name: s.name,
    digs: s.digs,
    placed: Object.values(s.cells).reduce((n, list) => n + list.length, 0),
    makers: Object.values(s.makers).reduce((n, m) => n + m.n, 0),
  })).sort((a, b) => (b.placed + b.digs) - (a.placed + a.digs));
}
