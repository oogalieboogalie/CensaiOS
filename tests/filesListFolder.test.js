import { jest } from '@jest/globals';
import { listFolder, searchFiles } from '../src/components/files/listFolder.js';

const answer = (status, body) => jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

afterEach(() => { delete globalThis.fetch; });

describe('Files window explains a folder it cannot list', () => {
  test('a GitHub folder when GitHub is not connected says so instead of looking empty', async () => {
    globalThis.fetch = answer(401, { error: 'GitHub is not connected.' });
    await expect(listFolder('/api/github/browse?repo=a/b&path=')).rejects.toThrow('GitHub is not connected.');
  });

  test('a listable folder returns its children', async () => {
    globalThis.fetch = answer(200, { children: [{ name: 'notes.md' }] });
    await expect(listFolder('/api/files/browse?path=x')).resolves.toEqual([{ name: 'notes.md' }]);
  });

  test('a refused search shows the reason, not "No matches"', async () => {
    globalThis.fetch = answer(403, { error: 'Access denied: outside your open projects.' });
    await expect(searchFiles('/api/files/search?q=a')).rejects.toThrow('Access denied');
  });
});
