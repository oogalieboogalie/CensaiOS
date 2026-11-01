// Blockyard's bigger lot: 32 high, plots past 12 that grow out on every
// side, old 12 by 12 saves opening in the middle, turning the 3D view, and
// the sample builds.
import { cleanYardSeat, economyAt, emptyYardSeat } from '../src/lib/games/blocks/economy.js';
import { MAX_HEIGHT, inPlot, landSize, nextMilestone, placeBlock, plotOrigin, stacksOf } from '../src/lib/games/blocks/yard.js';
import { sceneCubes, unturn } from '../src/lib/games/blocks/iso.js';
import { SAMPLES } from '../src/lib/games/blocks/samples.js';

const rich = (name, blocks) => ({ ...emptyYardSeat(name, 0), digEarned: blocks });

// A save from before the bigger lot: every square of the old 12 by 12 plot.
function oldSave() {
  const cells = {};
  for (let x = 0; x < 12; x += 1) for (let y = 0; y < 12; y += 1) cells[`${x},${y}`] = Array(12).fill('soil');
  return { ...rich('Pat', 5e7), cells };
}

describe('the bigger lot', () => {
  test('stacks go 32 high now', () => {
    expect(MAX_HEIGHT).toBe(32);
    let seat = rich('A', 1e6);
    for (let i = 0; i < 32; i += 1) {
      const stacks = stacksOf({ a: seat }, 12);
      seat = placeBlock(seat, economyAt({ a: seat }, 0), stacks, 12, 3, 3, 'soil');
      expect(seat).not.toBeNull();
    }
    expect(placeBlock(seat, economyAt({ a: seat }, 0), stacksOf({ a: seat }, 12), 12, 3, 3, 'soil')).toBeNull();
    expect(cleanYardSeat(seat).cells['3,3']).toHaveLength(32);
  });

  test('the plot keeps growing past 12, out to 48 wide', () => {
    expect(landSize(30000)).toBe(12);
    expect(landSize(250000)).toBe(16);
    expect(landSize(1.5e6)).toBe(24);
    expect(landSize(8e6)).toBe(32);
    expect(landSize(4e7)).toBe(48);
    expect(nextMilestone(200000).label).toBe('grows the plot to 16 by 16');
    expect(nextMilestone(1e7).label).toBe('grows the plot to 48 by 48');
    expect(nextMilestone(4e7)).toBeNull();
  });

  test('small plots start at 0,0 like before; big ones grow out on every side', () => {
    expect(plotOrigin(6)).toBe(0);
    expect(plotOrigin(12)).toBe(0);
    expect(plotOrigin(24)).toBe(-6);
    expect(plotOrigin(48)).toBe(-18);
    expect(inPlot(-18, 29, 48)).toBe(true);
    expect(inPlot(30, 0, 48)).toBe(false);
    expect(inPlot(-1, 0, 12)).toBe(false);
  });

  test('an old 12 by 12 save opens whole, in the middle of the 48 lot', () => {
    const seat = cleanYardSeat(JSON.parse(JSON.stringify(oldSave())));
    const stacks = stacksOf({ a: seat }, 48);
    expect(Object.keys(stacks)).toHaveLength(144);
    const lo = plotOrigin(48);
    // 18 empty squares to the left and top, 18 to the right and bottom.
    expect(0 - lo).toBe(18);
    expect(lo + 48 - 12).toBe(18);
  });

  test('blocks can be placed on the new squares below zero and survive a save', () => {
    const seat = rich('A', 5e7);
    const placed = placeBlock(seat, economyAt({ a: seat }, 0), {}, 48, -18, -18, 'soil');
    expect(placed.cells['-18,-18']).toEqual(['soil']);
    expect(cleanYardSeat(JSON.parse(JSON.stringify(placed))).cells['-18,-18']).toEqual(['soil']);
    expect(placeBlock(seat, economyAt({ a: seat }, 0), {}, 12, -1, 0, 'soil')).toBeNull();
  });
});

describe('drawing the bigger lot', () => {
  test('a solid 48 by 48 by 32 build only draws the faces you can see', () => {
    const cells = {};
    for (let x = -18; x < 30; x += 1) for (let y = -18; y < 30; y += 1) cells[`${x},${y}`] = Array(32).fill('stone');
    const stacks = stacksOf({ a: { ...rich('A', 0), cells } }, 48);
    const cubes = sceneCubes(stacks, 48, plotOrigin(48));
    // Every top, plus the two front walls: far fewer than 73,728 cubes.
    expect(cubes.length).toBe(48 * 48 + 2 * 47 * 31 + 31);
    expect(cubes.every((c) => c.top || c.faces.left || c.faces.right)).toBe(true);
  });

  test('turning the view is a true quarter turn and four turns come home', () => {
    for (let turn = 0; turn < 4; turn += 1) {
      const seen = new Set();
      for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) seen.add(unturn(x, y, 5, turn).join(','));
      expect(seen.size).toBe(25);
    }
    expect(unturn(0, 0, 5, 1)).toEqual([0, 4]);
    expect(unturn(...unturn(...unturn(...unturn(1, 2, 5, 1), 5, 1), 5, 1), 5, 1)).toEqual([1, 2]);
  });

  test('a turned view still finds every block and keeps its real square', () => {
    const stacks = { '-6,-6': [{ id: 'soil', field: 'a' }], '17,17': [{ id: 'glass', field: 'a' }] };
    for (let turn = 0; turn < 4; turn += 1) {
      const cubes = sceneCubes(stacks, 24, -6, turn);
      expect(cubes.map((c) => `${c.gx},${c.gy}`).sort()).toEqual(['-6,-6', '17,17']);
    }
  });

  test('the sample builds are real blocks inside their own little plots', () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(3);
    for (const s of SAMPLES) {
      expect(sceneCubes(s.stacks, s.size).length).toBeGreaterThan(0);
      for (const [key, stack] of Object.entries(s.stacks)) {
        const [x, y] = key.split(',').map(Number);
        expect(x < s.size && y < s.size).toBe(true);
        expect(stack.length).toBeLessThanOrEqual(MAX_HEIGHT);
      }
    }
  });
});
