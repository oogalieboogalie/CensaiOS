import { buildTrack, gridSpot, locate, pickTrackStroke, pointAt, roadWidthFor, sampleTrack, trackFromPoints, trackFromStroke, WORLD_SPAN, MIN_WIDTH, MAX_WIDTH } from '../src/lib/games/racetrack/track.js';
import { createLaps, currentLap, formatLap, mergeBestLaps, updateLaps } from '../src/lib/games/racetrack/laps.js';
import { createCar, INPUT, speedOf, STEP, stepCar } from '../src/lib/games/racetrack/car.js';
import { createRivals, normalizeCar } from '../src/lib/games/racetrack/wire.js';
import { handleCarMessage, __resetCarRelayForTests } from '../server/ws/carMessages.js';

// A wobbly hand-drawn circle in canvas units, starting at the right and
// going clockwise on screen, that runs a little past its start.
function drawnCircle({ cx = 400, cy = 300, r = 150, overshoot = 0.06, steps = 90 } = {}) {
  const pts = [];
  for (let i = 0; i <= steps * (1 + overshoot); i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const wob = Math.sin(i * 1.7) * 2;
    pts.push({ x: cx + Math.cos(t) * (r + wob), y: cy + Math.sin(t) * (r + wob), p: 0.5 });
  }
  return pts;
}

describe('building a track from a drawing', () => {
  test('a closed loop becomes an evenly spaced road in world units', () => {
    const { track, error } = trackFromPoints(drawnCircle(), { strokeSize: 6 });
    expect(error).toBeUndefined();
    expect(track.width).toBe(roadWidthFor(6));
    expect(Math.max(track.world.w, track.world.h)).toBeLessThanOrEqual(WORLD_SPAN + 1);
    const built = buildTrack(track);
    // Roughly pi * (span - 2 margins) around.
    expect(built.length).toBeGreaterThan(2400);
    expect(built.length).toBeLessThan(2900);
    const gaps = built.pts.map((p, i) => Math.hypot(built.pts[(i + 1) % built.pts.length].x - p.x, built.pts[(i + 1) % built.pts.length].y - p.y));
    expect(Math.max(...gaps)).toBeLessThan(14);
    expect(Math.min(...gaps)).toBeGreaterThan(4);
  });

  test('the start line is the first point of the stroke, facing the way it was drawn', () => {
    const built = buildTrack(trackFromPoints(drawnCircle()).track);
    // The circle starts at its rightmost point and heads down the screen.
    expect(built.start.x).toBeGreaterThan(built.world.w * 0.8);
    expect(Math.sin(built.start.angle)).toBeGreaterThan(0.9);
    const grid = gridSpot(built);
    expect(locate(built, grid.x, grid.y).s).toBeGreaterThan(built.length - 60);
  });

  test('pen thickness sets road width, within drivable limits', () => {
    expect(roadWidthFor(3)).toBeLessThan(roadWidthFor(12));
    expect(roadWidthFor(0.5)).toBe(MIN_WIDTH);
    expect(roadWidthFor(80)).toBe(MAX_WIDTH);
    expect(trackFromStroke({ pts: drawnCircle(), size: 12 }).track.width).toBe(roadWidthFor(12));
  });

  test('open lines, scribbles and dots are refused with a plain reason', () => {
    const line = Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: 0 }));
    expect(trackFromPoints(line).error).toMatch(/Close the loop/);
    expect(trackFromPoints([{ x: 1, y: 1 }, { x: 2, y: 2 }]).error).toMatch(/too short/);
    expect(trackFromPoints(Array.from({ length: 20 }, () => ({ x: 5, y: 5 }))).error).toBeTruthy();
    expect(buildTrack({ pts: 'nope' })).toBeNull();
    expect(buildTrack(null)).toBeNull();
  });

  test('a loop that stops a little short is closed for you', () => {
    const { track } = trackFromPoints(drawnCircle({ overshoot: -0.08 }));
    expect(track).toBeTruthy();
  });

  test('of several strokes, the longest loop is the track', () => {
    const small = { id: 'a', pts: drawnCircle({ r: 60 }), size: 4 };
    const big = { id: 'b', pts: drawnCircle({ r: 200 }), size: 4 };
    const line = { id: 'c', pts: [{ x: 0, y: 0 }, { x: 500, y: 0 }], size: 4 };
    expect(pickTrackStroke([small, line, big]).stroke.id).toBe('b');
    expect(pickTrackStroke([line])).toBeNull();
  });

  test('locate finds distance from the centre line and progress along it', () => {
    const built = buildTrack(sampleTrack());
    const quarter = pointAt(built, built.length / 4);
    const on = locate(built, quarter.x, quarter.y);
    expect(on.dist).toBeLessThan(1);
    expect(on.s).toBeCloseTo(built.length / 4, -1);
    const off = locate(built, quarter.x + Math.cos(quarter.angle + Math.PI / 2) * 100, quarter.y + Math.sin(quarter.angle + Math.PI / 2) * 100);
    expect(off.dist).toBeGreaterThan(80);
  });
});

describe('laps', () => {
  const L = 1000;

  test('crossing the line starts the clock, a full lap through every sector counts', () => {
    const laps = createLaps();
    let t = 0;
    updateLaps(laps, 980, L, t);
    expect(updateLaps(laps, 5, L, (t += 0.1)).started).toBe(true);
    let result = null;
    for (let s = 20; s <= 1000; s += 20) result = updateLaps(laps, s % L, L, (t += 0.1)) || result;
    expect(result.lap).toBeCloseTo(5, 5);
    expect(laps.laps).toBe(1);
    expect(laps.best).toBeCloseTo(5, 5);
    expect(currentLap(laps, t + 1)).toBeCloseTo(1, 5);
  });

  test('cutting across the infield does not score', () => {
    const laps = createLaps();
    updateLaps(laps, 990, L, 0);
    updateLaps(laps, 10, L, 1);
    updateLaps(laps, 200, L, 2);
    updateLaps(laps, 800, L, 3); // jumped half the track
    updateLaps(laps, 990, L, 4);
    expect(updateLaps(laps, 10, L, 5).lap).toBeNull();
    expect(laps.laps).toBe(0);
  });

  test('reversing back over the line voids the lap', () => {
    const laps = createLaps();
    updateLaps(laps, 990, L, 0);
    updateLaps(laps, 10, L, 1);
    for (let s = 100; s < 1000; s += 100) updateLaps(laps, s, L, 2);
    updateLaps(laps, 10, L, 3); // forward: a real lap
    expect(laps.laps).toBe(1);
    updateLaps(laps, 990, L, 4); // back over the line
    updateLaps(laps, 10, L, 5);
    expect(laps.laps).toBe(1);
  });

  test('lap times read like a stopwatch and the board keeps one best per driver', () => {
    expect(formatLap(9.1)).toBe('9.100');
    expect(formatLap(63.4567)).toBe('1:03.457');
    expect(formatLap(NaN)).toBe('--');
    let table = mergeBestLaps([], { name: 'Alex', ms: 21000, at: 1 });
    table = mergeBestLaps(table, { name: 'Sam', ms: 19000, at: 2 });
    table = mergeBestLaps(table, { name: 'Alex', ms: 18000, at: 3 });
    table = mergeBestLaps(table, { name: 'Sam', ms: 25000, at: 4 });
    expect(table.map((r) => [r.name, r.ms])).toEqual([['Alex', 18000], ['Sam', 19000]]);
    expect(mergeBestLaps(table, { name: 'X', ms: -4 })).toHaveLength(2);
  });
});

describe('the car', () => {
  test('throttle accelerates, the road is faster than the grass', () => {
    const road = createCar({ x: 0, y: 0, angle: 0 });
    const grass = createCar({ x: 0, y: 0, angle: 0 });
    for (let i = 0; i < 240; i += 1) { stepCar(road, INPUT.UP); stepCar(grass, INPUT.UP, { onRoad: false }); }
    expect(speedOf(road)).toBeGreaterThan(280);
    expect(speedOf(grass)).toBeLessThan(160);
    expect(road.x).toBeGreaterThan(grass.x);
  });

  test('steering needs speed, braking stops, and the handbrake lets it slide', () => {
    const parked = createCar();
    for (let i = 0; i < 30; i += 1) stepCar(parked, INPUT.LEFT);
    expect(parked.a).toBe(0);

    const grip = createCar();
    const slide = createCar();
    for (let i = 0; i < 120; i += 1) { stepCar(grip, INPUT.UP); stepCar(slide, INPUT.UP); }
    for (let i = 0; i < 30; i += 1) { stepCar(grip, INPUT.UP | INPUT.RIGHT); stepCar(slide, INPUT.UP | INPUT.RIGHT | INPUT.BRAKE); }
    expect(slide.slip).toBeGreaterThan(grip.slip * 2);

    for (let i = 0; i < 180; i += 1) stepCar(grip, INPUT.DOWN);
    expect(speedOf(grip)).toBeLessThan(100); // stopped, now reversing slowly
  });

  test('the world edge holds the car in', () => {
    const car = createCar({ x: 10, y: 10, angle: Math.PI });
    for (let i = 0; i < 120; i += 1) stepCar(car, INPUT.UP, { bounds: { w: 100, h: 100 } });
    expect(car.x).toBeGreaterThanOrEqual(0);
  });

  test('a simple autopilot laps a drawn track and the lap counts', () => {
    const track = buildTrack(trackFromPoints(drawnCircle({ r: 160 }), { strokeSize: 8 }).track);
    const car = createCar(gridSpot(track));
    const laps = createLaps();
    let t = 0;
    let offRoadSteps = 0;
    for (let i = 0; i < 60 * 40 && laps.laps < 2; i += 1) {
      const here = locate(track, car.x, car.y);
      const aim = pointAt(track, here.s + 70);
      let turn = Math.atan2(aim.y - car.y, aim.x - car.x) - car.a;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      let keys = INPUT.UP;
      if (turn > 0.05) keys |= INPUT.RIGHT;
      if (turn < -0.05) keys |= INPUT.LEFT;
      const onRoad = here.dist <= track.half;
      if (!onRoad) offRoadSteps += 1;
      stepCar(car, keys, { onRoad, bounds: track.world });
      t += STEP;
      updateLaps(laps, locate(track, car.x, car.y).s, track.length, t);
    }
    expect(laps.laps).toBe(2);
    expect(laps.best).toBeGreaterThan(3);
    expect(laps.best).toBeLessThan(20);
    expect(offRoadSteps).toBeLessThan(60 * 3);
  });
});

describe('cars on the board', () => {
  test('car messages are checked before anyone sees them', () => {
    expect(normalizeCar({ type: 'game.car', windowId: 'w1', x: 10.04, y: 20, a: 1.23456, lap: 2.7, name: 'A'.repeat(90) }))
      .toEqual({ windowId: 'w1', x: 10, y: 20, a: 1.235, lap: 2, name: 'A'.repeat(40) });
    expect(normalizeCar({ type: 'game.car', windowId: 'w1', x: 'x', y: 0, a: 0 })).toBeNull();
    expect(normalizeCar({ type: 'game.car', x: 0, y: 0, a: 0 })).toBeNull();
    expect(normalizeCar({ type: 'game.car', windowId: 'w1', gone: true })).toEqual({ windowId: 'w1', gone: true });
    expect(normalizeCar({ type: 'game.frame', windowId: 'w1', x: 0, y: 0, a: 0 })).toBeNull();
  });

  test('rivals glide between messages and drop out when they leave or go quiet', () => {
    const rivals = createRivals({ staleMs: 1000 });
    rivals.receive({ type: 'game.car', windowId: 'w', clientId: 'c2', x: 0, y: 0, a: 0, name: 'Sam' }, 0);
    rivals.receive({ type: 'game.car', windowId: 'w', clientId: 'c2', x: 100, y: 0, a: 0 }, 10);
    const mid = rivals.list(35)[0];
    expect(mid.name).toBe('Driver');
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(100);
    expect(rivals.list(70)[0].x).toBe(100);
    rivals.receive({ type: 'game.car', windowId: 'w', clientId: 'c2', gone: true }, 80);
    expect(rivals.list(90)).toEqual([]);
    rivals.receive({ type: 'game.car', windowId: 'w', clientId: 'c3', x: 1, y: 1, a: 0 }, 100);
    expect(rivals.list(2000)).toEqual([]);
  });

  test('the server relays good car messages to everyone else and refuses bad ones', async () => {
    __resetCarRelayForTests();
    const sent = [];
    const context = { ws: {}, clientId: 'c1', workspaceId: 'ws-1', actor: { label: 'Alex' } };
    expect(handleCarMessage({ type: 'cursor.move' }, context, () => {})).toBe(false);
    expect(handleCarMessage({ type: 'game.car', windowId: 'w', x: 'bad' }, context, (_ws, payload) => sent.push(payload))).toBe(true);
    expect(sent).toEqual([{ type: 'error', reason: 'invalid-car' }]);
    expect(handleCarMessage({ type: 'game.car', windowId: 'w', x: 1, y: 2, a: 0 }, { ...context, spectator: true }, () => {})).toBe(true);
  });
});
