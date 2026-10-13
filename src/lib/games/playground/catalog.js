// Game playground: the bundled samples, what the window remembers about the
// game it shows, and how each source becomes a runner plan.

import { ENGINES, classifyFiles, scenePage, threeImportMap } from './classify.js';
import { buildWebPlan, normalizePath, rerootFiles } from './virtualSite.js';

export const SAMPLE_BASE = '/playground/samples/';

// One sample per engine that can ship in the app. Godot needs its export
// templates to make a build, so it has no sample; bring your own export.
export const SAMPLES = Object.freeze([
  {
    id: 'love-breakout', engine: 'love', title: 'Breakout',
    blurb: 'Paddle, ball and bricks, written in Lua for LÖVE.',
    keys: 'Arrows or A D, or the mouse. Space launches.',
    files: ['main.lua', 'conf.lua'],
  },
  {
    id: 'three-marble', engine: 'three', title: 'Marble',
    blurb: 'Roll a marble across a floating board. Three.js and WebGL.',
    keys: 'Arrows or WASD. Space plays again.',
    files: ['index.html', 'main.js'],
    entry: 'index.html',
  },
]);

export function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) || null;
}

export function engineLabel(id) {
  return ENGINES[id]?.label || ENGINES.web.label;
}

const MAX_TITLE = 80;
const clip = (s, n = MAX_TITLE) => String(s || '').trim().slice(0, n);

/**
 * What the shared window record keeps (win.playground). Samples and links
 * are shared, so everyone with the window open runs the same game; files
 * from someone's computer stay on their computer, so only the name travels.
 */
export function sanitizeRecord(value) {
  if (!value || typeof value !== 'object') return null;
  const source = value.source || {};
  const engine = ENGINES[value.engine] ? value.engine : 'web';
  const by = clip(value.by, 60) || undefined;
  const at = Number.isFinite(value.at) ? value.at : undefined;
  if (source.type === 'sample' && sampleById(source.id)) {
    return { engine: sampleById(source.id).engine, source: { type: 'sample', id: source.id }, title: sampleById(source.id).title, by, at };
  }
  if (source.type === 'url' && /^https?:\/\//i.test(String(source.url || ''))) {
    return { engine, source: { type: 'url', url: String(source.url).slice(0, 2048) }, title: clip(value.title) || 'Game', by, at };
  }
  if (source.type === 'local') {
    return { engine, source: { type: 'local', name: clip(source.name) || 'Game' }, title: clip(value.title || source.name) || 'Game', by, at };
  }
  return null;
}

/** Theme colors for a LÖVE game: a Lua module returning 0-1 RGB triples. */
export function themeLua(theme) {
  const triple = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '{0.5, 0.5, 0.5}';
    const n = parseInt(m[1], 16);
    return `{${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(', ')}}`;
  };
  const keys = ['bg', 'ink', 'soft', 'faint', 'accent'];
  return `return { ${keys.map((k) => `${k} = ${triple(theme?.[k])}`).join(', ')} }\n`;
}

/**
 * The runner plan for a set of files that classifyFiles() understood.
 * `list` is [{ path, data: Uint8Array | string }].
 */
export function planFromFiles(list, info, { origin = '', theme = null, decode } = {}) {
  if (info.mode === 'love-file') {
    const file = list.find((f) => normalizePath(f.path) === info.entry) || list[0];
    return { kind: 'love', files: [{ path: 'game.love', data: file.data }], args: ['./game.love'], theme };
  }
  if (info.mode === 'love-files') {
    const files = rerootFiles(list.map((f) => ({ ...f, path: normalizePath(f.path) })), info.root);
    if (theme && !files.some((f) => f.path === 'theme.lua')) files.push({ path: 'theme.lua', data: themeLua(theme) });
    return { kind: 'love', files, args: ['./'], theme };
  }
  if (info.mode === 'scene') {
    const script = list[0];
    const name = normalizePath(script.path).split('/').pop();
    const files = [{ path: name, data: script.data }, { path: 'index.html', data: scenePage(`./${name}`) }];
    return buildWebPlan(files, 'index.html', { decode, importMap: threeImportMap(origin), theme });
  }
  if (info.mode === 'web') {
    const files = rerootFiles(list.map((f) => ({ ...f, path: normalizePath(f.path) })), info.root);
    const entryText = files.find((f) => f.path === info.entry);
    const text = typeof entryText?.data === 'string' ? entryText.data : (decode || ((b) => new TextDecoder().decode(b)))(entryText?.data || new Uint8Array());
    // Pages without an import map get one for Three.js, so scenes that
    // `import 'three'` work without a CDN.
    const importMap = /type\s*=\s*["']importmap["']/i.test(text) ? null : threeImportMap(origin);
    return buildWebPlan(files, info.entry, { decode, importMap, theme });
  }
  throw new Error(`Can't build a plan for ${info.mode}`);
}

/** Plan for a bundled sample; `fetchText(url)` reads one of its files. */
export async function planFromSample(sample, { fetchText, origin = '', theme = null }) {
  const list = await Promise.all(sample.files.map(async (name) => ({ path: name, data: await fetchText(`${SAMPLE_BASE}${sample.id}/${name}`) })));
  const info = classifyFiles(list);
  return planFromFiles(list, info, { origin, theme });
}
