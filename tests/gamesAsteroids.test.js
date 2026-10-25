import { INPUT, WORLD, addPlayer, createGame, removePlayer, setInput, standings, step, wrappedDistance } from '../src/lib/games/asteroids/engine.js';
import { decodeFrame, encodeFrame, interpolatePicture, normalizeGameInput, pickPicture, pictureEvents, pictureFromState, relayFrame, SHIP_ALIVE } from '../src/lib/games/asteroids/wire.js';
import { createAsteroidsSession } from '../src/lib/games/asteroids/session.js';

const run = (state, steps) => { for (let i = 0; i < steps; i += 1) step(state); return state; };

describe('asteroids rules', () => {
  test('a seeded match is deterministic', () => {
    const a = run(createGame({ seed: 42, players: [{ id: 'p1', name: 'Alma' }] }), 300);
    const b = run(createGame({ seed: 42, players: [{ id: 'p1', name: 'Alma' }] }), 300);
    expect(encodeFrame(a)).toEqual(encodeFrame(b));
    expect(a.wave).toBe(1);
    expect(a.rocks.length).toBe(4);
  });

  test('thrust moves the ship and the field wraps', () => {
    const state = createGame({ seed: 1, players: [{ id: 'p1', name: 'A' }] });
    state.rocks = [];
    setInput(state, 'p1', INPUT.THRUST);
    run(state, 240);
    const ship = state.ships.p1;
    expect(ship.y).toBeGreaterThanOrEqual(0);
    expect(ship.y).toBeLessThan(WORLD.h);
    expect(Math.hypot(ship.vx, ship.vy)).toBeGreaterThan(100);
    expect(wrappedDistance({ x: 2, y: 2 }, { x: WORLD.w - 2, y: WORLD.h - 2 })).toBeCloseTo(Math.hypot(4, 4));
  });

  test('shots split big rocks, score, and the last rock starts a new wave', () => {
    const state = createGame({ seed: 3, players: [{ id: 'p1', name: 'A' }] });
    const ship = state.ships.p1;
    state.rocks = [{ id: 999, size: 3, r: 46, x: ship.x, y: ship.y - 120, vx: 0, vy: 0, rot: 0, spin: 0 }];
    ship.invulnerable = 100;
    setInput(state, 'p1', INPUT.FIRE);
    run(state, 30);
    expect(ship.score).toBeGreaterThanOrEqual(20);
    expect(state.rocks.every((r) => r.size < 3)).toBe(true);
    state.rocks = [];
    setInput(state, 'p1', 0);
    run(state, 130);
    expect(state.wave).toBe(2);
    expect(state.rocks.length).toBe(5);
  });

  test('losing every life ends the match; standings rank by score', () => {
    const state = createGame({ seed: 9, players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
    state.ships.p2.score = 500;
    for (const ship of Object.values(state.ships)) { ship.lives = 1; ship.invulnerable = 0; }
    state.rocks = Object.values(state.ships).map((s, i) => ({ id: 500 + i, size: 3, r: 46, x: s.x, y: s.y, vx: 0, vy: 0, rot: 0, spin: 0 }));
    step(state);
    expect(state.status).toBe('over');
    expect(standings(state).map((s) => s.id)).toEqual(['p2', 'p1']);
  });

  test('players join into free slots, up to eight, and leave cleanly', () => {
    const state = createGame({ seed: 1 });
    for (let i = 0; i < 8; i += 1) expect(addPlayer(state, { id: `p${i}`, name: `P${i}` })).toBe(true);
    expect(addPlayer(state, { id: 'p9', name: 'late' })).toBe(false);
    expect(addPlayer(state, { id: 'p0', name: 'again' })).toBe(false);
    expect(removePlayer(state, 'p3')).toBe(true);
    expect(addPlayer(state, { id: 'p9', name: 'late' })).toBe(true);
    expect(state.ships.p9.slot).toBe(3);
  });
});

describe('asteroids on the wire', () => {
  test('frames round-trip, stay small and reject junk', () => {
    const state = run(createGame({ seed: 5, players: Array.from({ length: 8 }, (_, i) => ({ id: `client-${i}-0000-0000-0000-000000000000`, name: `Player ${i}` })) }), 120);
    const frame = { type: 'game.frame', windowId: 'w1', ...encodeFrame(state) };
    expect(JSON.stringify(frame).length).toBeLessThan(16 * 1024);
    const picture = decodeFrame(frame);
    expect(picture.ships).toHaveLength(8);
    expect(relayFrame(picture)).toEqual(expect.objectContaining({ windowId: 'w1', game: 'asteroids' }));
    expect(decodeFrame({ ...frame, windowId: 'bad id!' })).toBeNull();
    expect(decodeFrame({ ...frame, ships: [['x', 'n', 99, 0, 0, 0, 1, 0, 3]] })).toBeNull();
    expect(decodeFrame({ ...frame, rocks: [[1, 1e9, 0, 3, 0]] })).toBeNull();
    expect(decodeFrame({ ...frame, status: 'hacked' })).toBeNull();
    expect(decodeFrame({ ...frame, shots: new Array(500).fill([1, 1, 1, 0]) })).toBeNull();
  });

  test('input messages are cleaned to the known keys', () => {
    expect(normalizeGameInput({ windowId: 'w1', to: 'host', keys: 255, join: 1 })).toEqual({ windowId: 'w1', to: 'host', keys: 15, join: true, leave: false });
    expect(normalizeGameInput({ windowId: 'w1', to: '', keys: 1 })).toBeNull();
    expect(normalizeGameInput({ windowId: 'w1', to: 'h', keys: -1 })).toBeNull();
  });

  test('easing between pictures never sweeps across the wrap edge', () => {
    const a = { status: 'playing', ships: [{ id: 's', x: WORLD.w - 2, y: 10, a: 0, flags: SHIP_ALIVE }], rocks: [{ id: 1, x: 100, y: 100, rot: 0 }], shots: [] };
    const b = { status: 'playing', ships: [{ id: 's', x: 3, y: 10, a: 0.2, flags: SHIP_ALIVE }], rocks: [{ id: 1, x: 110, y: 100, rot: 0 }], shots: [] };
    const mid = interpolatePicture(a, b, 0.5);
    expect(mid.rocks[0].x).toBe(105);
    expect([WORLD.w - 2, 3]).toContain(mid.ships[0].x);
    expect(pickPicture([{ picture: a, at: 0 }, { picture: b, at: 100 }], 25).rocks[0].x).toBeCloseTo(102.5);
  });

  test('picture events find broken rocks, lost ships and new shots', () => {
    const before = { ships: [{ id: 's', flags: SHIP_ALIVE }], rocks: [{ id: 1 }, { id: 2 }], shots: [] };
    const after = { ships: [{ id: 's', flags: 0 }], rocks: [{ id: 2 }], shots: [{ id: 7 }] };
    const events = pictureEvents(before, after);
    expect(events.broken.map((r) => r.id)).toEqual([1]);
    expect(events.destroyed.map((s) => s.id)).toEqual(['s']);
    expect(events.fired.map((b) => b.id)).toEqual([7]);
    expect(pictureFromState(createGame({ seed: 1 }), 'w1').rocks.length).toBe(4);
  });
});

// Two browsers on one board, joined by a fake relay that behaves like the
// collaboration socket (stamps clientId and actor, routes inputs to the host).
function board() {
  let t = 1000;
  const now = () => t;
  const record = { match: null, highScores: [] };
  const seats = {};
  const relay = (from) => (message) => {
    const stamped = { ...message, clientId: from, actor: { label: from === 'a' ? 'Alma' : 'Sam' } };
    for (const [id, seat] of Object.entries(seats)) {
      if (id === from) continue;
      if (message.type === 'game.input' && message.to === id) seat.receiveInput(stamped);
      if (message.type === 'game.frame') seat.receiveFrame(stamped);
    }
    return true;
  };
  const update = (patch) => {
    Object.assign(record, patch);
    for (const seat of Object.values(seats)) seat.sync({ match: record.match, highScores: record.highScores });
  };
  for (const [id, name] of [['a', 'Alma'], ['b', 'Sam']]) {
    seats[id] = createAsteroidsSession({ windowId: 'w1', selfId: id, send: relay(id), update, now });
    seats[id].sync({ selfName: name, present: ['a', 'b'], canPlay: true, match: null, highScores: [] });
  }
  const advance = (ms) => { for (let i = 0; i < ms; i += 16) { t += 16; seats.a.tick(); seats.b.tick(); } };
  return { seats, record, advance, now };
}

describe('a shared match between two people', () => {
  test('first to press play hosts; the second joins the same match and both see two ships', () => {
    const { seats, record, advance } = board();
    expect(seats.a.play()).toBe('host');
    expect(record.match).toMatchObject({ host: 'a', hostName: 'Alma' });
    advance(100);
    expect(seats.b.view()).toMatchObject({ live: true, hostName: 'Alma', role: 'idle' });
    expect(seats.b.play()).toBe('player');
    advance(200);
    expect(seats.a.view().ships.map((s) => s.name).sort()).toEqual(['Alma', 'Sam']);
    expect(seats.b.view().ships).toHaveLength(2);
    seats.b.setKeys(INPUT.THRUST);
    advance(500);
    const sam = seats.a.latest().ships.find((s) => s.id === 'b');
    expect(Math.round(sam.y)).toBeLessThan(320);
    expect(seats.b.picture()).not.toBeNull();
  });

  test('a solo host pauses on Escape; with company the match keeps running', () => {
    const { seats, advance } = board();
    seats.a.play();
    expect(seats.a.setPaused(true)).toBe(true);
    const tick = seats.a.latest().tick;
    advance(300);
    expect(seats.a.latest().tick).toBe(tick);
    seats.a.play();
    seats.b.play();
    advance(200);
    expect(seats.a.setPaused(true)).toBe(false);
  });

  test('when the match ends the host writes the scores to the shared table', () => {
    const { seats, record, advance } = board();
    seats.a.play();
    seats.b.play();
    advance(200);
    seats.a.leave();
    expect(record.match).toBeNull();
    advance(50);
    expect(seats.b.view().role).toBe('idle');
  });

  test('a player falls back to idle when the host goes quiet', () => {
    const { seats, advance } = board();
    seats.a.play();
    seats.b.play();
    advance(100);
    seats.a.tick = () => {};
    advance(6000);
    expect(seats.b.view().role).toBe('idle');
  });

  test('frames from someone who is not the host are ignored, and view-only seats cannot play', () => {
    const { seats } = board();
    seats.b.receiveFrame({ type: 'game.frame', windowId: 'w1', clientId: 'mallory', ...encodeFrame(createGame({ seed: 1 })) });
    expect(seats.b.latest()).toBeNull();
    seats.b.sync({ canPlay: false });
    expect(seats.b.play()).toBe('watch');
  });
});
