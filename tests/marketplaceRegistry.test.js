/**
 * tests/marketplaceRegistry.test.js
 *
 * Brief B2 — `.team/handoffs/2026-06-23-b2-marketplace-window.md`.
 *
 * Asserts the marketplace catalog derivation:
 *   1. `getMarketplaceCatalog()` returns one row per WINDOW_MANIFEST.
 *   2. `getMarketplaceCatalogByCategory()` partitions rows by category.
 *   3. Categories include window / integration / agent / theme.
 *   4. Each row has the documented shape (id, kind, label, category, ...).
 *   5. Themes come from PRESET_LIBRARY mood + neurodivergent sources.
 *   6. `filterCatalogBySearch()` does case-insensitive label/description filter.
 */
import {
  getMarketplaceCatalog,
  getMarketplaceCatalogByCategory,
  filterCatalogBySearch,
  manifestToCatalogRow,
  categoryForManifest,
} from '../src/lib/marketplace/registry.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { PRESET_LIBRARY, SOURCES } from '../src/lib/theme/presetLibrary.js';

describe('Brief B2 - marketplace registry', () => {
  test('getMarketplaceCatalog returns one row per WINDOW_MANIFEST (plus theme rows)', () => {
    const catalog = getMarketplaceCatalog();
    // At least one row per manifest, plus themes from PRESET_LIBRARY.
    const windowRows = catalog.filter((row) => row.category === 'window' || row.category === 'integration' || row.category === 'package');
    expect(windowRows.length).toBe(WINDOW_MANIFESTS.length);

    // Every WINDOW_MANIFEST kind has a row.
    for (const manifest of WINDOW_MANIFESTS) {
      expect(catalog.find((row) => row.kind === manifest.kind)).toBeDefined();
    }
  });

  test('every row carries the documented shape', () => {
    const catalog = getMarketplaceCatalog();
    for (const row of catalog) {
      expect(typeof row.id).toBe('string');
      expect(typeof row.kind).toBe('string');
      expect(typeof row.label).toBe('string');
      expect(typeof row.type).toBe('string');
      expect(['window', 'integration', 'agent', 'theme', 'package']).toContain(row.category);
      expect(typeof row.description).toBe('string');
      expect(typeof row.dangerLevel).toBe('string');
      expect(Array.isArray(row.capabilities)).toBe(true);
      expect(typeof row.status).toBe('string');
    }
  });

  test('categoryForManifest discriminates by manifest.type', () => {
    expect(categoryForManifest({ type: 'window' })).toBe('window');
    expect(categoryForManifest({ type: 'integration' })).toBe('integration');
    expect(categoryForManifest({ type: 'agent' })).toBe('agent');
    expect(categoryForManifest({ type: 'package' })).toBe('package');
    // No type defaults to 'window'.
    expect(categoryForManifest({})).toBe('window');
    expect(categoryForManifest({ kind: 'foo' })).toBe('window');
  });

  test('manifestToCatalogRow pulls label/hint from moduleMenu', () => {
    const row = manifestToCatalogRow({
      kind: 'k',
      label: 'K',
      moduleMenu: { hint: 'A hint', icon: 'Plug', status: 'beta' },
      dangerLevel: 'review-required',
    });
    expect(row.label).toBe('K');
    expect(row.description).toBe('A hint');
    expect(row.launcherIcon).toBe('Plug');
    expect(row.status).toBe('beta');
    expect(row.dangerLevel).toBe('review-required');
  });

  test('getMarketplaceCatalogByCategory partitions rows', () => {
    const grouped = getMarketplaceCatalogByCategory();
    // Every category key exists (some may be empty for agent until D1 lands).
    for (const key of ['window', 'integration', 'agent', 'theme', 'package']) {
      expect(Array.isArray(grouped[key])).toBe(true);
    }
    // Sanity: every row in the catalog appears in exactly one category bucket.
    const flat = getMarketplaceCatalog();
    const total = Object.values(grouped).reduce((acc, arr) => acc + arr.length, 0);
    expect(total).toBe(flat.length);
  });

  test('themes come from PRESET_LIBRARY mood + neurodivergent (not languages)', () => {
    const catalog = getMarketplaceCatalog();
    const themes = catalog.filter((row) => row.category === 'theme');
    const moodIds = Object.keys(PRESET_LIBRARY).filter((id) => PRESET_LIBRARY[id].source === SOURCES.MOOD);
    const neuroIds = Object.keys(PRESET_LIBRARY).filter((id) => PRESET_LIBRARY[id].source === SOURCES.NEURODIVERGENT);
    // Every mood + neurodivergent preset appears as a theme row.
    for (const id of [...moodIds, ...neuroIds]) {
      expect(themes.find((t) => t.kind === id)).toBeDefined();
    }
    // No language preset appears as a theme row (they're accent swatches).
    const langIds = Object.keys(PRESET_LIBRARY).filter((id) => PRESET_LIBRARY[id].source === SOURCES.LANGUAGE);
    for (const id of langIds) {
      expect(themes.find((t) => t.kind === id)).toBeUndefined();
    }
  });

  test('filterCatalogBySearch is case-insensitive across label/description/hint', () => {
    const rows = [
      { kind: 'chat', label: 'Chat', description: 'Conversational surface', hint: '' },
      { kind: 'docs', label: 'Docs', description: 'Document editor', hint: 'edit markdown' },
      { kind: 'agent', label: 'Agent', description: 'AI assistant', hint: '' },
    ];
    expect(filterCatalogBySearch(rows, 'chat').map((r) => r.kind)).toEqual(['chat']);
    expect(filterCatalogBySearch(rows, 'CHAT').map((r) => r.kind)).toEqual(['chat']);
    expect(filterCatalogBySearch(rows, 'markdown').map((r) => r.kind)).toEqual(['docs']);
    expect(filterCatalogBySearch(rows, 'ai').map((r) => r.kind)).toEqual(['agent']);
    // Empty query returns all rows.
    expect(filterCatalogBySearch(rows, '').length).toBe(3);
    expect(filterCatalogBySearch(rows, '   ').length).toBe(3);
    // No match returns [].
    expect(filterCatalogBySearch(rows, 'nonexistent')).toEqual([]);
    // Null / undefined gracefully handled.
    expect(filterCatalogBySearch(null, 'chat')).toEqual([]);
    expect(filterCatalogBySearch(undefined, '')).toEqual([]);
  });
});