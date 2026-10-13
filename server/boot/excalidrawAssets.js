// YorWare Diagrams draws with Excalidraw, which loads its hand-drawn fonts at
// runtime. They are served from censaiOS at /vendor/excalidraw/fonts/ (from
// node_modules in dev, copied into dist on build) so drawing never depends on
// someone else's server. The 13 MB Chinese font (Xiaolai) is left out; for
// that one Excalidraw falls back to esm.sh.
import fs from 'fs';
import path from 'path';

export const EXCALIDRAW_PREFIX = '/vendor/excalidraw/';
const SKIP = new Set(['Xiaolai']);

export function excalidrawFontsDir(root) {
  return path.join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
}

/** The font file on disk for a /vendor/excalidraw/fonts/... URL, or null. */
export function resolveExcalidrawAsset(root, urlPath) {
  const clean = decodeURIComponent(String(urlPath || '').split('?')[0]);
  const marker = `${EXCALIDRAW_PREFIX}fonts/`;
  if (!clean.startsWith(marker)) return null;
  const dir = excalidrawFontsDir(root);
  const file = path.resolve(dir, clean.slice(marker.length));
  if (!file.startsWith(dir + path.sep) || SKIP.has(path.relative(dir, file).split(path.sep)[0])) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

/** Copy the fonts into a built app (dist/vendor/excalidraw/fonts). */
export function copyExcalidrawAssets(root, outDir) {
  const dir = excalidrawFontsDir(root);
  if (!fs.existsSync(dir)) return null;
  const target = path.join(outDir, 'vendor', 'excalidraw', 'fonts');
  for (const name of fs.readdirSync(dir)) {
    if (!SKIP.has(name)) fs.cpSync(path.join(dir, name), path.join(target, name), { recursive: true });
  }
  return target;
}
