// Game playground: reading what someone picked or dropped, and the board
// colours handed to a game.
import { unzipSync } from 'fflate';
import { classifyFiles } from '../../../lib/games/playground/classify.js';

const THEME_TOKENS = { bg: '--surface-sunken', ink: '--ink', soft: '--ink-soft', faint: '--ink-faint', accent: '--accent' };

// Token colors can be oklch() or calc()-built; a 1x1 canvas turns any of
// them into the plain hex a Lua or WebGL game can use.
export function readTheme(host) {
  if (!host || typeof document === 'undefined') return null;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  host.appendChild(probe);
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const out = {};
  for (const [key, name] of Object.entries(THEME_TOKENS)) {
    probe.style.color = `var(${name})`;
    const color = getComputedStyle(probe).color;
    if (!ctx) { out[key] = color; continue; }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    out[key] = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  probe.remove();
  return out;
}

async function bytesOf(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function unzip(bytes) {
  const entries = unzipSync(bytes);
  return Object.entries(entries).filter(([path]) => !path.endsWith('/')).map(([path, data]) => ({ path, data }));
}

/** Read what was dropped or picked into [{ path, data }] (folders walked). */
export async function readPicked(fileList) {
  const files = await Promise.all([...fileList].map(async (file) => ({ path: file.webkitRelativePath || file.name, data: await bytesOf(file) })));
  return files;
}

async function walkEntry(entry, prefix = '') {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    return [{ path: prefix + file.name, data: await bytesOf(file) }];
  }
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const children = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((child) => walkEntry(child, `${prefix}${entry.name}/`)));
  return nested.flat();
}

export async function readDropped(dataTransfer) {
  const entries = [...(dataTransfer.items || [])].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) return (await Promise.all(entries.map((e) => walkEntry(e)))).flat();
  return readPicked(dataTransfer.files || []);
}

const decoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder();
export const decode = (bytes) => (typeof bytes === 'string' ? bytes : decoder.decode(bytes));

/** Classify, unzipping once when a .zip came in. */
export function understand(list) {
  const readText = (path) => {
    const f = list.find((x) => x.path.replace(/\\/g, '/').replace(/^\/+/, '') === path);
    return f ? decode(f.data) : '';
  };
  const info = classifyFiles(list, { readText });
  if (info.mode !== 'zip') return { list, info };
  const inner = unzip(list[0].data);
  const innerText = (path) => { const f = inner.find((x) => x.path === path); return f ? decode(f.data) : ''; };
  return { list: inner, info: classifyFiles(inner, { readText: innerText }) };
}

