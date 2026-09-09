/**
 * src/lib/marketplace/registry.js
 *
 * Brief B2 — `.team/handoffs/2026-06-23-b2-marketplace-window.md`.
 *
 * The marketplace catalog: derives one entry per WINDOW_MANIFEST, grouped
 * by category (Windows / Agents / Integrations / Themes). Consumed by
 * MarketplaceWindow.jsx to render the 4-tab opt-in UI.
 *
 * Source taxonomy:
 *   - `type: 'window'`       — Canvas windows (chat, files, calendar, …)
 *   - `type: 'integration'`  — Provider integrations (oauth-backed, e.g. Google)
 *   - `type: 'agent'`        — Agent family entries (per D1; empty until that
 *                              brief's REST surface is queried here)
 *   - `type: 'theme'`        — Derived from PRESET_LIBRARY (moods/themes)
 *
 * Pure JS, no new deps. Pulls from windowManifest + presetLibrary so the
 * catalog stays in sync with the rest of the app — adding a window to
 * `manifest/*.js` auto-shows it in the marketplace.
 */

import { WINDOW_MANIFESTS } from '../windowManifest.js';
import { PRESET_LIBRARY, listPresetIds, SOURCES } from '../theme/presetLibrary.js';

// ---------------------------------------------------------------------------
// Catalog grouping
// ---------------------------------------------------------------------------

/**
 * Tag a manifest entry with a marketplace category. The discriminator is
 * the manifest's `type` field plus a fallback: any window manifest without a
 * type defaults to 'window'. Integration / package manifests go to their
 * respective categories.
 *
 * @param {object} manifest
 * @returns {'window'|'integration'|'agent'|'theme'|'package'}
 */
export function categoryForManifest(manifest) {
  const t = manifest && manifest.type;
  if (t === 'integration') return 'integration';
  if (t === 'agent') return 'agent';
  if (t === 'package') return 'package';
  if (t === 'window') return 'window';
  // Fall back: no type or unknown type → 'window' (the common case).
  return 'window';
}

/**
 * Translate a raw manifest into the marketplace row shape the UI consumes.
 * The shape is intentionally flat so the panel can render a list with no
 * further normalization.
 *
 * @param {object} manifest
 * @returns {object} marketplace row
 */
export function manifestToCatalogRow(manifest) {
  const category = categoryForManifest(manifest);
  const moduleMenu = manifest.moduleMenu || {};
  return {
    id: manifest.kind,
    kind: manifest.kind,
    label: manifest.label || manifest.kind,
    type: manifest.type || 'window',
    category,
    description: moduleMenu.hint || manifest.description || '',
    dangerLevel: manifest.dangerLevel || 'safe',
    capabilities: manifest.capabilities || [],
    embedMode: manifest.embedMode || null,
    status: moduleMenu.status || 'available',
    launcherIcon: moduleMenu.icon || null,
    hint: moduleMenu.hint || '',
  };
}

/**
 * Translate a PRESET_LIBRARY entry into a 'theme' row. Themes get a separate
 * category because they're not windows — they're palette / mood choices
 * that the user picks from the Theme panel.
 *
 * @param {string} id
 * @param {object} entry
 * @returns {object} marketplace row
 */
export function presetToCatalogRow(id, entry) {
  return {
    id,
    kind: id,
    label: entry.label || id,
    type: 'theme',
    category: 'theme',
    description: `Source: ${entry.source}`,
    dangerLevel: 'safe',
    capabilities: [],
    embedMode: null,
    status: 'available',
    launcherIcon: 'Palette',
    hint: '',
  };
}

// ---------------------------------------------------------------------------
// Public catalog
// ---------------------------------------------------------------------------

/**
 * The full marketplace catalog. Returned as a flat array; the consumer can
 * group by `.category` to render tabs. Order: windows → integrations →
 * agents → themes, with the existing WINDOW_MANIFESTS / PRESET_LIBRARY
 * iteration order preserved within each group.
 *
 * @returns {Array<object>} marketplace rows
 */
export function getMarketplaceCatalog() {
  const rows = [];
  for (const manifest of WINDOW_MANIFESTS) {
    rows.push(manifestToCatalogRow(manifest));
  }
  for (const id of listPresetIds(SOURCES.MOOD)) {
    rows.push(presetToCatalogRow(id, PRESET_LIBRARY[id]));
  }
  for (const id of listPresetIds(SOURCES.NEURODIVERGENT)) {
    rows.push(presetToCatalogRow(id, PRESET_LIBRARY[id]));
  }
  for (const id of listPresetIds(SOURCES.BRAND)) {
    rows.push(presetToCatalogRow(id, PRESET_LIBRARY[id]));
  }
  // Languages are accent swatches, not standalone presets to enable — skip.
  return rows;
}

/**
 * Group the catalog rows by category. Returns an object keyed by category
 * with arrays of rows in stable order. Useful for the 4-tab UI.
 *
 * @param {Array<object>} [catalog] — optional catalog (defaults to fresh)
 * @returns {{window: Array, integration: Array, agent: Array, theme: Array, package: Array}}
 */
export function getMarketplaceCatalogByCategory(catalog) {
  const rows = catalog || getMarketplaceCatalog();
  const out = { window: [], integration: [], agent: [], theme: [], package: [] };
  for (const row of rows) {
    const cat = row.category || 'window';
    if (!out[cat]) out[cat] = [];
    out[cat].push(row);
  }
  return out;
}

/**
 * Filter rows by a search query (case-insensitive label / description).
 * Used by the MarketplaceWindow search bar.
 *
 * @param {Array<object>} rows
 * @param {string} query
 * @returns {Array<object>} filtered rows in the same order
 */
export function filterCatalogBySearch(rows, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((row) => {
    const label = (row.label || '').toLowerCase();
    const desc = (row.description || '').toLowerCase();
    const hint = (row.hint || '').toLowerCase();
    return label.includes(q) || desc.includes(q) || hint.includes(q);
  });
}