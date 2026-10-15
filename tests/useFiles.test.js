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
    expect(parentFolder('D:\\Homebase\\CensaiHub\\src')).toBe('D:\\Homebase\\CensaiHub');
    expect(parentFolder('D:\\Homebase\\CensaiHub\\')).toBe('D:\\Homebase');
    expect(parentFolder('D:\\Homebase')).toBe('D:\\');
    expect(parentFolder('D:/Homebase/CensaiHub')).toBe('D:\\Homebase');
    expect(parentFolder('/workspace/CensaiHub/src')).toBe('/workspace/CensaiHub');
    expect(parentFolder('/workspace')).toBe('/');
    expect(parentFolder('')).toBe('');
  });

  test('knows a folder inside the window\'s project, whatever the slashes or case', () => {
    expect(isInsideFolder('D:\\Homebase\\CensaiHub\\src', 'D:\\Homebase\\CensaiHub')).toBe(true);
    expect(isInsideFolder('d:/homebase/censaihub', 'D:\\Homebase\\CensaiHub\\')).toBe(true);
    expect(isInsideFolder('D:\\Homebase\\CensaiHub2', 'D:\\Homebase\\CensaiHub')).toBe(false);
    expect(isInsideFolder('D:\\Homebase', 'D:\\Homebase\\CensaiHub')).toBe(false);
    expect(isInsideFolder('D:\\x', '')).toBe(false);
  });
});
