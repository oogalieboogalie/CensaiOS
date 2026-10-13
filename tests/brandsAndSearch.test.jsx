/**
 * @jest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BRAND_BY_KIND, BRAND_CATEGORIES, BRAND_KEYS, CLI_BRAND, PROVIDER_BRAND, brandFor, windowBrand } from '../src/lib/brands/index.js';
import { BRAND_MARKS } from '../src/lib/brands/brandMarks.js';
import { BrandIcon } from '../src/components/brand/BrandIcon.jsx';
import { SEARCH_ENGINES, DDG_ONION, normalizeInstance, resultsUrl, searchPaletteEntries } from '../src/lib/search/engines.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { MODULE_MENU_MANIFESTS, WINDOW_MANIFEST_BY_KIND } from '../src/lib/windowManifest.js';
import { SearchEngineWindow } from '../src/components/windows/searchEngine/index.jsx';
import { BYOK_PROVIDERS } from '../src/lib/byokProviders.js';

afterEach(cleanup);

describe('brand marks', () => {
  test('every mapped brand resolves, and every mark is one 24-unit path', () => {
    const keys = [...Object.values(BRAND_BY_KIND), ...Object.values(PROVIDER_BRAND), ...Object.values(CLI_BRAND), ...Object.values(BRAND_CATEGORIES).flat()];
    for (const key of keys) expect(brandFor(key)).not.toBeNull();
    for (const [slug, mark] of Object.entries(BRAND_MARKS)) {
      expect(mark.title).toBeTruthy();
      expect(mark.hex).toMatch(/^[0-9A-F]{6}$/i);
      expect(mark.path).toMatch(/^[Mm]/);
      expect(slug).toMatch(/^[a-z0-9]+$/);
    }
    expect(new Set(BRAND_KEYS).size).toBe(BRAND_KEYS.length);
  });

  test('every brand on a shelf appears once, and every BYOK provider has a mark', () => {
    const shelved = Object.values(BRAND_CATEGORIES).flat();
    expect(new Set(shelved).size).toBe(shelved.length);
    for (const p of BYOK_PROVIDERS) expect(brandFor(PROVIDER_BRAND[p.id])).not.toBeNull();
  });

  test('brand kinds are real window kinds; records are stable objects', () => {
    for (const kind of Object.keys(BRAND_BY_KIND)) expect(WINDOW_MANIFEST_BY_KIND[kind]).toBeTruthy();
    expect(brandFor('docker')).toBe(brandFor('Docker'));
    expect(brandFor('tor').key).toBe('torproject');
    expect(brandFor('nope')).toBeNull();
    expect(windowBrand({ kind: 'containers' }).key).toBe('docker');
    expect(windowBrand({ kind: 'searchEngine', engine: 'bing' }).monogram).toBe('B');
    expect(windowBrand({ kind: 'chat' })).toBeNull();
  });

  test('BrandIcon draws the mark in ink, the brand colour on request, and monograms', () => {
    const { container, rerender } = render(<BrandIcon brand="spotify" size={20} />);
    const path = container.querySelector('path');
    expect(path.getAttribute('fill')).toBe('currentColor');
    expect(container.querySelector('title').textContent).toBe('Spotify');
    rerender(<BrandIcon brand="spotify" tone="color" />);
    expect(container.querySelector('path').getAttribute('fill')).toBe(`#${BRAND_MARKS.spotify.hex}`);
    // Near-black marks fall back to ink so they never vanish on the dark look.
    rerender(<BrandIcon brand="github" tone="color" />);
    expect(container.querySelector('path').getAttribute('fill')).toBe('currentColor');
    rerender(<BrandIcon brand="tavily" />);
    expect(container.querySelector('text').textContent).toBe('Tv');
    rerender(<BrandIcon brand="unknown" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('search engines', () => {
  test('result URLs encode the query and respect the SearXNG server', () => {
    expect(resultsUrl('duckduckgo', 'tide tables & moon')).toBe('https://html.duckduckgo.com/html/?q=tide%20tables%20%26%20moon');
    expect(resultsUrl('google', '  ')).toBe('');
    expect(resultsUrl('tor', 'x')).toBe('');
    expect(resultsUrl('searxng', 'x', { instance: 'search.example.org/' })).toBe('https://search.example.org/search?q=x');
    expect(normalizeInstance('not a url at all ::')).toBe('https://searx.be');
  });

  test('the Add menu lists a Search engines section; Tavily opens Research', () => {
    const sections = buildAddSections({ manifests: MODULE_MENU_MANIFESTS });
    const section = sections.find(s => s.id === 'cat:Search engines');
    const labels = section.items.map(i => i.label);
    expect(labels).toEqual(expect.arrayContaining(['DuckDuckGo', 'Google', 'Tavily', 'SearXNG', 'Tor', 'Brave Search', 'Bing', 'Startpage', 'Kagi']));
    const tavily = section.items.find(i => i.label === 'Tavily');
    expect(tavily.action).toEqual({ type: 'spawn', kind: 'research', props: {} });
    const google = section.items.find(i => i.label === 'Google');
    expect(google.action).toEqual({ type: 'spawn', kind: 'searchEngine', props: { engine: 'google', title: 'Google' } });
    expect(google.brand).toBe('google');
    // The generic Search kind is not listed again under More.
    expect(sections.find(s => s.id === 'cat:More')?.items.some(i => i.id === 'kind:searchEngine')).toBeFalsy();
    // Branded windows carry their mark in the menu.
    expect(sections.flatMap(s => s.items).find(i => i.id === 'kind:containers').brand).toBe('docker');
    expect(searchPaletteEntries()).toHaveLength(SEARCH_ENGINES.length);
  });

  function Harness({ initial }) {
    const [win, setWin] = React.useState({ id: 's1', kind: 'searchEngine', ...initial });
    return <SearchEngineWindow win={win} onUpdate={(patch) => setWin(w => ({ ...w, ...patch }))} />;
  }

  test('DuckDuckGo frames its results; Google says plainly it opens in the browser', () => {
    const { container } = render(<Harness initial={{ engine: 'duckduckgo' }} />);
    fireEvent.change(screen.getByLabelText('Search DuckDuckGo'), { target: { value: 'censai' } });
    fireEvent.click(screen.getByText('Search', { selector: 'button' }));
    expect(container.querySelector('iframe').getAttribute('src')).toBe('https://html.duckduckgo.com/html/?q=censai');
    fireEvent.click(screen.getByRole('tab', { name: /Google/ }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText('Google opens in your browser')).toBeTruthy();
    expect(screen.getByText('Open results in your browser').getAttribute('href')).toBe('https://www.google.com/search?q=censai');
  });

  test('Tor explains the Tor Browser and offers the DuckDuckGo onion address', () => {
    render(<Harness initial={{ engine: 'tor' }} />);
    expect(screen.getByText('Tor needs the Tor Browser')).toBeTruthy();
    expect(screen.getByTestId('se-onion').textContent).toBe(DDG_ONION);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
