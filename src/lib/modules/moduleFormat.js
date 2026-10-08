// Spec 6: the on-demand module file format, shared by the generator service
// (server/modules/) and the module window. A module is one HTML fragment
// (markup + <style> + <script>) plus a small manifest. It never ships with
// the app: it lives in the canvas document and runs in a sandboxed iframe.

export const MODULE_FORMAT_VERSION = 1;
export const MAX_MODULE_SOURCE_BYTES = 200 * 1024;
export const MAX_MODULE_VERSIONS = 20;

// What a module may ask for. Everything else in the SDK (theme, storage,
// presence, toast, resize) is always on because it can't leave the canvas.
export const MODULE_PERMISSIONS = Object.freeze(['agent', 'network']);

export const MODULE_PERMISSION_LABELS = Object.freeze({
  agent: 'Ask your agents (uses your model key)',
  network: 'Use the internet',
});

// Icons a generated module may pick; names match Icons.jsx.
export const MODULE_ICONS = Object.freeze([
  'Toolbox', 'List', 'Calendar', 'Code', 'Files', 'Activity', 'Memory', 'Group',
  'Person', 'Play', 'Edit', 'Search', 'Tools', 'Music', 'Picture', 'Mail',
  'Server', 'Flask', 'Monitor', 'Check', 'History', 'ShoppingBag',
]);

const SIZE_LIMITS = Object.freeze({ minW: 280, maxW: 1200, minH: 220, maxH: 900 });
export const DEFAULT_MODULE_SIZE = Object.freeze({ w: 440, h: 520 });

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function clampModuleSize(size = {}) {
  return {
    w: clamp(size?.w, SIZE_LIMITS.minW, SIZE_LIMITS.maxW, DEFAULT_MODULE_SIZE.w),
    h: clamp(size?.h, SIZE_LIMITS.minH, SIZE_LIMITS.maxH, DEFAULT_MODULE_SIZE.h),
  };
}

function cleanText(value, max) {
  const spaced = String(value ?? '').replace(/\s+/g, ' ');
  return Array.from(spaced).filter(ch => ch.charCodeAt(0) >= 32).join('').trim().slice(0, max);
}

/** A short title from a plain-language request ("a tip calculator for my crew" -> "Tip calculator"). */
export function titleFromRequest(request) {
  const words = cleanText(request, 200)
    .replace(/^(please\s+)?(make|build|create|give)\s+(me\s+)?/i, '')
    .replace(/^(an?|the|some)\s+/i, '')
    .replace(/\s+(for|that|which|to|with)\s+.*$/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');
  if (!words) return 'New module';
  return words[0].toUpperCase() + words.slice(1);
}

/** Make any model-written manifest safe to store and show. */
export function normalizeManifest(raw, { request = '' } = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const name = cleanText(input.name, 48) || titleFromRequest(request);
  const icon = MODULE_ICONS.includes(input.icon) ? input.icon : 'Toolbox';
  const permissions = [...new Set((Array.isArray(input.permissions) ? input.permissions : [])
    .map(p => String(p).trim().toLowerCase())
    .filter(p => MODULE_PERMISSIONS.includes(p)))];
  return {
    format: MODULE_FORMAT_VERSION,
    name,
    description: cleanText(input.description, 160),
    icon,
    size: clampModuleSize(input.size),
    permissions,
  };
}

function fenced(text, langs) {
  const open = /```([\w-]*)[^\n]*\n/g;
  let match;
  while ((match = open.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf('```', start);
    if (langs.includes(match[1].toLowerCase())) {
      return { body: end === -1 ? text.slice(start) : text.slice(start, end), closed: end !== -1 };
    }
    if (end === -1) return null;
    open.lastIndex = end + 3;
  }
  return null;
}

/**
 * Split a generator reply into { manifest, source }. Works on a partial
 * stream too (the window shows the code as it arrives): `complete` is true
 * only once the HTML block is closed.
 */
export function parseModuleReply(reply, { request = '' } = {}) {
  const text = String(reply || '');
  const json = fenced(text, ['json', 'manifest']);
  let rawManifest = null;
  if (json?.closed) {
    try { rawManifest = JSON.parse(json.body); } catch { rawManifest = null; }
  }
  const html = fenced(text, ['html', 'htm']);
  const source = html ? html.body.trim() : '';
  return {
    manifest: normalizeManifest(rawManifest, { request }),
    source,
    complete: Boolean(html?.closed && source),
  };
}

/** Byte length that works in the browser and Node. */
export function sourceBytes(source) {
  return new TextEncoder().encode(String(source || '')).length;
}

/** A new version entry; the list keeps the newest MAX_MODULE_VERSIONS. */
export function appendVersion(versions, entry) {
  const list = Array.isArray(versions) ? versions : [];
  return [...list, { ...entry, at: entry.at || new Date().toISOString() }].slice(-MAX_MODULE_VERSIONS);
}
