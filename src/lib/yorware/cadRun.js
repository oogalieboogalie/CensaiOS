// Runs a YorWare CAD recipe and turns the result into what the window draws
// and the files it exports. Pure work on a loaded replicad library (`r`)
// and its OpenCascade kernel (`oc`); the window calls it inside a worker,
// the tests call it straight in Node.
//
// A recipe is JavaScript:
//   const params = { width: { value: 60, min: 10, max: 200, label: 'Width' } };
//   function main(r, p) { return r.drawRectangle(p.width, 40).sketchOnPlane().extrude(10); }
// `main` returns a shape, a list of shapes, or a list of { shape, name, color }.
import { MAX_PARAMS, safeParamName } from './cadModel.js';

export const MESH_TOLERANCE = { tolerance: 0.05, angularTolerance: 15 };
const PALETTE = ['#9aa7b4', '#e5a83a', '#6f9ec9', '#8cb37a', '#c98a6f', '#a78fc4'];

/** Compile a recipe (nothing in it runs yet beyond its top level). */
export function compileRecipe(code) {
  // eslint-disable-next-line no-new-func -- recipes are code by design; the window runs them in a worker with no network.
  const factory = new Function('replicad', `"use strict";\n${code}\n;return {
    params: typeof params === 'undefined' ? {} : params,
    main: typeof main === 'undefined' ? null : main };`);
  const out = factory();
  if (typeof out.main !== 'function') throw new Error('The recipe needs a function called main(r, p) that returns the part.');
  return out;
}

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The recipe's sizes as a list the window shows as dials. */
export function paramSpecs(raw) {
  const specs = [];
  for (const [name, def] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!safeParamName(name) || specs.length >= MAX_PARAMS) continue;
    const d = def && typeof def === 'object' && !Array.isArray(def) ? def : { value: def };
    const label = typeof d.label === 'string' ? d.label.slice(0, 40) : name;
    if (typeof d.value === 'boolean') { specs.push({ name, label, kind: 'toggle', value: d.value }); continue; }
    if (Array.isArray(d.options) && d.options.length) {
      const options = d.options.map(String).slice(0, 20);
      specs.push({ name, label, kind: 'choice', options, value: options.includes(String(d.value)) ? String(d.value) : options[0] });
      continue;
    }
    if (typeof d.value !== 'number' || !Number.isFinite(d.value)) continue;
    const min = num(d.min, Math.min(0, d.value));
    const max = Math.max(min, num(d.max, Math.max(d.value * 4, d.value + 10)));
    const step = num(d.step, Number.isInteger(d.value) && Number.isInteger(min) ? 1 : 0.1);
    specs.push({ name, label, kind: 'number', value: d.value, min, max, step, unit: typeof d.unit === 'string' ? d.unit.slice(0, 8) : 'mm' });
  }
  return specs;
}

/** The sizes the build uses: the board's changes, kept inside each dial's range. */
export function paramValues(specs, overrides = {}) {
  const out = {};
  for (const s of specs) {
    const v = overrides[s.name];
    if (s.kind === 'toggle') out[s.name] = typeof v === 'boolean' ? v : s.value;
    else if (s.kind === 'choice') out[s.name] = s.options.includes(String(v)) ? String(v) : s.value;
    else out[s.name] = typeof v === 'number' && Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.value;
  }
  return out;
}

const isShape = (x) => Boolean(x && typeof x === 'object' && typeof x.mesh === 'function');

/** Whatever main returned, as named, coloured bodies. */
export function bodiesOf(result) {
  const list = Array.isArray(result) ? result : [result];
  const bodies = [];
  list.forEach((item, i) => {
    const shape = isShape(item) ? item : item?.shape;
    if (!isShape(shape)) return;
    const name = typeof item?.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 60) : (list.length > 1 ? `Body ${i + 1}` : 'Part');
    const color = typeof item?.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : PALETTE[i % PALETTE.length];
    bodies.push({ name, color, shape });
  });
  if (!bodies.length) throw new Error('main(r, p) returned nothing to show. Return a solid, e.g. a sketch that was extruded.');
  return bodies;
}

/** Turn a kernel (OpenCascade) failure into words. */
export function errorText(err, oc) {
  if (err instanceof Error) return err.message;
  try {
    const [type, message] = oc?.getExceptionMessage?.(err) || [];
    if (type || message) return `The CAD kernel refused a step (${[type, message].filter(Boolean).join(': ')}). A fillet or chamfer bigger than its edge is the usual cause.`;
  } catch { /* not a kernel error */ }
  return `The CAD kernel refused a step. A fillet or chamfer bigger than its edge, or a cut that misses the part, is the usual cause.`;
}

/** Run a recipe: its dials, the values used, and the bodies it made. */
export function runRecipe(r, code, overrides = {}) {
  const { params, main } = compileRecipe(code);
  const specs = paramSpecs(params);
  const values = paramValues(specs, overrides);
  const bodies = bodiesOf(main(r, { ...values }));
  return { specs, values, bodies };
}

function bounds(bodies) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) {
    const [a, z] = b.shape.boundingBox.bounds;
    for (let i = 0; i < 3; i += 1) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], z[i]); }
  }
  return lo.every(Number.isFinite) ? [lo, hi] : [[0, 0, 0], [0, 0, 0]];
}

/** Triangles and edge lines for the 3D view, plus size and volume. */
export function meshBodies(r, bodies) {
  let volume = 0;
  const meshes = bodies.map((b) => {
    const m = b.shape.mesh(MESH_TOLERANCE);
    const e = b.shape.meshEdges(MESH_TOLERANCE);
    try { volume += r.measureVolume(b.shape) || 0; } catch { /* open shells have no volume */ }
    return {
      name: b.name,
      color: b.color,
      vertices: Float32Array.from(m.vertices),
      normals: Float32Array.from(m.normals),
      triangles: Uint32Array.from(m.triangles),
      edges: Float32Array.from(e.lines),
    };
  });
  const box = bounds(bodies);
  return { meshes, bounds: box, size: box[1].map((v, i) => v - box[0][i]), volume };
}

/** The part as a file: binary STL (for 3D printers) or STEP (for CAD and machine shops). */
export async function exportBodies(r, bodies, format) {
  let blob;
  if (format === 'step') {
    blob = r.exportSTEP(bodies.map((b) => ({ shape: b.shape, name: b.name, color: b.color })));
  } else if (format === 'stl') {
    const one = bodies.length === 1 ? bodies[0].shape : r.makeCompound(bodies.map((b) => b.shape));
    blob = one.blobSTL({ binary: true, ...MESH_TOLERANCE });
  } else {
    throw new Error(`Unknown format: ${format}`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}
