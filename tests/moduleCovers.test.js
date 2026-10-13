import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { MODULE_MENU_MANIFESTS } from '../src/lib/windowManifest.js';
import { searchPaletteEntries } from '../src/lib/search/engines.js';
import { ModuleCover, hasModuleCover } from '../src/components/covers/ModuleCover.jsx';

const sections = buildAddSections({
  manifests: MODULE_MENU_MANIFESTS,
  saved: [{ id: 's1', name: 'My board' }],
  templates: [{ id: 't1', manifest: { name: 'Real Estate Team' } }],
});
const rows = sections.flatMap(s => s.items);

describe('Add palette cover pictures', () => {
  test('every row in the Add palette has a cover, not just the games', () => {
    const missing = rows.filter(r => !hasModuleCover(r.cover)).map(r => r.id);
    expect(missing).toEqual([]);
    expect(rows.length).toBeGreaterThan(70);
  });

  test('covers draw in board tokens only, with no gradients, glows or fixed colours', () => {
    for (const row of rows) {
      const svg = renderToStaticMarkup(React.createElement(ModuleCover, { kind: row.cover, brand: row.brand }));
      expect(svg).toContain('viewBox="0 0 44 24"');
      expect(svg).not.toMatch(/Gradient|filter=|opacity=|#[0-9a-f]{3,6}"/i);
    }
  });

  test('branded windows and search engines carry their service mark', () => {
    const docker = renderToStaticMarkup(React.createElement(ModuleCover, { kind: 'containers' }));
    expect(docker).toMatch(/<g transform="translate\(31\.5 6\.5\)/);
    const tavily = renderToStaticMarkup(React.createElement(ModuleCover, { kind: 'leadHound' }));
    expect(tavily).toContain('>Tv<');
    const engine = searchPaletteEntries()[0];
    const row = rows.find(r => r.id === engine.id);
    expect(row.cover).toBe('searchEngine');
    expect(renderToStaticMarkup(React.createElement(ModuleCover, { kind: row.cover, brand: row.brand }))).toContain('translate(31.5 6.5)');
  });

  test('unknown kinds render nothing so the row keeps its icon', () => {
    expect(hasModuleCover('nope')).toBe(false);
    expect(renderToStaticMarkup(React.createElement(ModuleCover, { kind: 'nope' }))).toBe('');
  });
});
