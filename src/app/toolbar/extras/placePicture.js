// A picture picked from the dock, opened as the same Image window a drop uses.
import { screenToCanvas } from '../../../lib/canvasMath.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { pictureFromFile, titleFor, windowSizeFor } from '../../../lib/canvasImages.js';

const STACK = 32;

function boardCentre(root, pan, zoom, toCanvas) {
  if (!root?.getBoundingClientRect) return null;
  const rect = root.getBoundingClientRect();
  return toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2, pan.x, pan.y, zoom, rect);
}

/**
 * Open each image file as a window at the middle of the board.
 * `deps` is for tests; the dock calls this with the file list alone.
 * Returns how many pictures were placed.
 */
export async function placePictures(fileList, deps = {}) {
  const files = [...(fileList || [])].filter((file) => String(file?.type || '').startsWith('image/'));
  if (!files.length) return 0;
  const read = deps.pictureFromFile || pictureFromFile;
  const nameOf = deps.titleFor || titleFor;
  const sizeFor = deps.windowSizeFor || windowSizeFor;
  const toCanvas = deps.screenToCanvas || screenToCanvas;
  const log = deps.log || logToApp;
  const state = deps.store || useWorkspaceStore.getState();
  const spawn = deps.spawnAt || state.spawnAt;
  const pan = deps.pan || state.pan || { x: 0, y: 0 };
  const zoom = deps.zoom ?? state.zoom ?? 1;
  const root = deps.root !== undefined
    ? deps.root
    : (typeof document !== 'undefined' ? document.querySelector('[data-canvas-bg]') : null);
  const centre = boardCentre(root, pan, zoom, toCanvas);

  const ready = [];
  for (const file of files) {
    try {
      const pic = await read(file);
      if (pic) ready.push({ ...pic, title: nameOf(file) });
      else log('warn', 'Board: a picture from the dock was too big to keep', { where: 'canvas' });
    } catch {
      log('warn', 'Board: could not open a picture from the dock', { where: 'canvas' });
    }
  }

  ready.forEach((pic, i) => {
    const size = sizeFor(pic.width, pic.height);
    const pos = centre
      ? { x: Math.round(centre.x - size.w / 2 + i * STACK), y: Math.round(centre.y - size.h / 2 + i * STACK) }
      : null;
    spawn('image', { title: pic.title, src: pic.src, origin: 'file' }, pos, size);
  });
  return ready.length;
}
