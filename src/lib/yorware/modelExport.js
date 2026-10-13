// Files out of the 3D Viewer: everything you can see as one .glb (opens in
// Blender, Windows 3D Viewer, web apps) or one .stl for a 3D printer (Z up,
// as slicers expect). Uses the exporters that ship with three.js (MIT).
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

/**
 * Run `fn` with the stage showing the models' own colors, at their true
 * size ("Same size" is only for looking), and only what's visible.
 */
async function withOwnLook(stage, fn) {
  const before = { shading: stage.view.shading, arrange: stage.view.arrange };
  const own = { shading: 'solid', arrange: before.arrange === 'same' ? 'side' : before.arrange };
  const changed = own.shading !== before.shading || own.arrange !== before.arrange;
  if (changed) stage.setView(own);
  const hidden = stage.models.children.filter((h) => !h.visible);
  for (const h of hidden) stage.models.remove(h);
  try {
    return await fn(stage.models);
  } finally {
    for (const h of hidden) stage.models.add(h);
    if (changed) stage.setView(before);
  }
}

export function exportGlb(stage) {
  return withOwnLook(stage, (root) => new Promise((resolve, reject) => {
    if (!root.children.length) { reject(new Error('Nothing to save: open or show a model first.')); return; }
    new GLTFExporter().parse(root, (out) => resolve(new Uint8Array(out)), (err) => reject(err), { binary: true, onlyVisible: true });
  }));
}

export function exportStl(stage) {
  return withOwnLook(stage, (root) => {
    if (!root.children.length) throw new Error('Nothing to save: open or show a model first.');
    const turn = root.rotation.x;
    root.rotation.x = Math.PI / 2;
    root.updateMatrixWorld(true);
    try {
      const view = new STLExporter().parse(root, { binary: true });
      return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    } finally {
      root.rotation.x = turn;
      root.updateMatrixWorld(true);
      stage.dirty = true;
    }
  });
}
