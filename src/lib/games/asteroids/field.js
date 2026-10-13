// Asteroids (spec 11): the playing field. The world, the seeded random
// numbers and the rocks. Pure; engine.js runs the match on top of it.

export const WORLD = Object.freeze({ w: 960, h: 640 });

// Rock sizes: radius and points.
export const ROCK_SIZES = Object.freeze({
  3: { r: 46, points: 20 },
  2: { r: 25, points: 50 },
  1: { r: 13, points: 100 },
});

/** Seeded generator (mulberry32). Returns [value in 0..1, next seed]. */
export function nextRandom(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let x = Math.imul(t ^ (t >>> 15), t | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return [((x ^ (x >>> 14)) >>> 0) / 4294967296, t];
}

export function rand(state) {
  const [value, seed] = nextRandom(state.seed);
  state.seed = seed;
  return value;
}

export function wrap(o) {
  o.x = ((o.x % WORLD.w) + WORLD.w) % WORLD.w;
  o.y = ((o.y % WORLD.h) + WORLD.h) % WORLD.h;
}

/** Shortest distance on the wrapped (torus) field. */
export function wrappedDistance(a, b) {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  if (dx > WORLD.w / 2) dx = WORLD.w - dx;
  if (dy > WORLD.h / 2) dy = WORLD.h - dy;
  return Math.hypot(dx, dy);
}

export function makeRock(state, size, x, y, speedScale = 1) {
  const angle = rand(state) * Math.PI * 2;
  const speed = (28 + rand(state) * 52) * speedScale * (size === 1 ? 1.5 : size === 2 ? 1.2 : 1);
  return {
    id: state.nextId++,
    size,
    r: ROCK_SIZES[size].r,
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    rot: rand(state) * Math.PI * 2,
    spin: (rand(state) - 0.5) * 1.6,
  };
}

// Rocks start on the field's edge band, away from where ships spawn.
export function spawnWave(state) {
  state.wave += 1;
  const count = Math.min(3 + state.wave, 11);
  const scale = 1 + (state.wave - 1) * 0.08;
  for (let i = 0; i < count; i += 1) {
    const edge = rand(state);
    const along = rand(state);
    const x = edge < 0.5 ? along * WORLD.w : (edge < 0.75 ? 0 : WORLD.w - 1);
    const y = edge < 0.5 ? (edge < 0.25 ? 0 : WORLD.h - 1) : along * WORLD.h;
    state.rocks.push(makeRock(state, 3, x, y, scale));
  }
}

