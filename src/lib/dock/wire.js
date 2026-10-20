// Dock app windows: the pure parts, shared by the window, its tests and the
// collaboration server. No DOM, no Tauri, no React.
//
// A dock app window reserves a slot on the canvas; on the desktop app (Windows)
// the shell keeps a real application window sized and placed over that slot
// (src-tauri/src/app_dock.rs). Teammates never get the real window: the host
// sends small JPEG pictures of the slot over the collaboration socket.
//
//   dock.cast  host -> members   { windowId, frame | null, width, height }

export const CAST_TYPE = 'dock.cast';
// The collaboration socket refuses messages over 16 KB; leave room for the
// envelope. The host shrinks pictures until they fit (see castFrame.js).
export const MAX_FRAME_CHARS = 14_000;
export const CAST_EVERY_MS = 500;
// A viewer calls the cast paused when no picture arrived for this long.
export const CAST_STALE_MS = 3_000;
// Below this size (CSS pixels) the slot is too small for a real app, whose
// own minimum size would spill past the slot, so the app is tucked away.
export const MIN_SLOT = Object.freeze({ width: 240, height: 160 });

const FRAME_PREFIX = 'data:image/jpeg;base64,';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const WINDOW_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** The slot id the shell knows a canvas window by. */
export function dockSlotId(windowId) {
  return String(windowId || 'default').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

/** A DOMRect-like box in whole CSS pixels. */
export function slotBox(rect) {
  return {
    x: Math.round(rect?.left ?? rect?.x ?? 0),
    y: Math.round(rect?.top ?? rect?.y ?? 0),
    width: Math.round(rect?.width ?? 0),
    height: Math.round(rect?.height ?? 0),
  };
}

/** Whether the real app should sit in the slot right now. */
export function slotUsable(box, clear) {
  return Boolean(clear) && box.width >= MIN_SLOT.width && box.height >= MIN_SLOT.height;
}

export function slotKey(box, visible) {
  return `${box.x},${box.y},${box.width},${box.height},${visible ? 1 : 0}`;
}

// Friendly names for apps people dock most. Anything else uses its title.
const KNOWN_APPS = Object.freeze({
  'leagueclientux.exe': 'League client',
  'league of legends.exe': 'League of Legends',
  'riotclientux.exe': 'Riot Client',
  'discord.exe': 'Discord',
  'spotify.exe': 'Spotify',
  'windowsterminal.exe': 'Terminal',
  'code.exe': 'VS Code',
  'obs64.exe': 'OBS',
  'steam.exe': 'Steam',
});

/** The name teammates see: "Alma is docking <this>". */
export function appName({ title = '', process = '' } = {}) {
  const known = KNOWN_APPS[String(process).toLowerCase()];
  if (known) return known;
  const clean = String(title).replace(/\s+/g, ' ').trim();
  if (clean) return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean;
  return String(process).replace(/\.exe$/i, '') || 'an app';
}

/** "Alma is docking Discord", or "You are docking Discord". */
export function presenceLine(dock, { self = false } = {}) {
  if (!dock?.app) return '';
  const who = self ? 'You are' : `${dock.hostName || 'Someone'} is`;
  return dock.target ? `${who} docking ${dock.app}` : `${self ? 'You' : dock.hostName || 'Someone'} docked ${dock.app} here`;
}

/** Picker rows: drop junk, sort by name, filter by a query. */
export function pickerRows(candidates, query = '') {
  const q = String(query).trim().toLowerCase();
  return (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && typeof c.id === 'string' && /^\d+$/.test(c.id) && String(c.title || '').trim())
    .map((c) => ({ id: c.id, title: String(c.title).trim(), process: String(c.process || ''), icon: c.icon || null, name: appName(c) }))
    .filter((c) => !q || `${c.title} ${c.process} ${c.name}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name) || a.title.localeCompare(b.title));
}

/** Splits the shell's capture bytes: 8 header bytes, then BGRA rows. */
export function readCapture(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  if (!width || !height || bytes.length !== 8 + width * height * 4) return null;
  return { width, height, bgra: bytes.subarray(8) };
}

/** BGRA (what Windows hands out) to opaque RGBA (what ImageData wants). */
export function bgraToRgba(bgra) {
  const out = new Uint8ClampedArray(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    out[i] = bgra[i + 2];
    out[i + 1] = bgra[i + 1];
    out[i + 2] = bgra[i];
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Same, but keeps alpha (window icons have transparent corners). Old icons
 * drawn by GDI come back with alpha 0 everywhere; those stay opaque.
 */
export function bgraToRgbaKeepAlpha(bgra) {
  const out = bgraToRgba(bgra);
  let anyAlpha = false;
  for (let i = 3; i < bgra.length; i += 4) if (bgra[i]) { anyAlpha = true; break; }
  if (!anyAlpha) return out;
  for (let i = 3; i < bgra.length; i += 4) out[i] = bgra[i];
  return out;
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min) return null;
  return Math.min(Math.max(n, min), max);
}

/**
 * Validates a dock.cast message. Returns the clean fields or null. A null
 * frame means the host stopped casting.
 */
export function normalizeCast(message) {
  if (message?.type !== CAST_TYPE) return null;
  const windowId = String(message.windowId ?? '');
  if (!WINDOW_ID.test(windowId)) return null;
  if (message.frame === null || message.frame === undefined) return { windowId, frame: null, width: 0, height: 0 };
  const frame = message.frame;
  if (typeof frame !== 'string' || frame.length > MAX_FRAME_CHARS || !frame.startsWith(FRAME_PREFIX)) return null;
  if (!BASE64.test(frame.slice(FRAME_PREFIX.length))) return null;
  const width = clampInt(message.width, 1, 4096);
  const height = clampInt(message.height, 1, 4096);
  if (!width || !height) return null;
  return { windowId, frame, width, height };
}
