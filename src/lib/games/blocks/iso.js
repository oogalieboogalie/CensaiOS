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
 * Which plot square sits at view square (x, y) once the yard has been
 * turned a quarter `turn` times (0 to 3). Turning the data, not the picture,
 * keeps the back-to-front order right from every side.
 */
export function unturn(x, y, size, turn = 0) {
  const n = size - 1;
  switch (((turn % 4) + 4) % 4) {
    case 1: return [y, n - x];
    case 2: return [n - x, n - y];
    case 3: return [n - y, x];
    default: return [x, y];
  }
}

/**
 * Cubes to draw, back to front, in plot squares (0 is the plot's first
 * square; `gx`/`gy` are the yard's own square numbers, which start at
 * `origin`). Only the faces nobody covers are kept: a top under another
 * block, or a side pressed against a neighbour as tall, is skipped, and a
 * cube with no face left is not drawn at all. A solid build stays cheap to
 * draw even on the 48 by 48 lot.
 */
export function sceneCubes(stacks, size, origin = 0, turn = 0) {
  const at = (x, y) => {
    const [ux, uy] = unturn(x, y, size, turn);
    return [ux + origin, uy + origin];
  };
  const height = (x, y) => (x < size && y < size ? stacks[at(x, y).join(',')]?.length || 0 : 0);
  const cubes = [];
  for (let d = 0; d <= (size - 1) * 2; d += 1) {
    for (let x = Math.max(0, d - size + 1); x <= Math.min(d, size - 1); x += 1) {
      const y = d - x;
      const [gx, gy] = at(x, y);
      const stack = stacks[`${gx},${gy}`];
      if (!stack) continue;
      const right = height(x + 1, y);
      const left = height(x, y + 1);
      for (let z = 0; z < stack.length; z += 1) {
        const top = z === stack.length - 1;
        const faces = { top, left: left <= z, right: right <= z };
        if (!faces.top && !faces.left && !faces.right) continue;
        cubes.push({ x, y, z, gx, gy, id: stack[z].id, field: stack[z].field, top, faces });
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
