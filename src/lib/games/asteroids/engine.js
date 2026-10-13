// Asteroids (spec 11): the game rules as plain data and pure functions. No
// DOM, no timers, no randomness outside the seeded generator, so the host's
// simulation is testable and two runs with the same inputs match.
//
// One shared world (WORLD units, not pixels) for every player: each screen
// scales it to fit, so everyone on the board sees the same field. Time
// advances in fixed STEP slices (a fixed timestep); the window calls step()
// as many times as real time demands, whatever the frame rate.

import { WORLD, ROCK_SIZES, wrap, wrappedDistance, makeRock, spawnWave } from './field.js';

export { WORLD, ROCK_SIZES, nextRandom, wrappedDistance } from './field.js';
export const STEP = 1 / 60;
export const MAX_PLAYERS = 8;
export const START_LIVES = 3;

// Input is a bitmask so it fits one small number on the wire.
export const INPUT = Object.freeze({ LEFT: 1, RIGHT: 2, THRUST: 4, FIRE: 8 });
export const INPUT_MASK = INPUT.LEFT | INPUT.RIGHT | INPUT.THRUST | INPUT.FIRE;

const SHIP_RADIUS = 12;
const TURN_RATE = 4.2; // radians per second
const THRUST = 340; // units per second squared
const DRAG = 0.55; // per second
const MAX_SPEED = 430;
const SHOT_SPEED = 600;
const SHOT_LIFE = 0.95;
const FIRE_COOLDOWN = 0.2;
const MAX_SHOTS_PER_SHIP = 5;
const RESPAWN_DELAY = 1.5;
const INVULNERABLE = 2.5;
const WAVE_DELAY = 2;
const EXTRA_LIFE_EVERY = 10000;

function spawnPoint(slot) {
  // Players start spread across the middle, facing up.
  const offsets = [0, -1, 1, -2, 2, -3, 3, -4];
  return { x: WORLD.w / 2 + offsets[slot % offsets.length] * 70, y: WORLD.h / 2 };
}

function placeShip(ship) {
  const at = spawnPoint(ship.slot);
  Object.assign(ship, {
    x: at.x, y: at.y, vx: 0, vy: 0, a: -Math.PI / 2,
    alive: true, invulnerable: INVULNERABLE, respawnIn: 0, cooldown: 0,
  });
}

function freeSlot(state) {
  const used = new Set(Object.values(state.ships).map((s) => s.slot));
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) if (!used.has(slot)) return slot;
  return -1;
}

/** Add someone to the match. Returns false when it is full or they're in. */
export function addPlayer(state, { id, name }) {
  const key = String(id || '');
  if (!key || state.ships[key]) return false;
  const slot = freeSlot(state);
  if (slot < 0) return false;
  const ship = {
    id: key,
    name: String(name || 'Player').slice(0, 40),
    slot,
    score: 0,
    lives: START_LIVES,
    nextLifeAt: EXTRA_LIFE_EVERY,
    input: 0,
    thrusting: false,
  };
  placeShip(ship);
  state.ships[key] = ship;
  return true;
}

export function removePlayer(state, id) {
  const key = String(id || '');
  if (!state.ships[key]) return false;
  delete state.ships[key];
  state.shots = state.shots.filter((shot) => shot.owner !== key);
  return true;
}

export function setInput(state, id, bits) {
  const ship = state.ships[String(id || '')];
  if (!ship) return false;
  ship.input = Number(bits) & INPUT_MASK;
  return true;
}

/** A fresh match with the given players. */
export function createGame({ seed = 1, players = [] } = {}) {
  const state = {
    seed: seed >>> 0,
    tick: 0,
    wave: 0,
    nextId: 1,
    status: 'playing',
    waveDelay: 0,
    ships: {},
    rocks: [],
    shots: [],
  };
  for (const player of players) addPlayer(state, player);
  spawnWave(state);
  return state;
}

function killShip(state, ship) {
  ship.alive = false;
  ship.lives -= 1;
  ship.respawnIn = ship.lives > 0 ? RESPAWN_DELAY : 0;
  ship.thrusting = false;
}

function award(ship, points) {
  ship.score += points;
  while (ship.score >= ship.nextLifeAt) {
    ship.lives += 1;
    ship.nextLifeAt += EXTRA_LIFE_EVERY;
  }
}

function stepShip(state, ship, dt) {
  if (!ship.alive) {
    if (ship.lives > 0) {
      ship.respawnIn -= dt;
      if (ship.respawnIn <= 0) placeShip(ship);
    }
    return;
  }
  const input = ship.input;
  if (input & INPUT.LEFT) ship.a -= TURN_RATE * dt;
  if (input & INPUT.RIGHT) ship.a += TURN_RATE * dt;
  ship.thrusting = Boolean(input & INPUT.THRUST);
  if (ship.thrusting) {
    ship.vx += Math.cos(ship.a) * THRUST * dt;
    ship.vy += Math.sin(ship.a) * THRUST * dt;
  }
  const drag = Math.exp(-DRAG * dt);
  ship.vx *= drag;
  ship.vy *= drag;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > MAX_SPEED) {
    ship.vx *= MAX_SPEED / speed;
    ship.vy *= MAX_SPEED / speed;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  wrap(ship);
  ship.invulnerable = Math.max(0, ship.invulnerable - dt);
  ship.cooldown = Math.max(0, ship.cooldown - dt);
  if ((input & INPUT.FIRE) && ship.cooldown === 0) {
    const mine = state.shots.filter((shot) => shot.owner === ship.id).length;
    if (mine < MAX_SHOTS_PER_SHIP) {
      ship.cooldown = FIRE_COOLDOWN;
      state.shots.push({
        id: state.nextId++,
        owner: ship.id,
        slot: ship.slot,
        x: ship.x + Math.cos(ship.a) * SHIP_RADIUS,
        y: ship.y + Math.sin(ship.a) * SHIP_RADIUS,
        vx: ship.vx + Math.cos(ship.a) * SHOT_SPEED,
        vy: ship.vy + Math.sin(ship.a) * SHOT_SPEED,
        life: SHOT_LIFE,
      });
    }
  }
}

/** Advance the match by one fixed step. Mutates and returns the state. */
export function step(state, dt = STEP) {
  if (state.status !== 'playing') return state;
  state.tick += 1;
  const ships = Object.values(state.ships);
  for (const ship of ships) stepShip(state, ship, dt);

  for (const shot of state.shots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    wrap(shot);
  }
  for (const rock of state.rocks) {
    rock.x += rock.vx * dt;
    rock.y += rock.vy * dt;
    rock.rot += rock.spin * dt;
    wrap(rock);
  }

  // Shots break rocks: big ones split in two, the smallest vanish.
  const born = [];
  const broken = new Set();
  for (const shot of state.shots) {
    if (shot.life <= 0) continue;
    const rock = state.rocks.find((r) => !broken.has(r.id) && wrappedDistance(shot, r) < r.r);
    if (!rock) continue;
    shot.life = 0;
    broken.add(rock.id);
    const owner = state.ships[shot.owner];
    if (owner) award(owner, ROCK_SIZES[rock.size].points);
    if (rock.size > 1) {
      const scale = 1 + (state.wave - 1) * 0.08;
      born.push(makeRock(state, rock.size - 1, rock.x, rock.y, scale));
      born.push(makeRock(state, rock.size - 1, rock.x, rock.y, scale));
    }
  }
  state.shots = state.shots.filter((shot) => shot.life > 0);
  state.rocks = state.rocks.filter((rock) => !broken.has(rock.id)).concat(born);

  // Rocks kill ships that aren't shielded.
  for (const ship of ships) {
    if (!ship.alive || ship.invulnerable > 0) continue;
    if (state.rocks.some((rock) => wrappedDistance(ship, rock) < rock.r + SHIP_RADIUS * 0.75)) killShip(state, ship);
  }

  if (state.rocks.length === 0) {
    state.waveDelay += dt;
    if (state.waveDelay >= WAVE_DELAY) {
      state.waveDelay = 0;
      spawnWave(state);
    }
  }

  if (ships.length > 0 && ships.every((ship) => !ship.alive && ship.lives <= 0)) state.status = 'over';
  return state;
}

/** Final standings, best first. */
export function standings(state) {
  return Object.values(state.ships)
    .map((ship) => ({ id: ship.id, name: ship.name, score: ship.score, slot: ship.slot }))
    .sort((a, b) => b.score - a.score || a.slot - b.slot);
}
