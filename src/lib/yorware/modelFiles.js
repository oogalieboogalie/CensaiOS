// Which 3D files the viewer opens, and how a handful of dropped files
// become models: a .glb or .stl is a model on its own; an .obj takes the
// .mtl and pictures dropped with it, a .gltf its .bin and pictures.
import { bytesToBase64 } from './pdfBytes.js';

/** [extension, plain name] for every model format the viewer opens. */
export const MODEL_FORMATS = Object.freeze([
  ['glb', 'glTF binary'], ['gltf', 'glTF'], ['stl', 'STL (3D printing)'], ['obj', 'OBJ'], ['fbx', 'FBX'],
  ['3mf', '3MF (3D printing)'], ['ply', 'PLY (scans)'], ['dae', 'Collada'], ['3ds', '3DS'], ['wrl', 'VRML'],
  ['amf', 'AMF'],
]);
const MAIN = new Set(MODEL_FORMATS.map(([ext]) => ext));
const HELPERS = new Set(['mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga', 'ktx2']);
export const MODEL_ACCEPT = [...MAIN, ...HELPERS].map((e) => `.${e}`).join(',');

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}
export const isModelName = (name) => MAIN.has(extOf(name));
const baseName = (name) => String(name || '').split(/[\\/]/).pop();
const stem = (name) => baseName(name).replace(/\.[a-z0-9]+$/i, '');

/**
 * Group dropped files into models. `files` are { name, size } (File objects
 * work). Returns { models: [{ main, format, helpers: [file…] }], skipped:
 * [name…] }. Helper files go to every .obj or .gltf that came with them,
 * since a texture can be shared; a lone helper is skipped.
 */
export function groupModelFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  const mains = list.filter((f) => isModelName(f.name));
  const helpers = list.filter((f) => HELPERS.has(extOf(f.name)));
  const skipped = list.filter((f) => !isModelName(f.name) && !HELPERS.has(extOf(f.name))).map((f) => baseName(f.name));
  const models = mains.map((f) => {
    const format = extOf(f.name);
    const takes = format === 'obj' || format === 'gltf' || format === 'fbx' || format === 'dae';
    return { main: f, format, helpers: takes ? helpers : [] };
  });
  if (!models.some((m) => m.helpers.length)) skipped.push(...helpers.map((f) => baseName(f.name)));
  return { models, skipped };
}

/** A friendly name for a model: the file name without its extension. */
export const modelTitle = (name) => stem(name) || 'Model';

/** Read one grouped model into the board's shape: { name, format, main, files, bytes }. */
export async function readModel({ main, format, helpers }) {
  const files = {};
  let bytes = 0;
  for (const f of [main, ...helpers]) {
    const buf = new Uint8Array(await f.arrayBuffer());
    files[baseName(f.name)] = bytesToBase64(buf);
    bytes += buf.length;
  }
  return { name: modelTitle(main.name), format, main: baseName(main.name), files, bytes };
}

/** "2.4 MB" style sizes. */
export function formatBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
