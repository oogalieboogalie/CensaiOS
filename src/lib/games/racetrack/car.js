// A small top-down car with arcade handling. Velocity is split into the part
// along the car's nose and the part sideways: the engine pushes the first,
// grip bleeds off the second. Low grip (grass, or the handbrake) lets the
// sideways part live on, which is a drift. Fixed STEP, no randomness.

export const STEP = 1 / 60;
export const CAR = Object.freeze({ length: 32, width: 16 });
export const INPUT = Object.freeze({ UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, BRAKE: 16 });

const ROAD = { engine: 300, top: 330, drag: 0.3, grip: 8 };
const GRASS = { engine: 190, top: 120, drag: 2.2, grip: 3 };
const BRAKE = 640;
const REVERSE_TOP = 90;
const HANDBRAKE_GRIP = 1.4;
const TURN = 3.1; // radians per second at speed
const TURN_FULL_AT = 110; // speed at which steering reaches full rate

export function createCar(spot = { x: 0, y: 0, angle: 0 }) {
  return { x: spot.x, y: spot.y, a: spot.angle || 0, vx: 0, vy: 0, slip: 0 };
}

export function speedOf(car) {
  return Math.hypot(car.vx, car.vy);
}

/** Advance the car one step. `onRoad` picks the surface; `bounds` keeps it in the world. */
export function stepCar(car, keys, { onRoad = true, bounds = null, dt = STEP } = {}) {
  const surface = onRoad ? ROAD : GRASS;
  const fx = Math.cos(car.a);
  const fy = Math.sin(car.a);
  let forward = car.vx * fx + car.vy * fy;
  let side = car.vx * -fy + car.vy * fx;

  const up = keys & INPUT.UP;
  const down = keys & INPUT.DOWN;
  if (up) forward += surface.engine * dt;
  if (down) forward -= (forward > 5 ? BRAKE : surface.engine * 0.6) * dt;
  forward -= forward * surface.drag * dt;
  if (!up && !down) forward -= Math.sign(forward) * Math.min(Math.abs(forward), 40 * dt);
  if (forward > surface.top) forward += (surface.top - forward) * Math.min(1, 4 * dt);
  if (forward < -REVERSE_TOP) forward = -REVERSE_TOP;

  const steer = (keys & INPUT.RIGHT ? 1 : 0) - (keys & INPUT.LEFT ? 1 : 0);
  const reach = Math.min(1, Math.abs(forward) / TURN_FULL_AT);
  car.a += steer * TURN * reach * Math.sign(forward || 1) * dt;

  const grip = keys & INPUT.BRAKE ? HANDBRAKE_GRIP : surface.grip;
  side *= Math.exp(-grip * dt);
  if (keys & INPUT.BRAKE) forward -= forward * 1.2 * dt;

  const nx = Math.cos(car.a);
  const ny = Math.sin(car.a);
  car.vx = nx * forward - ny * side;
  car.vy = ny * forward + nx * side;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.slip = Math.abs(side);
  if (bounds) {
    if (car.x < 0 || car.x > bounds.w) { car.x = Math.max(0, Math.min(bounds.w, car.x)); car.vx *= -0.3; }
    if (car.y < 0 || car.y > bounds.h) { car.y = Math.max(0, Math.min(bounds.h, car.y)); car.vy *= -0.3; }
  }
  return car;
}
