// Agent Company, an idle clicker the whole board plays together. Pure rules:
// no React, no clock reads (callers pass `now` in seconds).
//
// Every player owns one seat, stored as its own field on the shared window
// record (`seat_<key>`), so two people tapping at once never overwrite each
// other: Yjs merges per field. The company's wallet is derived from all the
// seats together:
//
//   wallet = taps earned + what every hire has produced since it was hired - spent
//
// A hire's output is rate * (now - hiredAt). Each seat keeps, per hire type,
// the count and the sum of hire times, so the whole history folds into two
// numbers and output keeps growing while nobody has the board open.

export const SEAT_PREFIX = 'seat_';
export const COST_GROWTH = 1.15;

export const HIRES = [
  { id: 'intern', name: 'Intern', rate: 0.1, base: 15, blurb: 'Fetches coffee, ships the odd fix' },
  { id: 'agent', name: 'Agent', rate: 1, base: 100, blurb: 'Works one ticket at a time, never sleeps' },
  { id: 'squad', name: 'Agent squad', rate: 8, base: 1100, blurb: 'Five agents that review each other' },
  { id: 'rack', name: 'Server rack', rate: 47, base: 12000, blurb: 'Runs a hundred agents in parallel' },
  { id: 'datacenter', name: 'Data center', rate: 260, base: 130000, blurb: 'A whole building of agents' },
  { id: 'lab', name: 'Frontier lab', rate: 1400, base: 1.4e6, blurb: 'Trains the next agents' },
  { id: 'orbital', name: 'Orbital cluster', rate: 7800, base: 2e7, blurb: 'Solar powered, zero latency to the moon' },
];

// Tap upgrades. `double` doubles the tap; `share` adds a slice of the
// company's per-second output to every tap. Each unlocks once the company
// has enough of a hire, so the shop never fills with things out of reach.
export const UPGRADES = [
  { id: 'keyboard', name: 'Mechanical keyboard', cost: 100, double: true, unlock: null, blurb: 'Taps count double' },
  { id: 'coffee', name: 'Cold brew on tap', cost: 500, double: true, unlock: { hire: 'intern', n: 1 }, blurb: 'Taps count double' },
  { id: 'pairing', name: 'Pair with an agent', cost: 10000, double: true, unlock: { hire: 'agent', n: 5 }, blurb: 'Taps count double' },
  { id: 'autocomplete', name: 'Agent autocomplete', cost: 50000, share: 0.01, unlock: { hire: 'squad', n: 1 }, blurb: 'Each tap also earns 1% of output per second' },
  { id: 'standup', name: 'Async standups', cost: 500000, double: true, unlock: { hire: 'rack', n: 1 }, blurb: 'Taps count double' },
  { id: 'telemetry', name: 'Live telemetry', cost: 5e6, share: 0.02, unlock: { hire: 'datacenter', n: 1 }, blurb: 'Each tap also earns 2% of output per second' },
  { id: 'flow', name: 'Flow state', cost: 5e7, double: true, unlock: { hire: 'lab', n: 1 }, blurb: 'Taps count double' },
];

const HIRE_BY_ID = new Map(HIRES.map((h) => [h.id, h]));
const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
const fin = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** A stable field-safe key for a player's display name. */
export function seatKey(name) {
  const slug = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return slug || 'player';
}

export function seatField(name) {
  return SEAT_PREFIX + seatKey(name);
}

export function emptySeat(name, now) {
  return { name: String(name || 'Player').slice(0, 40), taps: 0, tapEarned: 0, spent: 0, hires: {}, upgrades: [], joinedAt: now, seenAt: now };
}

/** Clean a seat read from the shared record; anything malformed becomes zero. */
export function cleanSeat(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const hires = {};
  for (const [id, h] of Object.entries(raw.hires || {})) {
    if (!HIRE_BY_ID.has(id)) continue;
    const n = Math.max(0, Math.floor(fin(h?.n)));
    if (n) hires[id] = { n, sumAt: fin(h?.sumAt) };
  }
  return {
    name: String(raw.name || 'Player').slice(0, 40),
    taps: Math.max(0, Math.floor(fin(raw.taps))),
    tapEarned: Math.max(0, fin(raw.tapEarned)),
    spent: Math.max(0, fin(raw.spent)),
    hires,
    upgrades: Array.isArray(raw.upgrades) ? raw.upgrades.filter((id) => UPGRADE_BY_ID.has(id)) : [],
    joinedAt: fin(raw.joinedAt),
    seenAt: fin(raw.seenAt),
  };
}

/** Every seat on a window record, keyed by field name. */
export function readSeats(win) {
  const seats = {};
  for (const [field, value] of Object.entries(win || {})) {
    if (!field.startsWith(SEAT_PREFIX)) continue;
    const seat = cleanSeat(value);
    if (seat) seats[field] = seat;
  }
  return seats;
}

/** The company as everyone sees it at `now` (seconds). */
export function companyAt(seats, now) {
  const owned = {};
  const upgrades = new Set();
  let earned = 0;
  let spent = 0;
  let rate = 0;
  for (const seat of Object.values(seats)) {
    earned += seat.tapEarned;
    spent += seat.spent;
    for (const id of seat.upgrades) upgrades.add(id);
    for (const [id, h] of Object.entries(seat.hires)) {
      const hire = HIRE_BY_ID.get(id);
      owned[id] = (owned[id] || 0) + h.n;
      rate += hire.rate * h.n;
      // Clocks differ a little between browsers; never count negative time.
      earned += hire.rate * Math.max(0, h.n * now - h.sumAt);
    }
  }
  const tap = tapValue(upgrades, rate);
  return { wallet: Math.max(0, earned - spent), earned, spent, rate, owned, upgrades, tap };
}

export function tapValue(upgrades, rate) {
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

/** Price of the next hire of a kind, given how many the company already has. */
export function hireCost(id, owned = 0) {
  const hire = HIRE_BY_ID.get(id);
  return hire ? Math.ceil(hire.base * COST_GROWTH ** owned) : Infinity;
}

/** Upgrades the shop shows: unlocked and not yet owned. */
export function shopUpgrades(company) {
  return UPGRADES.filter((u) => !company.upgrades.has(u.id)
    && (!u.unlock || (company.owned[u.unlock.hire] || 0) >= u.unlock.n));
}

/** Hires the shop shows: everything up to one past the best owned (two at the start). */
export function shopHires(company) {
  const top = HIRES.reduce((best, h, i) => ((company.owned[h.id] || 0) > 0 ? i : best), -1);
  return HIRES.slice(0, Math.max(2, top + 2));
}

// Seat changes. Each returns a new seat (or null when the company can't afford it).

export function tap(seat, company, count = 1) {
  return { ...seat, taps: seat.taps + count, tapEarned: seat.tapEarned + company.tap * count };
}

export function hire(seat, company, id, now) {
  const cost = hireCost(id, company.owned[id] || 0);
  if (!(company.wallet >= cost)) return null;
  const prev = seat.hires[id] || { n: 0, sumAt: 0 };
  return { ...seat, spent: seat.spent + cost, hires: { ...seat.hires, [id]: { n: prev.n + 1, sumAt: prev.sumAt + now } } };
}

export function buyUpgrade(seat, company, id) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u || company.upgrades.has(id) || !(company.wallet >= u.cost)) return null;
  return { ...seat, spent: seat.spent + u.cost, upgrades: [...seat.upgrades, id] };
}

/** What the company made between two moments, for "while you were away". */
export function earnedBetween(seats, from, to) {
  if (!(to > from)) return 0;
  return Math.max(0, companyAt(seats, to).earned - companyAt(seats, from).earned);
}

/** Who did what, biggest contributor first. */
export function contributors(seats) {
  return Object.entries(seats).map(([field, s]) => ({
    field, name: s.name, taps: s.taps, hires: Object.values(s.hires).reduce((n, h) => n + h.n, 0), spent: s.spent, tapEarned: s.tapEarned,
  })).sort((a, b) => (b.spent + b.tapEarned) - (a.spent + a.tapEarned));
}

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 1234 -> "1,234"; 1.5e6 -> "1.50M". */
export function formatAmount(n) {
  const v = Math.max(0, fin(n));
  if (v < 1000) return v < 10 && v % 1 ? v.toFixed(1) : Math.floor(v).toLocaleString('en-US');
  if (v < 1e6) return Math.floor(v).toLocaleString('en-US');
  const tier = Math.min(UNITS.length - 1, Math.floor(Math.log10(v) / 3));
  const scaled = v / 10 ** (tier * 3);
  return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${UNITS[tier]}`;
}
