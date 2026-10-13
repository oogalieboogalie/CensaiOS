// Game playground: work out what someone dropped on the window and how to
// run it. Pure, so Jest covers every case.
//
//   .love file                       → LÖVE
//   folder or .zip with main.lua     → LÖVE (files written into its file system)
//   folder or .zip with a web page   → web build (Godot when it carries a .pck)
//   a single .js module              → Three.js scene (wrapped in a page)
//   a single .html page              → web build
//   link to .love / .zip             → fetched, then as above
//   any other link                   → the page itself, in a sandboxed frame

import { extOf, normalizePath, shallowest } from './virtualSite.js';

export const ENGINES = Object.freeze({
  love: { id: 'love', label: 'LÖVE' },
  three: { id: 'three', label: 'Three.js' },
  godot: { id: 'godot', label: 'Godot' },
  web: { id: 'web', label: 'Web build' },
});

/** Strip one shared top folder ("MyGame/...") the way a zip or folder pick adds it. */
export function commonRoot(paths) {
  const firsts = new Set(paths.map((p) => (p.includes('/') ? p.split('/')[0] : '')));
  if (firsts.size !== 1) return '';
  const [only] = firsts;
  return only ? `${only}/` : '';
}

function isJunk(path) {
  return /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|\.git)(\/|$)/.test(path);
}

function parentDir(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

/**
 * Decide how to run a set of files ([{ path, data }], paths relative to what
 * was picked). Returns { engine, mode, root, entry, note } or { error }.
 *   mode 'love-file'   one .love archive
 *   mode 'love-files'  loose LÖVE files (root holds main.lua)
 *   mode 'web'         a page plus its files (root holds the entry page)
 *   mode 'scene'       one JavaScript module for Three.js
 *   mode 'zip'         unzip first, then classify again
 */
export function classifyFiles(list, { readText } = {}) {
  const files = (list || []).map((f) => ({ ...f, path: normalizePath(f.path) })).filter((f) => f.path && !isJunk(f.path));
  if (!files.length) return { error: 'Nothing to play in what you picked.' };
  const paths = files.map((f) => f.path);

  if (files.length === 1) {
    const [only] = files;
    const ext = extOf(only.path);
    if (ext === 'love') return { engine: 'love', mode: 'love-file', root: '', entry: only.path };
    if (ext === 'zip') return { engine: 'web', mode: 'zip', root: '', entry: only.path };
    if (ext === 'js' || ext === 'mjs') return { engine: 'three', mode: 'scene', root: '', entry: only.path };
    if (ext === 'html' || ext === 'htm') return { engine: 'web', mode: 'web', root: '', entry: only.path };
  }

  const mainLua = shallowest(paths, (p) => /(^|\/)main\.lua$/i.test(p));
  const page = shallowest(paths, (p) => /(^|\/)index\.html?$/i.test(p)) || shallowest(paths, (p) => /\.html?$/i.test(p));
  const pageDepth = page ? page.split('/').length : Infinity;
  const luaDepth = mainLua ? mainLua.split('/').length : Infinity;

  if (mainLua && luaDepth <= pageDepth) {
    return { engine: 'love', mode: 'love-files', root: parentDir(mainLua), entry: 'main.lua' };
  }
  if (page) {
    const root = parentDir(page);
    const inRoot = paths.filter((p) => p.startsWith(root));
    const godot = inRoot.some((p) => /\.pck$/i.test(p))
      || (readText ? /GODOT_CONFIG|new Engine\(/.test(readText(page) || '') : false);
    const threads = godot && readText ? godotNeedsThreads(readText(page) || '', inRoot) : false;
    return {
      engine: godot ? 'godot' : 'web',
      mode: 'web',
      root,
      entry: page.slice(root.length),
      note: threads ? THREADS_NOTE : undefined,
    };
  }
  const love = shallowest(paths, (p) => /\.love$/i.test(p));
  if (love) return { engine: 'love', mode: 'love-file', root: '', entry: love };
  return { error: 'No game found. Pick a .love file, a game folder, an HTML5 export or a .zip of one.' };
}

export const THREADS_NOTE = 'This Godot export was made with Thread Support on. Inside a canvas window it can only run when exported with Thread Support off (Project > Export > Web).';

/** True when a Godot web export needs SharedArrayBuffer (threads). */
export function godotNeedsThreads(html, paths = []) {
  if (/GODOT_THREADS_ENABLED\s*=\s*true/.test(html)) return true;
  if (/GODOT_THREADS_ENABLED\s*=\s*false/.test(html)) return false;
  // Godot 3 and 4.0 to 4.2 always shipped a worker for threaded builds.
  return paths.some((p) => /\.worker\.js$/i.test(p));
}

/** How to treat a pasted link. */
export function classifyUrl(input) {
  const raw = String(input || '').trim();
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`); } catch { return { error: 'That link does not look right.' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'Only http and https links can be played.' };
  const ext = extOf(url.pathname);
  const name = decodeURIComponent(url.pathname.split('/').pop() || url.hostname);
  if (ext === 'love') return { engine: 'love', mode: 'fetch-love', url: url.href, name };
  if (ext === 'zip') return { engine: 'web', mode: 'fetch-zip', url: url.href, name };
  if (ext === 'js' || ext === 'mjs') return { engine: 'three', mode: 'fetch-scene', url: url.href, name };
  return { engine: 'web', mode: 'frame', url: url.href, name: url.hostname };
}

/**
 * Sandbox flags for a hosted page. A page on another site keeps its own
 * origin (it may need its own storage); a page on our own origin never gets
 * allow-same-origin, or it could reach into the app.
 */
export function frameSandbox(url, appOrigin) {
  let origin = '';
  try { origin = new URL(url).origin; } catch { /* treated as foreign */ }
  const base = 'allow-scripts allow-pointer-lock allow-forms';
  return origin && origin !== appOrigin ? `${base} allow-same-origin` : base;
}

/** The page a lone Three.js module runs in. */
export function scenePage(scriptPath) {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;height:100%;overflow:hidden;background:var(--hb-bg,#111)}canvas{display:block}</style>',
    '</head><body>',
    `<script type="module" src="${scriptPath}"></script>`,
    '</body></html>',
  ].join('');
}

/** Import map pointing "three" and "three/addons/" at the copy the app ships. */
export function threeImportMap(origin) {
  const base = `${origin || ''}/playground/vendor/three/`;
  return {
    imports: {
      three: `${base}three.module.js`,
      'three/webgpu': `${base}three.webgpu.js`,
      'three/tsl': `${base}three.tsl.js`,
      'three/addons/': `${base}addons/`,
      'three/examples/jsm/': `${base}addons/`,
    },
  };
}
