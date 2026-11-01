// Blockyard, an idle building game the whole board plays together. Pure
// rules: no React, no clock reads (callers pass `now` in seconds).
//
// Every player owns one yard seat, stored as its own field on the shared
// window record (`yard_<key>`). Yjs merges per field, so two people digging
// and building at once never overwrite each other. The block wallet is
// shared and derived from every seat:
//
//   wallet = blocks dug by hand + what every maker has dug since it arrived - spent
//
// A maker's output is rate * (now - boughtAt). Each seat keeps, per maker
// kind, the count and the sum of purchase times, so output keeps growing
// while nobody has the board open (same trick as Agent Company).

import { seatKey } from '../idle/economy.js';

export const SEAT_PREFIX = 'yard_';
export const COST_GROWTH = 1.15;

export const MAKERS = [
  { id: 'shovel', name: 'Shovel', rate: 0.2, base: 12, blurb: 'Digs a block every five seconds' },
  { id: 'barrow', name: 'Wheelbarrow', rate: 1, base: 90, blurb: 'Hauls a block a second' },
  { id: 'quarry', name: 'Quarry', rate: 6, base: 700, blurb: 'Cuts stone all day' },
  { id: 'drill', name: 'Drill rig', rate: 35, base: 6000, blurb: 'Bores deep, never tires' },
  { id: 'crane', name: 'Sky crane', rate: 200, base: 70000, blurb: 'Lifts whole pallets at once' },
  { id: 'forge', name: 'Block forge', rate: 1200, base: 9e5, blurb: 'Presses blocks out of thin air' },
];

// Dig upgrades: `double` doubles a dig, `share` adds a slice of the yard's
// per-second output to every dig. Each unlocks once the yard owns a maker.
export const UPGRADES = [
  { id: 'gloves', name: 'Work gloves', cost: 40, double: true, unlock: null, blurb: 'Each dig counts double' },
  { id: 'pick', name: 'Steel pick', cost: 300, double: true, unlock: { maker: 'barrow', n: 1 }, blurb: 'Each dig counts double' },
  { id: 'lamp', name: 'Head lamp', cost: 2500, share: 0.05, unlock: { maker: 'quarry', n: 1 }, blurb: 'Each dig also earns 5% of output per second' },
  { id: 'boots', name: 'Steel-toe boots', cost: 30000, double: true, unlock: { maker: 'drill', n: 1 }, blurb: 'Each dig counts double' },
  { id: 'blueprint', name: 'Blueprints', cost: 4e5, share: 0.1, unlock: { maker: 'crane', n: 1 }, blurb: 'Each dig also earns 10% of output per second' },
];

// Block kinds you can build with. Each unlocks once the yard has dug enough
// over its whole life, so the palette grows as you play.
export const BLOCKS = [
  { id: 'soil', name: 'Soil', cost: 1, unlock: 0 },
  { id: 'stone', name: 'Stone', cost: 3, unlock: 60 },
  { id: 'timber', name: 'Timber', cost: 10, unlock: 400 },
  { id: 'glass', name: 'Glass', cost: 40, unlock: 2500 },
  { id: 'brick', name: 'Brick', cost: 150, unlock: 15000 },
  { id: 'crystal', name: 'Crystal', cost: 800, unlock: 120000 },
];

export const MAKER_BY_ID = new Map(MAKERS.map((m) => [m.id, m]));
export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
export const BLOCK_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
const fin = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function yardField(name) {
  return SEAT_PREFIX + seatKey(name);
}

export function emptyYardSeat(name, now) {
  return { name: String(name || 'Player').slice(0, 40), digs: 0, digEarned: 0, spent: 0, makers: {}, upgrades: [], cells: {}, joinedAt: now, seenAt: now };
}

// Squares run from -18 to 29 on the biggest lot; a seat keeps at most 32
// blocks per square (the stack height).
const CELL_KEY = /^(-?\d{1,2}),(-?\d{1,2})$/;

function cleanCells(raw) {
  const cells = {};
  for (const [key, list] of Object.entries(raw || {})) {
    if (!CELL_KEY.test(key) || !Array.isArray(list)) continue;
    const blocks = list.filter((id) => BLOCK_BY_ID.has(id)).slice(0, 32);
    if (blocks.length) cells[key] = blocks;
  }
  return cells;
}

/** Clean a seat read from the shared record; anything malformed becomes zero. */
export function cleanYardSeat(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const makers = {};
  for (const [id, m] of Object.entries(raw.makers || {})) {
    if (!MAKER_BY_ID.has(id)) continue;
    const n = Math.max(0, Math.floor(fin(m?.n)));
    if (n) makers[id] = { n, sumAt: fin(m?.sumAt) };
  }
  return {
    name: String(raw.name || 'Player').slice(0, 40),
    digs: Math.max(0, Math.floor(fin(raw.digs))),
    digEarned: Math.max(0, fin(raw.digEarned)),
    spent: Math.max(0, fin(raw.spent)),
    makers,
    upgrades: Array.isArray(raw.upgrades) ? raw.upgrades.filter((id) => UPGRADE_BY_ID.has(id)) : [],
    cells: cleanCells(raw.cells),
    joinedAt: fin(raw.joinedAt),
    seenAt: fin(raw.seenAt),
  };
}

/** Every yard seat on a window record, keyed by field name. */
export function readYardSeats(win) {
  const seats = {};
  for (const [field, value] of Object.entries(win || {})) {
    if (!field.startsWith(SEAT_PREFIX)) continue;
    const seat = cleanYardSeat(value);
    if (seat) seats[field] = seat;
  }
  return seats;
}

export function digValue(upgrades, rate) {
  let value = 1;
  let share = 0;
  for (const id of upgrades) {
    const u = UPGRADE_BY_ID.get(id);
    if (!u) continue;
    if (u.double) value *= 2;
    if (u.share) share += u.share;
  }
  return value + share * rate;
}

/** The shared wallet and makers as everyone sees them at `now` (seconds). */
export function economyAt(seats, now) {
  const owned = {};
  const upgrades = new Set();
  let earned = 0;
  let spent = 0;
  let rate = 0;
  for (const seat of Object.values(seats)) {
    earned += seat.digEarned;
    spent += seat.spent;
    for (const id of seat.upgrades) upgrades.add(id);
    for (const [id, m] of Object.entries(seat.makers)) {
      const maker = MAKER_BY_ID.get(id);
      owned[id] = (owned[id] || 0) + m.n;
      rate += maker.rate * m.n;
      // Clocks differ a little between browsers; never count negative time.
      earned += maker.rate * Math.max(0, m.n * now - m.sumAt);
    }
  }
  return { wallet: Math.max(0, earned - spent), earned, spent, rate, owned, upgrades, dig: digValue(upgrades, rate) };
}

export function makerCost(id, owned = 0) {
  const maker = MAKER_BY_ID.get(id);
  return maker ? Math.ceil(maker.base * COST_GROWTH ** owned) : Infinity;
}

/** Makers the shop shows: everything up to one past the best owned (two at the start). */
export function shopMakers(eco) {
  const top = MAKERS.reduce((best, m, i) => ((eco.owned[m.id] || 0) > 0 ? i : best), -1);
  return MAKERS.slice(0, Math.max(2, top + 2));
}

export function shopUpgrades(eco) {
  return UPGRADES.filter((u) => !eco.upgrades.has(u.id)
    && (!u.unlock || (eco.owned[u.unlock.maker] || 0) >= u.unlock.n));
}

export function unlockedBlocks(eco) {
  return BLOCKS.filter((b) => eco.earned >= b.unlock);
}

// Seat changes. Each returns a new seat (or null when the yard can't afford it).

export function dig(seat, eco, count = 1) {
  return { ...seat, digs: seat.digs + count, digEarned: seat.digEarned + eco.dig * count };
}

export function buyMaker(seat, eco, id, now) {
  const cost = makerCost(id, eco.owned[id] || 0);
  if (!(eco.wallet >= cost)) return null;
  const prev = seat.makers[id] || { n: 0, sumAt: 0 };
  return { ...seat, spent: seat.spent + cost, makers: { ...seat.makers, [id]: { n: prev.n + 1, sumAt: prev.sumAt + now } } };
}

export function buyUpgrade(seat, eco, id) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u || eco.upgrades.has(id) || !(eco.wallet >= u.cost)) return null;
  return { ...seat, spent: seat.spent + u.cost, upgrades: [...seat.upgrades, id] };
}

/** What the yard dug between two moments, for "while you were away". */
export function dugBetween(seats, from, to) {
  if (!(to > from)) return 0;
  return Math.max(0, economyAt(seats, to).earned - economyAt(seats, from).earned);
}
