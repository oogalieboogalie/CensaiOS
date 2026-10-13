/**
 * src/lib/theme/presetLibrary.js
 *
 * PRESET_LIBRARY v0.1 — unified source of truth for every color / accent
 * preset reachable from any surface in CensaiHub (board theme panel, code
 * editor, terminal window, agent card, ...).
 *
 * Source taxonomy:
 *   - `mood`           — full colorway: { mode, accent, vars }.
 *   - `language`       — language-stripe accent: { hue, chroma, lightness }.
 *   - `brand`          — platform / infra / generic accent: same shape as
 *                        language.
 *   - `neurodivergent` — full colorway (mood-shaped, source-tagged separately).
 *                        Brief A4. Round-trips through MOODS via getMoodsView().
 *
 * Brief A5 — surface overrides: mood entries can OPTIONALLY carry a
 * `surface` block (Record<varName, oklch string>) that overrides specific
 * surface control tokens (--bg, --surface, ...) on top of the active mood.
 * `surface` is an ADDITIVE field, NOT mutually exclusive with mood/accent —
 * it's an additive override. resolveSurfaceValue in surfaceControls.js looks
 * at preset.surface first, so the derivation order
 * (user > preset > mood > schema) works.
 * See `src/lib/theme/surfaceControls.js` for the schema + derivation order.
 */

import { MOOD_ENTRIES } from './presetEntries/moods.js';
import { BRAND_ENTRIES } from './presetEntries/brands.js';
import { LANGUAGE_ENTRIES } from './presetEntries/languages.js';
import { NEURODIVERGENT_MOODS } from './presetEntries/neurodivergent.js';

export const SOURCES = Object.freeze({
  MOOD: 'mood',
  LANGUAGE: 'language',
  BRAND: 'brand',
  NEURODIVERGENT: 'neurodivergent',
});

const VALID_SOURCES = new Set(Object.values(SOURCES));
const NEURODIVERGENT_IDS = new Set(Object.keys(NEURODIVERGENT_MOODS));

function buildMoodBlock(body) {
  return Object.freeze({
    mode: body.mode,
    accent: Object.freeze({ ...body.accent }),
    vars: Object.freeze({ ...body.vars }),
  });
}

function buildPresetLibrary() {
  const lib = {};
  for (const [id, body] of Object.entries(MOOD_ENTRIES)) {
    // Brief A4 — neurodivergent palettes are full colorways (have vars,
    // mode, accent) and source-tagged separately so callers can filter or
    // surface them. Round-trips through MOODS via getMoodsView().
    const source = NEURODIVERGENT_IDS.has(id) ? SOURCES.NEURODIVERGENT : SOURCES.MOOD;
    const entry = {
      id,
      label: body.label,
      source,
      mood: buildMoodBlock(body),
    };
    // Brief A5 — optional surface overrides. `surface` is a top-level
    // optional field on the entry (NOT mutually exclusive with mood/accent —
    // it's an additive override). Only attached if the source data supplies
    // one. resolveSurfaceValue in surfaceControls.js looks at preset.surface
    // first, so the derivation order (user > preset > mood > schema) works.
    if (body.surface && typeof body.surface === 'object') {
      entry.surface = Object.freeze({ ...body.surface });
    }
    lib[id] = Object.freeze(entry);
  }
  for (const [id, body] of Object.entries(BRAND_ENTRIES)) {
    lib[id] = Object.freeze({
      id,
      label: body.label,
      source: SOURCES.BRAND,
      accent: Object.freeze({ ...body.accent }),
    });
  }
  for (const [id, body] of Object.entries(LANGUAGE_ENTRIES)) {
    lib[id] = Object.freeze({
      id,
      label: body.label,
      source: SOURCES.LANGUAGE,
      accent: Object.freeze({ ...body.accent }),
    });
  }
  return Object.freeze(lib);
}

export const PRESET_LIBRARY = buildPresetLibrary();

export function getPresetSource(id) {
  const entry = PRESET_LIBRARY[id];
  return entry ? entry.source : null;
}

export function filterBySource(source) {
  if (!VALID_SOURCES.has(source)) {
    return {};
  }
  const out = {};
  for (const [id, entry] of Object.entries(PRESET_LIBRARY)) {
    if (entry.source === source) out[id] = entry;
  }
  return out;
}

/**
 * Derive the historical `MOODS[id] = { mode, accent, vars }` view. Includes
 * source in {'mood', 'neurodivergent'} — the brief A4 neurodivergent palettes
 * are full colorways (have vars, mode, accent) so they round-trip through the
 * same MOODS shape that downstream callers depend on. Matches the original
 * Theme.jsx MOODS shape exactly so downstream callers
 * (Theme.jsx, WindowFrame.jsx, useThemePanel.js, etc.) see zero change.
 *
 * @returns {Record<string, {mode: 'light'|'dark', accent: {hue,chroma,lightness}, vars: Record<string,string>}>}
 */
export function getMoodsView() {
  const out = {};
  for (const [id, entry] of Object.entries(PRESET_LIBRARY)) {
    if (entry.source !== SOURCES.MOOD && entry.source !== SOURCES.NEURODIVERGENT) continue;
    out[id] = { mode: entry.mood.mode, accent: { ...entry.mood.accent }, vars: { ...entry.mood.vars } };
  }
  return out;
}

/**
 * Derive the historical `THEME_PRESETS[id] = { hue, chroma, lightness }` view,
 * filtered to source in {'language', 'brand'}.
 */
export function getThemePresetsView() {
  const out = {};
  for (const [id, entry] of Object.entries(PRESET_LIBRARY)) {
    if (entry.source !== SOURCES.LANGUAGE && entry.source !== SOURCES.BRAND) continue;
    out[id] = { hue: entry.accent.hue, chroma: entry.accent.chroma, lightness: entry.accent.lightness };
  }
  return out;
}

export function listPresetIds(source) {
  if (source == null) return Object.keys(PRESET_LIBRARY);
  if (!VALID_SOURCES.has(source)) return [];
  return Object.keys(PRESET_LIBRARY).filter((id) => PRESET_LIBRARY[id].source === source);
}

function assertInvariants() {
  if (typeof process !== 'undefined' && process.env && process.env.PRESET_LIBRARY_SKIP_SELFTEST) return;
  for (const [id, entry] of Object.entries(PRESET_LIBRARY)) {
    if (entry.id !== id) {
      throw new Error(`PRESET_LIBRARY invariant: entry id mismatch for key "${id}" (got "${entry.id}")`);
    }
    if (!VALID_SOURCES.has(entry.source)) {
      throw new Error(`PRESET_LIBRARY invariant: bad source for "${id}": ${entry.source}`);
    }
    // Brief A5 — `surface` is now an OPTIONAL ADDITIVE field on mood entries,
    // not a third slot in the mutually-exclusive invariant. The invariant
    // is: exactly one of {mood, accent}; surface is independent.
    const blockCount = (entry.mood ? 1 : 0) + (entry.accent ? 1 : 0);
    if (blockCount !== 1) {
      throw new Error(`PRESET_LIBRARY invariant: "${id}" must have exactly one of mood/accent (has ${blockCount})`);
    }
    if (entry.surface !== undefined) {
      if (typeof entry.surface !== 'object' || Array.isArray(entry.surface)) {
        throw new Error(`PRESET_LIBRARY invariant: surface on "${id}" must be a plain object of varName -> string`);
      }
      for (const [varName, value] of Object.entries(entry.surface)) {
        if (typeof value !== 'string') {
          throw new Error(`PRESET_LIBRARY invariant: surface on "${id}" has non-string value for "${varName}"`);
        }
      }
    }
    if (entry.source === SOURCES.MOOD || entry.source === SOURCES.NEURODIVERGENT) {
      if (!entry.mood || !entry.mood.vars || !entry.mood.accent) {
        throw new Error(`PRESET_LIBRARY invariant: ${entry.source} "${id}" missing required fields`);
      }
    } else {
      if (!entry.accent || typeof entry.accent.hue !== 'number') {
        throw new Error(`PRESET_LIBRARY invariant: ${entry.source} "${id}" missing accent.hue`);
      }
    }
  }
}

assertInvariants();