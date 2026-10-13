// How a 3D Editor scene is kept on the board: the editor's own project JSON,
// gzipped and stored as base64 text in the module's storage under `scene`.
// Scene JSON (numbers in long lists) packs to a fraction of its size, which
// matters because a module's storage is 256 KB in all. Pure; runs in the
// sandbox and in tests (Node has CompressionStream too).

export const SCENE_KEY = 'scene';
export const PACK_VERSION = 1;
// Leaves room in the 256 KB module storage for the record around it.
export const MAX_PACKED_BYTES = 240 * 1024;

function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function fromBase64(text) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/**
 * What two copies of a scene are compared by: everything but where each
 * person's own camera is looking, and the undo list, which stays per person.
 */
export function sceneContent(json) {
  if (!json || typeof json !== 'object') return '';
  const { camera: _camera, controls: _controls, history: _history, ...rest } = json;
  return JSON.stringify(rest);
}

/** The editor's project JSON -> the board record ({ v, z, bytes }). */
export async function packScene(json) {
  const { history: _history, ...kept } = json || {};
  const text = JSON.stringify(kept);
  const zipped = await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
  const z = toBase64(zipped);
  return { v: PACK_VERSION, z, bytes: z.length, raw: text.length };
}

/** The board record -> the editor's project JSON, or null when there is none. */
export async function unpackScene(record) {
  if (!record || typeof record !== 'object' || typeof record.z !== 'string' || !record.z) return null;
  const bytes = await pipe(fromBase64(record.z), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** True when a packed scene fits in the module's storage. */
export function fitsOnBoard(record) {
  return Boolean(record) && record.bytes <= MAX_PACKED_BYTES;
}
