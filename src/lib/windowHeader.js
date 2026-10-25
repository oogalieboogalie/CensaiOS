/**
 * src/lib/windowHeader.js
 *
 * Pure rules for the one shared window header (spec 2, window chrome).
 * WindowFrame draws the header; windows only supply a title, an icon, up to
 * MAX_HEADER_ACTIONS actions and an overflow menu (see WindowTitle.jsx).
 *
 * Header modes are a theme knob (looks.js `headerMode`) with a per-window
 * override (`win.headerMode`):
 *   strip — a slim row the color of the window body, always shown
 *   ghost — content runs to the top edge; the header fades in on hover
 *   bare  — no header at all; a small control pill appears on hover
 *   edge  — no header bar; the controls hang as small tabs off the right edge
 *           (wireframe, diagram 05)
 */

export const HEADER_MODES = Object.freeze(['strip', 'ghost', 'bare', 'edge']);
export const HEADER_MODE_LABELS = Object.freeze({ strip: 'Strip', ghost: 'Ghost', bare: 'Bare', edge: 'Edge' });
export const DEFAULT_HEADER_MODE = 'strip';
export const MAX_HEADER_ACTIONS = 3;

const HEADER_KEYS = new Set(['title', 'icon', 'mode', 'fixed']);

/** Which header mode a window uses: its own override, then the theme's. */
export function resolveHeaderMode(win = {}, themeMode = DEFAULT_HEADER_MODE) {
  if (win.bare === true) return 'bare';
  if (HEADER_MODES.includes(win.headerMode)) return win.headerMode;
  if (win.frameless === true) return 'ghost';
  return HEADER_MODES.includes(themeMode) ? themeMode : DEFAULT_HEADER_MODE;
}

// Emoji and pictographs (plus the joiners / variation selectors that glue
// them together). Headers are text and one icon; decoration lives elsewhere.
const PICTOGRAPHS = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** Header copy is plain text: strip emoji and collapse the leftover spaces. */
export function cleanHeaderText(text) {
  if (typeof text !== 'string') return text;
  return text.replace(PICTOGRAPHS, '').replace(/\s{2,}/g, ' ').trim();
}

/** Header fields a manifest entry declares, with fallbacks from the entry. */
export function resolveHeaderMeta(manifest) {
  if (!manifest) return { title: '', icon: null, mode: null, fixed: false };
  const header = manifest.header || {};
  const mode = HEADER_MODES.includes(header.mode) ? header.mode : null;
  return {
    title: cleanHeaderText(header.title || manifest.label || ''),
    icon: header.icon || manifest.launcher?.icon || null,
    mode,
    // `fixed`: the window needs this mode (a docked desktop app sits over the
    // whole body, so a header floating over the body would hide it), so
    // neither the theme nor the window's own menu can change it.
    fixed: Boolean(mode) && header.fixed === true,
  };
}

/**
 * Validate a manifest `header` block. Returns a list of error strings
 * (empty = valid). Used by `npm run window:validate`.
 */
export function validateHeaderMeta(kind, header, { iconNames = null } = {}) {
  const errors = [];
  if (header === undefined) return errors;
  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    return [`${kind}: header must be an object`];
  }
  for (const key of Object.keys(header)) {
    if (!HEADER_KEYS.has(key)) {
      errors.push(`${kind}: header.${key} is not allowed (only title, icon, mode and fixed; actions are passed to WindowTitle)`);
    }
  }
  if (header.title !== undefined && (typeof header.title !== 'string' || !header.title.trim())) {
    errors.push(`${kind}: header.title must be a non-empty string`);
  }
  if (typeof header.title === 'string' && cleanHeaderText(header.title) !== header.title.trim()) {
    errors.push(`${kind}: header.title must be plain text (no emoji)`);
  }
  if (header.icon !== undefined) {
    if (typeof header.icon !== 'string' || !header.icon.trim()) {
      errors.push(`${kind}: header.icon must be an Icon name`);
    } else if (iconNames && !iconNames.includes(header.icon)) {
      errors.push(`${kind}: header.icon "${header.icon}" is not an Icon in src/components/Icons.jsx`);
    }
  }
  if (header.mode !== undefined && !HEADER_MODES.includes(header.mode)) {
    errors.push(`${kind}: header.mode must be one of [${HEADER_MODES.join(', ')}]`);
  }
  if (header.fixed !== undefined && (typeof header.fixed !== 'boolean' || (header.fixed && header.mode === undefined))) {
    errors.push(`${kind}: header.fixed must be true or false, and needs a header.mode`);
  }
  return errors;
}

/** Split header actions into the ones shown inline and the overflow rest. */
export function splitHeaderActions(items = [], max = MAX_HEADER_ACTIONS) {
  const list = items.filter(Boolean);
  return { inline: list.slice(0, max), overflow: list.slice(max) };
}
