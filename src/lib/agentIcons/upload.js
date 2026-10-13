/**
 * src/lib/agentIcons/upload.js
 *
 * Brief C2 — `.team/handoffs/2026-06-23-c2-agent-icon-picker.md`.
 *
 * SVG file validation + sanitization for the user-upload icon path.
 * Defense in depth: validate the file extension + size, parse the XML,
 * confirm the root element is <svg>, scrub <script> tags and event
 * handlers. Returns either { ok: true, sanitizedSvg } or
 * { ok: false, reason }.
 *
 * Pure JS, no new deps. Used by AgentIconPicker.jsx when the user
 * picks an SVG file from disk.
 */

import DOMPurify from 'dompurify';

const MAX_BYTES = 50 * 1024; // 50 KB per the brief.

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an uploaded File-like (or { name, size, text() }) object as a
 * safe SVG icon. Returns a structured result; never throws.
 *
 * @param {{ name: string, size: number, text: () => Promise<string> }|File} file
 * @returns {Promise<{ ok: true, sanitizedSvg: string } | { ok: false, reason: string }>}
 */
export async function validateSvgFile(file) {
  if (!file) return { ok: false, reason: 'No file provided' };
  if (!file.name || !file.name.toLowerCase().endsWith('.svg')) {
    return { ok: false, reason: 'File must have an .svg extension' };
  }
  if (typeof file.size === 'number' && file.size > MAX_BYTES) {
    return { ok: false, reason: `File too large (${file.size} bytes; max ${MAX_BYTES})` };
  }
  let raw = '';
  if (typeof file.text === 'function') {
    raw = await file.text();
  } else if (typeof file.arrayBuffer === 'function') {
    const buf = await file.arrayBuffer();
    raw = new TextDecoder('utf-8').decode(buf);
  } else if (typeof file === 'string') {
    raw = file;
  } else {
    return { ok: false, reason: 'Unsupported file input' };
  }
  if (raw.length > MAX_BYTES) {
    return { ok: false, reason: `Decoded content too large (${raw.length} bytes; max ${MAX_BYTES})` };
  }

  const parsed = parseSvg(raw);
  if (!parsed.ok) return parsed;

  const sanitized = sanitizeSvg(parsed.root);
  // After sanitization, the result should still be a well-formed SVG.
  if (!sanitized.includes('<svg') || !sanitized.includes('</svg>')) {
    return { ok: false, reason: 'Sanitization removed the root element' };
  }
  // The viewBox must be present (C1 contract). Sanitization preserves it
  // but a malicious upload could try to drop it; we re-check.
  if (!/viewBox\s*=/i.test(sanitized)) {
    return { ok: false, reason: 'viewBox is required' };
  }
  return { ok: true, sanitizedSvg: sanitized };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Minimal SVG parser. Returns either { ok: true, root: <svg raw>, body: <inner XML> }
 * or { ok: false, reason }.
 *
 * We intentionally avoid pulling in a DOMParser dep. The regex approach is
 * good enough for the validation the brief requires (root element is <svg>,
 * no <script>, no event handlers, viewBox present). The returned `root` is the
 * raw outer <svg ...>...</svg> markup so sanitization can operate on it.
 */
function parseSvg(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, reason: 'Empty content' };
  }
  // Reject if there's a <script> tag anywhere — XSS vector.
  if (/<script\b[^>]*>/i.test(raw) || /<\/script\s*>/i.test(raw)) {
    return { ok: false, reason: 'SVG must not contain <script> tags' };
  }
  // Find the root <svg ...> ... </svg>. Allow trailing content (some
  // editors append whitespace or comments) but reject if there are multiple
  // top-level svg elements.
  const rootMatch = raw.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg\s*>/i);
  if (!rootMatch) {
    return { ok: false, reason: 'Root <svg> element not found' };
  }
  // Look for a second <svg> tag at top level — indicates nested svgs which
  // would be ambiguous for an icon renderer.
  const secondIdx = raw.indexOf('<svg', rootMatch.index + 1);
  if (secondIdx !== -1) {
    // Confirm the next chars really are a tag opener (not part of e.g. "<svgDesc").
    const tail = raw.slice(secondIdx, secondIdx + 4).toLowerCase();
    if (tail === '<svg') {
      return { ok: false, reason: 'Multiple <svg> elements at top level' };
    }
  }
  const [, attrs, body] = rootMatch;
  if (!/viewBox\s*=/i.test(attrs)) {
    return { ok: false, reason: 'viewBox attribute is required' };
  }
  if (/\son\w+\s*=/i.test(attrs)) {
    return { ok: false, reason: 'Event handlers on the root <svg> are not allowed' };
  }
  return { ok: true, root: rootMatch[0], attrs, body };
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Strip <script>...</script> blocks and event-handler attributes from
 * a parsed SVG root element. Returns the cleaned SVG string.
 *
 * Defense in depth: even after parseSvg() rejects <script>, an attacker
 * could smuggle one through with HTML comments or CDATA, so we strip
 * again here.
 */
export function sanitizeSvg(svgRaw) {
  if (typeof svgRaw !== 'string') return '';
  return DOMPurify.sanitize(svgRaw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'style', 'foreignObject', 'image', 'a'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
  });
}

// ---------------------------------------------------------------------------
// File-size helper (exported for tests)
// ---------------------------------------------------------------------------

export const SVG_MAX_BYTES = MAX_BYTES;

// ---------------------------------------------------------------------------
// Convenience: validate a raw SVG string (no File wrapper)
// ---------------------------------------------------------------------------

/**
 * Validate + sanitize an SVG string. Used by the generate path's
 * result-validation (post-AI), and exposed for tests.
 */
export function validateSvgString(svgString) {
  return validateSvgFile({ name: 'inline.svg', size: svgString.length, text: async () => svgString });
}
