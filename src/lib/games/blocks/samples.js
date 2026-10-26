// Sample builds for Blockyard's inspiration panel: a few hand-made ideas
// drawn from data, so there is always something to look at. Pure.

const col = (...ids) => ids.map((id) => ({ id, field: 'sample' }));
const repeat = (id, n) => Array.from({ length: n }, () => id);

function tower() {
  const stacks = {};
  for (let x = 0; x < 3; x += 1) {
    for (let y = 0; y < 3; y += 1) {
      const edge = x !== 1 || y !== 1;
      stacks[`${x},${y}`] = col(...repeat('stone', 2), ...repeat(edge ? 'brick' : 'glass', 9), ...(edge && (x + y) % 2 === 0 ? ['brick'] : []));
    }
  }
  stacks['1,1'].push(...col('crystal', 'crystal'));
  return { size: 3, stacks };
}

function bridge() {
  const stacks = {};
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 2; y += 1) {
      const pier = x === 0 || x === 6;
      const arch = x === 1 || x === 5;
      if (pier) stacks[`${x},${y}`] = col(...repeat('stone', 4), 'timber');
      else if (arch) stacks[`${x},${y}`] = col('stone', 'stone', 'stone', 'timber');
      else stacks[`${x},${y}`] = col(...repeat('glass', 3), 'timber');
    }
  }
  return { size: 7, stacks };
}

function house() {
  const stacks = {};
  for (let x = 0; x < 5; x += 1) {
    for (let y = 0; y < 4; y += 1) {
      const wall = x === 0 || x === 4 || y === 0 || y === 3;
      const window = wall && (x === 2 || y === 1) && !(x === 0 && y === 0);
      const roof = ['timber', 'timber'].slice(0, Math.min(x, 4 - x) + 1);
      stacks[`${x},${y}`] = wall ? col('brick', window ? 'glass' : 'brick', 'brick', ...roof) : col('soil', ...roof.map(() => 'timber'));
    }
  }
  stacks['3,0'].push(...col('stone', 'stone'));
  return { size: 5, stacks };
}

/** The sample builds, smallest first. */
export const SAMPLES = [
  { id: 'house', name: 'Little house', blurb: 'Brick walls, glass windows, a timber roof', ...house() },
  { id: 'bridge', name: 'Glass bridge', blurb: 'Stone piers with a timber deck', ...bridge() },
  { id: 'tower', name: 'Crystal tower', blurb: 'A brick tower with a crystal tip', ...tower() },
];
