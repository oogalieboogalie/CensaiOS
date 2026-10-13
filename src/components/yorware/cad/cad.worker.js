// Builds YorWare CAD parts off the main thread. The OpenCascade kernel
// (replicad-opencascadejs, LGPL-2.1, shipped unchanged) loads once; after
// that the network and storage names are removed, so a recipe someone put
// on the board can compute shapes and nothing else. The window ends this
// worker if a build runs too long.
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import * as replicad from 'replicad';
import { compileRecipe, paramSpecs, paramValues, bodiesOf, meshBodies, exportBodies, errorText } from '../../../lib/yorware/cadRun.js';

const BLOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker'];
function closeTheDoors() {
  for (let target = self; target; target = Object.getPrototypeOf(target)) {
    for (const name of BLOCKED) {
      try { if (Object.prototype.hasOwnProperty.call(target, name)) delete target[name]; } catch { /* not configurable */ }
      try { if (name in target) Object.defineProperty(target, name, { value: undefined, configurable: false }); } catch { /* read-only */ }
    }
  }
}

let kernel = null;
function ready() {
  kernel ||= opencascade({ locateFile: () => wasmUrl, print: () => {} }).then((oc) => {
    replicad.setOC(oc);
    closeTheDoors();
    return oc;
  });
  return kernel;
}

// The last part built, so Export doesn't build it again. Every CAD window
// shares this worker, so an export names the recipe it wants.
let last = null;
const keyOf = ({ code, overrides }) => JSON.stringify([code, overrides || {}]);

async function build({ code, overrides }) {
  const oc = await ready();
  let specs = [];
  try {
    const { params, main } = compileRecipe(code);
    specs = paramSpecs(params);
    const values = paramValues(specs, overrides || {});
    const bodies = bodiesOf(main(replicad, { ...values }));
    const mesh = meshBodies(replicad, bodies);
    last = { key: keyOf({ code, overrides }), bodies };
    return { ok: true, specs, values, ...mesh, bodies: bodies.map(({ name, color }) => ({ name, color })) };
  } catch (err) {
    return { ok: false, specs, values: paramValues(specs, overrides || {}), error: errorText(err, oc) };
  }
}

self.onmessage = async (event) => {
  const { id, type } = event.data || {};
  try {
    if (type === 'build') {
      const out = await build(event.data);
      const transfer = (out.meshes || []).flatMap((m) => [m.vertices.buffer, m.normals.buffer, m.triangles.buffer, m.edges.buffer]);
      self.postMessage({ id, ...out }, transfer);
    } else if (type === 'export') {
      if (last?.key !== keyOf(event.data)) {
        const out = await build(event.data);
        if (!out.ok) throw new Error(out.error);
      }
      const bytes = await exportBodies(replicad, last.bodies, event.data.format);
      self.postMessage({ id, ok: true, bytes }, [bytes.buffer]);
    } else if (type === 'warm') {
      await ready();
      self.postMessage({ id, ok: true });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: errorText(err, await kernel?.catch(() => null)) });
  }
};
