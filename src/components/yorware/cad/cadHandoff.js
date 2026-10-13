// Hand a CAD part to the YorWare 3D Viewer: the part goes in as an STL, so
// teammates can turn it, measure it and pin notes on it next to the CAD
// window. The viewer gets a copy; changing the part later doesn't change it.
import { useWorkspaceStore } from '../../../lib/store.js';
import { bytesToBase64 } from '../../../lib/yorware/pdfBytes.js';
import { addModelsPatch, makeModelScene, readScene, MAX_MODEL_BYTES } from '../../../lib/yorware/modelBoard.js';
import { fileName } from '../../../lib/office/officeFiles.js';

export function openInViewer(win, bytes) {
  if (bytes.length > MAX_MODEL_BYTES) throw new Error('This part is too detailed to share as a 3D model (over 10 MB).');
  const name = fileName(win.title || 'Part', 'stl');
  const start = makeModelScene();
  const { patch } = addModelsPatch(readScene(start), [{ name, format: 'stl', main: name, files: { [name]: bytesToBase64(bytes) }, bytes: bytes.length }]);
  const beside = Number.isFinite(win.x) ? { x: win.x + (win.w || win.width || 1120) + 24, y: win.y || 0 } : null;
  return useWorkspaceStore.getState().spawnAt('yor3d', { title: win.title || '3D Viewer', ...start, ...patch }, beside);
}
