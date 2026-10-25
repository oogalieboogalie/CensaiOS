// Blockyard: the idle building game's rules, the isometric drawing, and two
// people building on one square at once through the board's Yjs doc.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  MAKERS, buyMaker, buyUpgrade, cleanYardSeat, dig, dugBetween, economyAt, emptyYardSeat, makerCost,
  readYardSeats, shopMakers, unlockedBlocks, yardField,
} from '../src/lib/games/blocks/economy.js';
import {
  ISO_AT, MAX_HEIGHT, builders, isoUnlocked, landSize, nextMilestone, placeBlock, placedCount, stacksOf, takeBlock,
} from '../src/lib/games/blocks/yard.js';
import { sceneBox, sceneCubes } from '../src/lib/games/blocks/iso.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const rich = (name, blocks) => ({ ...emptyYardSeat(name, 0), digEarned: blocks });

describe('digging and makers', () => {
  test('digs fill the shared wallet and gloves double them', () => {
    let seat = dig(emptyYardSeat('A', 0), economyAt({}, 0), 50);
    let eco = economyAt({ a: seat }, 0);
    expect(eco.wallet).toBe(50);
    seat = buyUpgrade(seat, eco, 'gloves');
    eco = economyAt({ a: seat }, 0);
    expect(eco.wallet).toBe(10);
    expect(eco.dig).toBe(2);
  });

  test('makers keep digging while nobody is looking', () => {
    const seat = buyMaker(rich('A', 100), economyAt({ a: rich('A', 100) }, 0), 'barrow', 0);
    expect(economyAt({ a: seat }, 0).wallet).toBe(10);
    expect(economyAt({ a: seat }, 3600).wallet).toBeCloseTo(3610);
    expect(dugBetween({ a: seat }, 0, 60)).toBeCloseTo(60);
  });

  test('prices climb and the shop opens one maker at a time', () => {
    for (let i = 1; i < MAKERS.length; i += 1) expect(MAKERS[i].base).toBeGreaterThan(MAKERS[i - 1].base);
    expect(makerCost('shovel', 1)).toBeGreaterThan(makerCost('shovel', 0));
    expect(shopMakers(economyAt({}, 0)).map((m) => m.id)).toEqual(['shovel', 'barrow']);
  });

  test('a malformed seat is cleaned rather than trusted', () => {
    const seat = cleanYardSeat({ name: 'X', digEarned: 'lots', cells: { '1,1': ['soil', 'lava'], bad: ['soil'] }, makers: { rocket: { n: 9 } } });
    expect(seat.digEarned).toBe(0);
    expect(seat.cells).toEqual({ '1,1': ['soil'] });
    expect(seat.makers).toEqual({});
  });
});

describe('building', () => {
  test('placing spends blocks, taking gives them back', () => {
    const start = rich('A', 10);
    const eco = economyAt({ a: start }, 0);
    const placed = placeBlock(start, eco, {}, 6, 2, 3, 'soil');
    expect(placed.cells['2,3']).toEqual(['soil']);
    expect(economyAt({ a: placed }, 0).wallet).toBe(9);
    const taken = takeBlock(placed, 2, 3);
    expect(taken.cells['2,3']).toBeUndefined();
    expect(economyAt({ a: taken }, 0).wallet).toBe(10);
  });

  test('locked blocks, the edge of the plot and the height limit all say no', () => {
    const seat = rich('A', 59);
    const eco = economyAt({ a: seat }, 0);
    expect(unlockedBlocks(eco).map((b) => b.id)).toEqual(['soil']);
    expect(placeBlock(seat, eco, {}, 6, 0, 0, 'stone')).toBeNull();
    expect(placeBlock(seat, eco, {}, 6, 6, 0, 'soil')).toBeNull();
    const full = { '0,0': Array.from({ length: MAX_HEIGHT }, () => ({ id: 'soil', field: 'yard_b' })) };
    expect(placeBlock(seat, eco, full, 6, 0, 0, 'soil')).toBeNull();
  });

  test('you can only take back your own blocks', () => {
    expect(takeBlock(emptyYardSeat('A', 0), 1, 1)).toBeNull();
  });

  test('the plot grows and the 3D view opens as the yard digs', () => {
    expect(landSize(0)).toBe(6);
    expect(landSize(300)).toBe(8);
    expect(landSize(1e6)).toBe(12);
    expect(isoUnlocked(ISO_AT - 1)).toBe(false);
    expect(isoUnlocked(ISO_AT)).toBe(true);
    expect(nextMilestone(0).label).toBe('unlocks stone');
    expect(nextMilestone(70).label).toBe('opens the 3D view');
    expect(nextMilestone(1e7)).toBeNull();
  });
});

describe('the isometric drawing', () => {
  test('cubes come back to front and buried ones are skipped', () => {
    const block = (field = 'yard_a') => ({ id: 'stone', field });
    const stacks = { '0,0': [block(), block()], '1,0': [block(), block()], '0,1': [block(), block()], '1,1': [block()] };
    const cubes = sceneCubes(stacks, 2);
    // The bottom cube at 0,0 is covered on top and on both front sides.
    expect(cubes.some((c) => c.x === 0 && c.y === 0 && c.z === 0)).toBe(false);
    const depth = cubes.map((c) => c.x + c.y);
    expect(depth).toEqual([...depth].sort((a, b) => a - b));
    expect(cubes.filter((c) => c.top)).toHaveLength(4);
    expect(sceneBox(2, 2).split(' ')).toHaveLength(4);
  });
});

describe('two people build on one board', () => {
  test('both stack on the same square at once and both blocks survive', () => {
    const frame = { id: 'w1', kind: 'idleBlocks', x: 0, y: 0, w: 900, h: 600 };
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [frame] };
    writeStateToDoc(a, null, base, 'local');
    sync();

    const alma0 = { ...rich('Alma', 20), joinedAt: 1 };
    const sam0 = { ...rich('Sam', 20), joinedAt: 2 };
    const alma = placeBlock(alma0, economyAt({ a: alma0 }, 5), {}, 6, 3, 3, 'soil');
    const sam = placeBlock(sam0, economyAt({ s: sam0 }, 5), {}, 6, 3, 3, 'soil');
    writeStateToDoc(a, base, { wins: [{ ...frame, [yardField('Alma')]: alma }] }, 'local');
    writeStateToDoc(b, base, { wins: [{ ...frame, [yardField('Sam')]: sam }] }, 'local');
    sync();

    for (const doc of [a, b]) {
      const seats = readYardSeats(readDocState(doc).wins[0]);
      const stacks = stacksOf(seats, 6);
      expect(stacks['3,3'].map((s) => s.field)).toEqual(['yard_alma', 'yard_sam']);
      expect(placedCount(stacks)).toBe(2);
      expect(economyAt(seats, 5).wallet).toBe(38);
      expect(builders(seats).map((r) => r.placed)).toEqual([1, 1]);
    }
  });
});

describe('Blockyard in the Add palette', () => {
  test('it is a registered game window', () => {
    const manifest = WINDOW_MANIFESTS.find((m) => m.kind === 'idleBlocks');
    expect(manifest?.componentName).toBe('IdleBlocksWindow');
    const games = buildAddSections({ manifests: WINDOW_MANIFESTS.filter((m) => m.moduleMenu?.show !== false) }).find((s) => s.label === 'Games');
    expect(games.items.map((i) => i.label)).toContain('Blockyard');
  });
});
