import { normalizeSearchResults, parentFolder, isInsideFolder } from '../src/components/files/useFiles.js';

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

describe('file tree folder moves', () => {
  test('goes up one folder with the path\'s own slashes', () => {
    expect(parentFolder('D:\\Repos\\CensaiHub\\src')).toBe('D:\\Repos\\CensaiHub');
    expect(parentFolder('D:\\Repos\\CensaiHub\\')).toBe('D:\\Repos');
    expect(parentFolder('D:\\Repos')).toBe('D:\\');
    expect(parentFolder('D:/Repos/CensaiHub')).toBe('D:\\Repos');
    expect(parentFolder('/workspace/CensaiHub/src')).toBe('/workspace/CensaiHub');
    expect(parentFolder('/workspace')).toBe('/');
    expect(parentFolder('')).toBe('');
  });

  test('knows a folder inside the window\'s project, whatever the slashes or case', () => {
    expect(isInsideFolder('D:\\Repos\\CensaiHub\\src', 'D:\\Repos\\CensaiHub')).toBe(true);
    expect(isInsideFolder('d:/repos/censaihub', 'D:\\Repos\\CensaiHub\\')).toBe(true);
    expect(isInsideFolder('D:\\Repos\\CensaiHub2', 'D:\\Repos\\CensaiHub')).toBe(false);
    expect(isInsideFolder('D:\\Repos', 'D:\\Repos\\CensaiHub')).toBe(false);
    expect(isInsideFolder('D:\\x', '')).toBe(false);
  });
});
