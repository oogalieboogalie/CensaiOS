import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// The GitHub window keeps a read file for a minute. Pat Example's key can read
// a private project; Sam Example's key cannot. Sam must not get Pat's kept copy.
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })) } }));

const { readFile } = await import('../server/routes/github/content.js');
const { githubFileCache, githubBranchCache } = await import('../server/routes/github/shared.js');

const PAT_KEY = 'made-up-key-pat';
const SAM_KEY = 'made-up-key-sam';

beforeEach(() => {
  githubFileCache.clear();
  githubBranchCache.clear();
  global.fetch = jest.fn(async (url, init = {}) => {
    const allowed = init.headers?.Authorization === `token ${PAT_KEY}`;
    if (!allowed) return { ok: false, status: 404, text: async () => 'Not Found', json: async () => ({}) };
    return String(url).includes('raw.githubusercontent.com')
      ? { ok: true, status: 200, text: async () => 'Made-up private notes' }
      : { ok: true, status: 200, json: async () => ({ default_branch: 'trunk' }) };
  });
});
afterAll(() => { delete global.fetch; });

function app(token) {
  const a = express();
  a.use((req, _res, next) => { req.session = { userId: 7 }; req.githubToken = token; next(); });
  a.get('/api/github/file', readFile);
  return a;
}
const read = (token, query) => request(app(token)).get('/api/github/file').query({ repo: 'made-up/private', path: 'notes.md', ...query });

describe('kept GitHub files follow the key that read them', () => {
  test("Sam's key does not get the copy Pat's key read a moment ago", async () => {
    expect((await read(PAT_KEY, { branch: 'main' }).expect(200)).body.content).toBe('Made-up private notes');
    const sam = await read(SAM_KEY, { branch: 'main' });
    expect(sam.status).toBe(404);
    expect(sam.body.content).toBeUndefined();
  });

  test('Pat still gets the kept copy back', async () => {
    await read(PAT_KEY, { branch: 'main' }).expect(200);
    expect((await read(PAT_KEY, { branch: 'main' }).expect(200)).body.cached).toBe(true);
  });

  test("the main branch name Pat's key learned is not handed to Sam's key", async () => {
    expect((await read(PAT_KEY, {}).expect(200)).body.branch).toBe('trunk');
    const sam = await read(SAM_KEY, {});
    expect(sam.status).not.toBe(200);
    expect(sam.body.content).toBeUndefined();
  });
});
