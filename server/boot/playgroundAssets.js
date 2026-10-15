// Game playground route (/playground/). The runner page runs games inside an
// iframe with an opaque origin, so the runtimes it pulls in (love.js,
// Three.js) need CORS and cross-origin resource headers to load from there.
// COOP/COEP make the page cross-origin-isolation ready: a window inside the
// canvas only becomes isolated if the whole app is, but the runner never
// blocks it. `credentialless` keeps games that load assets from CDNs working.
import fs from 'fs';
import path from 'path';

export const PLAYGROUND_PREFIX = '/playground/';

export function setPlaygroundHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

/**
 * A read of a playground file. The runner frame has an opaque origin, so its
 * requests say `Origin: null`; these public files skip the app's CORS check
 * (they carry their own open headers above) or the game engine never loads.
 */
export function isPlaygroundRead(req) {
  const method = String(req.method || '').toUpperCase();
  return (method === 'GET' || method === 'HEAD') && String(req.path || req.url || '').startsWith(PLAYGROUND_PREFIX);
}

export function playgroundHeaders(req, res, next) {
  if (String(req.url || '').startsWith(PLAYGROUND_PREFIX)) setPlaygroundHeaders(res);
  next();
}

// Three.js is served straight from node_modules: the build and its addons.
// Keys are URL prefixes under /playground/vendor/three/.
export function threeVendorDirs(root) {
  const base = path.join(root, 'node_modules', 'three');
  return [
    { prefix: 'addons/', dir: path.join(base, 'examples', 'jsm') },
    { prefix: '', dir: path.join(base, 'build') },
  ];
}

/** The file on disk for a /playground/vendor/three/... URL, or null. */
export function resolveThreeVendor(root, urlPath) {
  const marker = `${PLAYGROUND_PREFIX}vendor/three/`;
  const clean = decodeURIComponent(String(urlPath || '').split('?')[0]);
  if (!clean.startsWith(marker)) return null;
  const rest = clean.slice(marker.length);
  for (const { prefix, dir } of threeVendorDirs(root)) {
    if (!rest.startsWith(prefix)) continue;
    const file = path.resolve(dir, rest.slice(prefix.length));
    if (!file.startsWith(dir + path.sep)) return null;
    return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
  }
  return null;
}

/** Copy the Three.js build and addons into a built app (dist/playground/vendor/three). */
export function copyThreeVendor(root, outDir) {
  const target = path.join(outDir, 'playground', 'vendor', 'three');
  for (const { prefix, dir } of threeVendorDirs(root)) {
    if (!fs.existsSync(dir)) continue;
    fs.cpSync(dir, path.join(target, prefix), { recursive: true, filter: (src) => !src.endsWith('.d.ts') });
  }
  return target;
}
