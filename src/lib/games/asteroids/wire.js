// Asteroids on the wire (spec 11). The host sends a compact picture of the
// match ("frame") about 30 times a second; everyone else draws it, easing
// between the last two pictures so motion stays smooth at 60 fps. Shared by
// the browser and the server, which validates frames before relaying them.

import { INPUT_MASK, MAX_PLAYERS, WORLD } from './engine.js';

export const FRAME_INTERVAL_MS = 33;
export const MAX_ROCKS = 160;
export const MAX_SHOTS = MAX_PLAYERS * 6;
export const FRAME_STATUSES = Object.freeze(['playing', 'paused', 'over', 'ended']);
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// Ship flags.
export const SHIP_ALIVE = 1;
export const SHIP_THRUST = 2;
export const SHIP_SHIELD = 4;

/** The host's engine state as a frame payload (without type/windowId). */
export function encodeFrame(state, { paused = false } = {}) {
  return {
    game: 'asteroids',
    tick: state.tick,
    status: paused && state.status === 'playing' ? 'paused' : state.status,
    wave: state.wave,
    ships: Object.values(state.ships).map((s) => [
      s.id, s.name, s.slot, r1(s.x), r1(s.y), r2(s.a),
      (s.alive ? SHIP_ALIVE : 0) | (s.thrusting ? SHIP_THRUST : 0) | (s.invulnerable > 0 ? SHIP_SHIELD : 0),
      s.score, s.lives,
    ]),
    rocks: state.rocks.map((r) => [r.id, r1(r.x), r1(r.y), r.size, r2(r.rot)]),
    shots: state.shots.map((b) => [b.id, r1(b.x), r1(b.y), b.slot]),
  };
}

function finite(n, limit) {
  return Number.isFinite(n) && Math.abs(n) <= limit;
}

function cleanShip(row) {
  if (!Array.isArray(row) || row.length < 9) return null;
  const [id, name, slot, x, y, a, flags, score, lives] = row;
  if (!ID_PATTERN.test(String(id))) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) return null;
  if (!finite(x, WORLD.w * 2) || !finite(y, WORLD.h * 2) || !finite(a, 1e6)) return null;
  if (!Number.isInteger(flags) || !Number.isInteger(score) || !Number.isInteger(lives)) return null;
  if (score < 0 || score > 1e9 || lives < 0 || lives > 99) return null;
  return { id: String(id), name: String(name || 'Player').slice(0, 40), slot, x, y, a, flags: flags & 7, score, lives };
}

function cleanRock(row) {
  if (!Array.isArray(row) || row.length < 5) return null;
  const [id, x, y, size, rot] = row;
  if (!Number.isInteger(id) || id < 0) return null;
  if (!finite(x, WORLD.w * 2) || !finite(y, WORLD.h * 2) || !finite(rot, 1e6)) return null;
  if (![1, 2, 3].includes(size)) return null;
  return { id, x, y, size, rot };
}

function cleanShot(row) {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [id, x, y, slot] = row;
  if (!Number.isInteger(id) || id < 0) return null;
  if (!finite(x, WORLD.w * 2) || !finite(y, WORLD.h * 2)) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) return null;
  return { id, x, y, slot };
}

function cleanList(list, max, clean) {
  if (!Array.isArray(list) || list.length > max) return null;
  const out = [];
  for (const row of list) {
    const item = clean(row);
    if (!item) return null;
    out.push(item);
  }
  return out;
}

/** Validate a received frame; returns a decoded picture or null. */
export function decodeFrame(message) {
  if (message?.game !== 'asteroids') return null;
  if (!ID_PATTERN.test(String(message?.windowId || ''))) return null;
  if (!Number.isSafeInteger(message.tick) || message.tick < 0) return null;
  if (!FRAME_STATUSES.includes(message.status)) return null;
  if (!Number.isInteger(message.wave) || message.wave < 0 || message.wave > 10000) return null;
  const ships = cleanList(message.ships, MAX_PLAYERS, cleanShip);
  const rocks = cleanList(message.rocks, MAX_ROCKS, cleanRock);
  const shots = cleanList(message.shots, MAX_SHOTS, cleanShot);
  if (!ships || !rocks || !shots) return null;
  return { windowId: String(message.windowId), tick: message.tick, status: message.status, wave: message.wave, ships, rocks, shots };
}

/** Re-encode a decoded picture for relaying (drops unknown fields). */
export function relayFrame(picture) {
  return {
    game: 'asteroids',
    windowId: picture.windowId,
    tick: picture.tick,
    status: picture.status,
    wave: picture.wave,
    ships: picture.ships.map((s) => [s.id, s.name, s.slot, s.x, s.y, s.a, s.flags, s.score, s.lives]),
    rocks: picture.rocks.map((r) => [r.id, r.x, r.y, r.size, r.rot]),
    shots: picture.shots.map((b) => [b.id, b.x, b.y, b.slot]),
  };
}

/** A player's keys, sent to the host. Returns the clean message or null. */
export function normalizeGameInput(message) {
  if (!ID_PATTERN.test(String(message?.windowId || ''))) return null;
  if (!ID_PATTERN.test(String(message?.to || ''))) return null;
  const keys = Number(message.keys);
  if (!Number.isInteger(keys) || keys < 0) return null;
  return {
    windowId: String(message.windowId),
    to: String(message.to),
    keys: keys & INPUT_MASK,
    join: Boolean(message.join),
    leave: Boolean(message.leave),
  };
}

// Easing across the wrap edge would sweep an object across the whole field.
function lerpWrapped(a, b, t, size) {
  if (Math.abs(b - a) > size / 2) return t < 0.5 ? a : b;
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function easeList(from, to, t, extra) {
  const before = new Map(from.map((item) => [item.id, item]));
  return to.map((item) => {
    const prev = before.get(item.id);
    if (!prev) return item;
    return {
      ...item,
      x: lerpWrapped(prev.x, item.x, t, WORLD.w),
      y: lerpWrapped(prev.y, item.y, t, WORLD.h),
      ...(extra ? extra(prev, item) : {}),
    };
  });
}

/** The picture `t` (0..1) of the way from `from` to `to`. */
export function interpolatePicture(from, to, t) {
  if (!from || t >= 1) return to;
  t = Math.max(0, t);
  return {
    ...to,
    ships: easeList(from.ships, to.ships, t, (prev, item) => ({ a: lerpAngle(prev.a, item.a, t) })),
    rocks: easeList(from.rocks, to.rocks, t, (prev, item) => ({ rot: lerpAngle(prev.rot, item.rot, t) })),
    shots: easeList(from.shots, to.shots, t),
  };
}

/**
 * What changed between two pictures, for sounds and sparks: rocks that broke,
 * ships that blew up, shots that were fired.
 */
export function pictureEvents(prev, next) {
  if (!prev || !next) return { broken: [], destroyed: [], fired: [] };
  const nextRocks = new Set(next.rocks.map((r) => r.id));
  const prevShots = new Set(prev.shots.map((b) => b.id));
  const prevShips = new Map(prev.ships.map((s) => [s.id, s]));
  return {
    broken: prev.rocks.filter((r) => !nextRocks.has(r.id)),
    destroyed: next.ships.filter((s) => {
      const before = prevShips.get(s.id);
      return before && (before.flags & SHIP_ALIVE) && !(s.flags & SHIP_ALIVE);
    }),
    fired: next.shots.filter((b) => !prevShots.has(b.id)),
  };
}

/** The host's own engine state as a picture, same shape as a received one. */
export function pictureFromState(state, windowId, options) {
  return decodeFrame({ ...encodeFrame(state, options), windowId });
}

/** From a buffer of received pictures ({ picture, at }), the one for time `at`. */
export function pickPicture(buffer, at) {
  for (let i = buffer.length - 1; i > 0; i -= 1) {
    const a = buffer[i - 1];
    const b = buffer[i];
    if (a.at <= at && at <= b.at) return interpolatePicture(a.picture, b.picture, (at - a.at) / Math.max(1, b.at - a.at));
  }
  return buffer.length ? buffer[buffer.length - 1].picture : null;
}
