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

/**
 * Put the stage in the pose an STL file uses (true size, Z up) and call `fn`
 * with that group. The view is put back before this returns. Synchronous, so
 * a print check can read the same triangles the file will hold.
 */
export function poseForStl(stage, fn) {
  const root = stage?.models;
  if (!root) throw new Error('The 3D view is not ready yet.');
  const before = { shading: stage.view.shading, arrange: stage.view.arrange };
  const own = { shading: 'solid', arrange: before.arrange === 'same' ? 'side' : before.arrange };
  const changed = own.shading !== before.shading || own.arrange !== before.arrange;
  if (changed) stage.setView(own);
  const hidden = root.children.filter((h) => !h.visible);
  for (const h of hidden) root.remove(h);
  const turn = root.rotation.x;
  root.rotation.x = Math.PI / 2;
  root.updateMatrixWorld(true);
  try {
    if (!root.children.length) throw new Error('Nothing to save: open or show a model first.');
    return fn(root);
  } finally {
    root.rotation.x = turn;
    root.updateMatrixWorld(true);
    for (const h of hidden) root.add(h);
    if (changed) stage.setView(before);
    stage.dirty = true;
  }
}

export function exportStl(stage) {
  return poseForStl(stage, (root) => {
    const view = new STLExporter().parse(root, { binary: true });
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  });
}
