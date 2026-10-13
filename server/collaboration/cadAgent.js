// What an agent sees of, and changes in, a YorWare CAD window: the recipe,
// the sizes dialed in, and how the last build went. The part itself is
// built in the browsers that have the window open (the kernel is a 23 MB
// wasm file), so an agent changes the recipe and reads back the result.
import { codePatch, paramPatch, readCad, recipeHash, sizeText, volumeText, MAX_CODE_CHARS } from '../../src/lib/yorware/cadModel.js';
import { pdfError } from './pdfAgent.js';

export const RECIPE_GUIDE = [
  'A recipe is JavaScript on the replicad library (https://replicad.xyz/docs). Sizes are millimetres.',
  'It defines `const params = { name: { value, min, max, step?, label?, unit? } }` (each becomes a dial; a true/false value becomes a tick box, `options: [...]` a list)',
  'and `function main(r, p)` that returns a shape, a list of shapes, or a list of { shape, name, color }. `r` is replicad, `p` holds the sizes.',
  'Common calls: r.drawRectangle(w, h), r.drawRoundedRectangle(w, h, radius), r.drawCircle(radius), r.draw([x, y]).hLine(dx).vLine(dy).lineTo([x, y]).close(),',
  '.sketchOnPlane("XY", z).extrude(height), r.makeBox([x1,y1,z1],[x2,y2,z2]), r.makeCylinder(radius, height, [x,y,z], [dx,dy,dz]),',
  'shape.cut(other), .fuse(other), .fillet(radius, (e) => e.inDirection("Z")), .chamfer(size), .shell(thickness, (f) => f.inPlane("XY", z)), .translate([x,y,z]), .rotate(degrees, [0,0,0], [0,0,1]).',
].join('\n');

/** A plain-text report of the part for an agent. */
export function describeCad(win) {
  const board = readCad(win);
  const title = win.title || 'Untitled part';
  if (!board.code.trim()) return `CAD part "${title}" has no recipe yet. Write one with edit_cad_part.\n\n${RECIPE_GUIDE}`;
  const lines = [`CAD part "${title}" (YorWare CAD).`];
  const run = board.run;
  if (!run || run.hash !== recipeHash(board.code, board.values)) {
    lines.push('Last build: not built since the last change. It builds when someone has the window open; read again afterwards.');
  } else if (run.ok) {
    lines.push(`Last build: OK. ${sizeText(run.size)}, ${volumeText(run.volume)}, bodies: ${(run.bodies || []).join(', ') || 'Part'}.`);
  } else {
    lines.push(`Last build: FAILED. ${run.error}`);
  }
  const changed = Object.entries(board.values);
  lines.push(changed.length ? `Sizes changed on the board (the rest use the recipe's own value): ${changed.map(([k, v]) => `${k} = ${v}`).join(', ')}.` : 'Sizes: every one uses the recipe\'s own value.');
  lines.push('', 'Recipe:', '```js', board.code.trimEnd(), '```');
  return lines.join('\n');
}

/** Refuse code that can't even be read, before it reaches anyone's board. */
export function checkRecipe(code) {
  const text = String(code ?? '');
  if (!text.trim()) throw pdfError('The recipe is empty.', 'INVALID_CAD_RECIPE');
  if (text.length > MAX_CODE_CHARS) throw pdfError(`A recipe can be at most ${MAX_CODE_CHARS} characters.`, 'INVALID_CAD_RECIPE');
  if (!/\bfunction\s+main\s*\(|\bmain\s*=/.test(text)) throw pdfError('The recipe needs a function called main(r, p) that returns the part.', 'INVALID_CAD_RECIPE');
  try {
    // Compiles only; nothing in the recipe runs on the server.
    // eslint-disable-next-line no-new-func
    new Function('replicad', text);
  } catch (err) {
    throw pdfError(`The recipe has a typing mistake: ${err.message}`, 'INVALID_CAD_RECIPE');
  }
  return text;
}

/** The fields an edit changes: a new recipe, and/or sizes (null = back to the recipe's value). */
export function editCadPatch(win, { code, params } = {}) {
  const patch = {};
  const said = [];
  if (code !== undefined && code !== null) {
    Object.assign(patch, codePatch(checkRecipe(code)));
    said.push('changed the recipe');
  }
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    for (const [name, value] of Object.entries(params).slice(0, 24)) {
      try { Object.assign(patch, paramPatch(name, value)); } catch (err) { throw pdfError(err.message, 'INVALID_CAD_SIZE'); }
      said.push(value === null ? `reset ${name}` : `set ${name} to ${value}`);
    }
  }
  if (!Object.keys(patch).length) throw pdfError('Give a new recipe (code) or sizes to change (params).', 'INVALID_CAD_EDIT');
  return { patch, summary: said.join(', ') };
}
