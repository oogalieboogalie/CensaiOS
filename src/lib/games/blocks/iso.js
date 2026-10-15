// Isometric drawing for Blockyard: turns the yard's stacks into a list of
// cube faces in back-to-front order, ready for an SVG. Pure geometry.

export const TILE_W = 32;
export const TILE_H = 16;
export const CUBE_H = 16;

/** Screen position of a grid corner (x, y) at height z (in blocks). */
export function project(x, y, z) {
  return { sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) - z * CUBE_H };
}

const pts = (list) => list.map(({ sx, sy }) => `${sx},${sy}`).join(' ');

/** The diamond a square covers on the ground (or at height z). */
export function tilePoints(x, y, z = 0) {
  return pts([project(x, y, z), project(x + 1, y, z), project(x + 1, y + 1, z), project(x, y + 1, z)]);
}

/** The whole plot's outline on the ground. */
export function plotPoints(size) {
  return pts([project(0, 0, 0), project(size, 0, 0), project(size, size, 0), project(0, size, 0)]);
}

/** The three visible faces of the cube sitting at (x, y), level z. */
export function cubeFaces(x, y, z) {
  const top = tilePoints(x, y, z + 1);
  const left = pts([project(x, y + 1, z + 1), project(x + 1, y + 1, z + 1), project(x + 1, y + 1, z), project(x, y + 1, z)]);
  const right = pts([project(x + 1, y, z + 1), project(x + 1, y + 1, z + 1), project(x + 1, y + 1, z), project(x + 1, y, z)]);
  return { top, left, right };
}

/**
 * Cubes to draw, back to front. A cube whose top and both front sides are
 * covered by neighbours can't be seen, so it is skipped: a solid build stays
 * cheap to draw.
 */
export function sceneCubes(stacks, size) {
  const height = (x, y) => (x < size && y < size ? stacks[`${x},${y}`]?.length || 0 : 0);
  const cubes = [];
  for (let d = 0; d <= (size - 1) * 2; d += 1) {
    for (let x = Math.max(0, d - size + 1); x <= Math.min(d, size - 1); x += 1) {
      const y = d - x;
      const stack = stacks[`${x},${y}`];
      if (!stack) continue;
      for (let z = 0; z < stack.length; z += 1) {
        const hidden = z < stack.length - 1 && height(x + 1, y) > z && height(x, y + 1) > z;
        if (hidden) continue;
        cubes.push({ x, y, z, id: stack[z].id, field: stack[z].field, top: z === stack.length - 1 });
      }
    }
  }
  return cubes;
}

/** An SVG viewBox that fits a plot of `size` squares with stacks up to `tall` high. */
export function sceneBox(size, tall) {
  const pad = 8;
  const left = project(0, size, 0).sx - pad;
  const right = project(size, 0, 0).sx + pad;
  const top = project(0, 0, Math.max(tall, 2)).sy - pad;
  const bottom = project(size, size, 0).sy + pad;
  return `${left} ${top} ${right - left} ${bottom - top}`;
}
