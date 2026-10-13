// How a YorWare CAD window lives in board state. A part is a short recipe
// (JavaScript on the replicad library) plus the sizes someone dialed in.
// Each size is its own window field, so two people turning different dials
// merge; the recipe text is one field (the last save wins).
//
//   cadCode        the recipe: `const params = {…}` and `function main(r, p)`
//   cp.<name>      a size someone changed (missing = the recipe's own value)
//   cadRun         what the last build made: { ok, error, size, volume,
//                  bodies, hash, at }, so agents can see if a recipe works
import { readParts } from '../office/officeParts.js';

export const CAD_PARAM = 'cp';
export const MAX_CODE_CHARS = 20000;
export const MAX_PARAMS = 24;

export const paramKey = (name) => `${CAD_PARAM}.${name}`;

// Size names become part of a field name, so letters, digits and _ only.
export const safeParamName = (name) => typeof name === 'string' && /^[A-Za-z_][\w]{0,39}$/.test(name);

const cleanValue = (v) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 80);

/** Everything the window needs, read from the window record. */
export function readCad(win) {
  const code = typeof win?.cadCode === 'string' ? win.cadCode : '';
  const values = {};
  for (const [name, v] of Object.entries(readParts(win, CAD_PARAM))) {
    if (safeParamName(name) && cleanValue(v)) values[name] = v;
  }
  const run = win?.cadRun && typeof win.cadRun === 'object' ? win.cadRun : null;
  return { code, values, run };
}

/** Save a new recipe. */
export function codePatch(code) {
  const text = String(code ?? '');
  if (text.length > MAX_CODE_CHARS) throw new Error(`A recipe can be at most ${MAX_CODE_CHARS} characters.`);
  return { cadCode: text };
}

/** Change one size; `null` goes back to the recipe's own value. */
export function paramPatch(name, value) {
  if (!safeParamName(name)) throw new Error(`"${name}" is not a size this part has.`);
  if (value !== null && !cleanValue(value)) throw new Error(`"${name}" needs a number, yes/no or a short word.`);
  return { [paramKey(name)]: value };
}

/** Put every size back to the recipe's own value. */
export function resetPatch(values) {
  return Object.fromEntries(Object.keys(values || {}).map((name) => [paramKey(name), null]));
}

/** A short fingerprint of a recipe and its sizes; same input, same build. */
export function recipeHash(code, values = {}) {
  const text = `${code}\u0000${JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]))}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** The record of a build, kept small for the board. */
export function runRecord(result, hash) {
  if (!result?.ok) return { ok: false, error: String(result?.error || 'The part could not be built.').slice(0, 600), hash, at: Date.now() };
  return {
    ok: true,
    hash,
    at: Date.now(),
    size: (result.size || []).map((n) => round(n)),
    volume: round(result.volume || 0, 1),
    bodies: (result.bodies || []).map((b) => String(b.name || 'Part').slice(0, 60)).slice(0, 20),
  };
}

/** Write the build record only when it says something new. */
export function runPatch(board, result, hash) {
  const old = board.run;
  const next = runRecord(result, hash);
  if (old && old.hash === hash && old.ok === next.ok && (old.error || '') === (next.error || '')) return null;
  return { cadRun: next };
}

/** "80 × 40 × 30 mm" from a size. */
export function sizeText(size) {
  if (!Array.isArray(size) || size.length !== 3) return '';
  return `${size.map((n) => round(n, 1)).join(' × ')} mm`;
}

/** Cubic millimetres as something readable. */
export function volumeText(mm3) {
  const v = Number(mm3) || 0;
  return v >= 1000 ? `${round(v / 1000, 1)} cm³` : `${round(v, 1)} mm³`;
}
