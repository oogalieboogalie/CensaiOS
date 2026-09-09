/**
 * src/lib/theme/surfaceControls.js
 *
 * Brief A5 — `.team/handoffs/2026-06-23-a5-surface-controls-cohesion.md`.
 *
 * Schema + derivation for the surface control tokens (--bg, --canvas,
 * --surface, --surface-2, --ink, --ink-soft, --hairline, --hairline-strong).
 *
 * Why this file exists:
 *
 *   Before A5, `SURFACE_CONTROLS` was a hand-maintained array in
 *   `src/components/Theme.jsx`. There was no formal relationship between the
 *   controls list and the mood / preset libraries, so a preset could not
 *   override a surface token without the panel silently ignoring it.
 *
 *   A5 introduces a typed schema and a derivation order:
 *
 *     user override > preset surface > mood surface > schema default
 *
 *   That mirrors how the existing token layout already works for
 *   `customVars` (A1's Fine Tune) but extends it to PRESET_LIBRARY entries
 *   that want a deliberate surface override on top of the active mood.
 *
 * Source taxonomy (per brief):
 *
 *   - `mood`   — the value comes from the active mood's `vars` block
 *                (e.g. `MOODS['cobalt-deep'].vars['--bg']`).
 *   - `preset` — the value comes from `PRESET_LIBRARY[id].surface[varName]`
 *                if the entry has a `surface` block; otherwise falls through.
 *   - `user`   — the user can override via the Fine Tune panel
 *                (workspace.theme.customVars[varName]).
 *
 * Pure JS, no new deps, runs in browser and node test runners.
 */

// ---------------------------------------------------------------------------
// Source taxonomy (single source of truth)
// ---------------------------------------------------------------------------

export const SURFACE_SOURCE = Object.freeze({
  MOOD: 'mood',
  PRESET: 'preset',
  USER: 'user',
  SCHEMA: 'schema',
});

const VALID_SOURCES = new Set(Object.values(SURFACE_SOURCE));

// ---------------------------------------------------------------------------
// Schema — every entry carries the metadata the Theme panel renders
// (label, varName, previewKey, hint) plus a `defaultSource` that says where
// the value comes from by default and a `defaultValue` fallback if neither
// the active mood nor the active preset supplies one.
// ---------------------------------------------------------------------------

export const SURFACE_CONTROL_SCHEMA = Object.freeze([
  Object.freeze({
    varName: '--bg',
    label: 'App Backdrop',
    previewKey: 'bg',
    hint: 'Behind the board and windows',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.50 0 0)',
  }),
  Object.freeze({
    varName: '--canvas',
    label: 'Board Canvas',
    previewKey: 'canvas',
    hint: 'The dotted workspace area',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.50 0 0)',
  }),
  Object.freeze({
    varName: '--surface',
    label: 'Window Surface',
    previewKey: 'surface',
    hint: 'Main cards and windows',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.95 0.005 0)',
  }),
  Object.freeze({
    varName: '--surface-2',
    label: 'Soft Surface',
    previewKey: 'surface2',
    hint: 'Inputs, wells, secondary cards',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.92 0.005 0)',
  }),
  Object.freeze({
    varName: '--ink',
    label: 'Primary Text',
    previewKey: 'ink',
    hint: 'Main readable text',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.20 0 0)',
  }),
  Object.freeze({
    varName: '--ink-soft',
    label: 'Soft Text',
    previewKey: 'inkSoft',
    hint: 'Secondary labels and helper text',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.45 0 0)',
  }),
  Object.freeze({
    varName: '--hairline',
    label: 'Hairline Border',
    previewKey: 'hairline',
    hint: 'Subtle dividers and outlines',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.85 0.005 0)',
  }),
  Object.freeze({
    varName: '--hairline-strong',
    label: 'Strong Border',
    previewKey: 'hairlineStrong',
    hint: 'Active or heavier outlines',
    defaultSource: SURFACE_SOURCE.MOOD,
    defaultValue: 'oklch(0.70 0.008 0)',
  }),
]);

// ---------------------------------------------------------------------------
// Derived view — the historical SURFACE_CONTROLS array shape
// (label, varName, previewKey, hint) consumed by ThemeWorkspaceSection.jsx
// and any other surface that wants the controls list.
// ---------------------------------------------------------------------------

/**
 * Derive the historical `SURFACE_CONTROLS[id] = { label, varName, previewKey, hint }`
 * array from SURFACE_CONTROL_SCHEMA. Preserves the exact shape the existing
 * panel code (`Theme.jsx`, `ThemeWorkspaceSection.jsx`) depends on so the
 * switch from a hand-maintained literal to this derived view is invisible
 * to downstream callers.
 *
 * @returns {Array<{label: string, varName: string, previewKey: string, hint: string}>}
 */
export function getSurfaceControlsView() {
  return SURFACE_CONTROL_SCHEMA.map((entry) => ({
    label: entry.label,
    varName: entry.varName,
    previewKey: entry.previewKey,
    hint: entry.hint,
  }));
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Look up a single CSS variable's value for the current theme context, applying
 * the derivation order:
 *
 *   1. userOverride[varName] (the user's Fine Tune panel value, if any)
 *   2. preset.surface[varName] (the active PRESET_LIBRARY entry's surface block, if any)
 *   3. mood.vars[varName] (the active mood's own vars block, if present)
 *   4. schema defaultValue (SURFACE_CONTROL_SCHEMA fallback for this varName)
 *
 * Returns the value AND the source it came from (so the panel can label
 * "overridden by user" vs "from mood" vs "from preset" etc.).
 *
 * @param {string} varName
 * @param {{vars: Record<string,string>}|null|undefined} mood — the active mood object
 * @param {{surface?: Record<string,string>}|null|undefined} preset — the active PRESET_LIBRARY entry
 * @param {Record<string,string>} [userOverrides] — customVars-style overrides
 * @returns {{value: string, source: 'user'|'preset'|'mood'|'schema'}}
 */
export function resolveSurfaceValue(varName, mood, preset, userOverrides) {
  if (userOverrides && typeof userOverrides[varName] === 'string') {
    return { value: userOverrides[varName], source: SURFACE_SOURCE.USER };
  }
  if (preset && preset.surface && typeof preset.surface[varName] === 'string') {
    return { value: preset.surface[varName], source: SURFACE_SOURCE.PRESET };
  }
  if (mood && mood.vars && typeof mood.vars[varName] === 'string') {
    return { value: mood.vars[varName], source: SURFACE_SOURCE.MOOD };
  }
  const schemaEntry = SURFACE_CONTROL_SCHEMA.find((s) => s.varName === varName);
  const fallback = schemaEntry ? schemaEntry.defaultValue : '';
  return { value: fallback, source: SURFACE_SOURCE.SCHEMA };
}

/**
 * Batch version of `resolveSurfaceValue` — returns a flat
 * `Record<varName, { value, source }>` for every entry in SURFACE_CONTROL_SCHEMA.
 *
 * @param {{vars: Record<string,string>}|null|undefined} mood
 * @param {{surface?: Record<string,string>}|null|undefined} preset
 * @param {Record<string,string>} [userOverrides]
 * @returns {Record<string, {value: string, source: 'user'|'preset'|'mood'|'schema'}>}
 */
export function resolveAllSurfaces(mood, preset, userOverrides) {
  const out = {};
  for (const schemaEntry of SURFACE_CONTROL_SCHEMA) {
    out[schemaEntry.varName] = resolveSurfaceValue(schemaEntry.varName, mood, preset, userOverrides);
  }
  return out;
}

// Exported so tests + consumers can iterate without re-typing the source names.
export { VALID_SOURCES };