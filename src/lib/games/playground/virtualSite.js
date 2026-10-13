// Game playground: turn a folder of files (a Godot export, a Three.js scene,
// an itch.io download, a LÖVE game) into the plan the sandboxed runner
// (public/playground/runner.js) plays from memory.
//
// The runner has an opaque origin and can't reach the files on disk, so every
// relative reference in a text file (script src, link href, import specifier,
// CSS url()) is swapped for a token __HBVFS[<path>]__ naming the file it
// points at. The runner turns files into blob URLs and fills the tokens in.
// Requests made at run time (fetch, XHR, Worker, audio worklets) go through
// the runner's shims instead. Pure functions: Jest covers all of it.

export const TOKEN_PREFIX = '__HBVFS[';
export const TOKEN_SUFFIX = ']__';

const MIME = {
  html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript',
  css: 'text/css', json: 'application/json', wasm: 'application/wasm', pck: 'application/octet-stream',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ico: 'image/x-icon', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4',
  webm: 'video/webm', glb: 'model/gltf-binary', gltf: 'model/gltf+json', txt: 'text/plain', xml: 'text/xml',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', lua: 'text/plain',
};
const TEXT_KINDS = new Set(['html', 'htm', 'js', 'mjs', 'css']);

export function extOf(path) {
  const m = /\.([a-z0-9]+)$/i.exec(String(path || ''));
  return m ? m[1].toLowerCase() : '';
}

export function mimeOf(path) {
  return MIME[extOf(path)] || 'application/octet-stream';
}

export function token(path) {
  return `${TOKEN_PREFIX}${encodeURIComponent(path)}${TOKEN_SUFFIX}`;
}

/** Forward slashes, no leading "./" or "/", no empty or "." segments; ".." pops. */
export function normalizePath(path) {
  const out = [];
  for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return out.join('/');
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

/** A reference written in `from` resolved to a file key, or null when it leaves the build. */
export function resolveRef(from, ref) {
  const raw = String(ref || '').trim();
  if (!raw || /^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(raw)) return null;
  const clean = raw.split('#')[0].split('?')[0];
  if (!clean) return null;
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep as written */ }
  return normalizePath(dirOf(from) + decoded);
}

function swap(text, re, group, from, known, deps) {
  return text.replace(re, (...m) => {
    const ref = m[group];
    const key = resolveRef(from, ref);
    if (key === null || !known.has(key) || key === from) return m[0];
    deps.add(key);
    // Every pattern is (before)(quote)(ref)quote(after?).
    const after = typeof m[4] === 'string' ? m[4] : '';
    return `${m[1]}${m[2]}${token(key)}${m[2]}${after}`;
  });
}

const HTML_ATTR = /(<(?:script|link|img|audio|video|source|track|embed|iframe|input)\b[^>]*?\s(?:src|href|poster)\s*=\s*)(["'])([^"']+)\2/gi;
const JS_STATIC = /(\b(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?)(["'])(\.{1,2}\/[^"'\n]+)\2/g;
const JS_DYNAMIC = /(\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"'\n]+)\2/g;
const JS_NEW_URL = /(\bnew\s+URL\s*\(\s*)(["'])(\.{0,2}\/?[^"'\n]+)\2(\s*,\s*import\.meta\.url)/g;
const CSS_URL = /(url\(\s*)(["']?)([^"')]+)\2(\s*\))/gi;
const IMPORT_MAP = /(<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>)([\s\S]*?)(<\/script>)/gi;

function rewriteImportMap(json, from, known, deps) {
  let map;
  try { map = JSON.parse(json); } catch { return json; }
  const fix = (table) => {
    if (!table || typeof table !== 'object') return;
    for (const [name, target] of Object.entries(table)) {
      if (typeof target !== 'string') continue;
      const key = resolveRef(from, target);
      if (key !== null && known.has(key)) { deps.add(key); table[name] = token(key); }
    }
  };
  fix(map.imports);
  if (map.scopes && typeof map.scopes === 'object') Object.values(map.scopes).forEach(fix);
  return JSON.stringify(map);
}

/**
 * Swap the references a text file makes to other files in the build for
 * tokens. Returns { text, deps } where deps lists the file keys it needs.
 */
export function rewriteText(path, text, known) {
  const deps = new Set();
  const kind = extOf(path);
  let out = String(text);
  if (kind === 'html' || kind === 'htm') {
    out = out.replace(IMPORT_MAP, (_, open, body, close) => open + rewriteImportMap(body, path, known, deps) + close);
    out = swap(out, HTML_ATTR, 3, path, known, deps);
    // Inline module scripts import relative to the page itself.
    out = out.replace(/(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, body, close) => (
      /type\s*=\s*["']importmap["']/i.test(open) ? m : open + swapScript(path, body, known, deps) + close
    ));
    out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, body, close) => open + swap(body, CSS_URL, 3, path, known, deps) + close);
  } else if (kind === 'js' || kind === 'mjs') {
    out = swapScript(path, out, known, deps);
  } else if (kind === 'css') {
    out = swap(out, CSS_URL, 3, path, known, deps);
  }
  return { text: out, deps: [...deps] };
}

function swapScript(path, text, known, deps) {
  let out = swap(text, JS_STATIC, 3, path, known, deps);
  out = swap(out, JS_DYNAMIC, 3, path, known, deps);
  out = swap(out, JS_NEW_URL, 3, path, known, deps);
  return out;
}

/** The shallowest file matching `test`, ties broken by name. */
export function shallowest(paths, test) {
  return paths.filter(test).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0] || null;
}

/**
 * Re-root a file list at `dir` (keeps only files inside it). A Godot export
 * zipped inside "MyGame/" asks for "index.wasm", not "MyGame/index.wasm".
 */
export function rerootFiles(list, dir) {
  if (!dir) return list;
  const prefix = dir.endsWith('/') ? dir : `${dir}/`;
  return list.filter((f) => f.path.startsWith(prefix)).map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
}

/**
 * Build the runner's web plan. `list` is [{ path, data: Uint8Array }];
 * `entry` is the page to open (already relative to the list's root).
 * `decode` turns bytes into text (TextDecoder in the browser).
 */
export function buildWebPlan(list, entry, { decode, importMap = null, theme = null } = {}) {
  const files = list.map((f) => ({ ...f, path: normalizePath(f.path) })).filter((f) => f.path);
  const known = new Set(files.map((f) => f.path));
  const toText = decode || ((bytes) => new TextDecoder().decode(bytes));
  const out = files.map((f) => {
    const kind = extOf(f.path);
    const base = { path: f.path, type: mimeOf(f.path) };
    if (!TEXT_KINDS.has(kind)) return { ...base, data: f.data };
    const source = typeof f.data === 'string' ? f.data : toText(f.data);
    const { text, deps } = rewriteText(f.path, source, known);
    return { ...base, text, deps };
  });
  return { kind: 'web', entry: normalizePath(entry), files: out, importMap, theme };
}
