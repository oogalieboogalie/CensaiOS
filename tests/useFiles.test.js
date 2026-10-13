import { normalizeSearchResults } from '../src/components/files/useFiles.js';

describe('file browser search normalization', () => {
  test('accepts local search API shape', () => {
    expect(normalizeSearchResults({ results: [{ name: 'App.jsx' }] })).toEqual([{ name: 'App.jsx' }]);
  });

  test('accepts GitHub search API shape', () => {
    expect(normalizeSearchResults([{ name: 'App.tsx' }])).toEqual([{ name: 'App.tsx' }]);
  });

  test('falls back to an empty list for errors or malformed responses', () => {
    expect(normalizeSearchResults({ error: 'failed' })).toEqual([]);
    expect(normalizeSearchResults(null)).toEqual([]);
  });
});
