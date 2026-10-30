import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// A GitHub project's files on the board: one that holds keys by its name (a
// .env, a key file) opens only for this computer's owner, as in a project on
// this computer. Pat Example owns the computer; Sam Example is a teammate.
// GitHub is made up here: every read answers with the path it was asked for.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const { readFile } = await import('../server/routes/github/content.js');
const { githubFileCache } = await import('../server/routes/github/shared.js');
const { FILE_PROBLEMS } = await import('../shared/files/fileProblems.js');

const RAW = 'https://raw.githubusercontent.com/made-up/repo/main/';
const fetched = [];
beforeEach(() => {
  fetched.length = 0;
  githubFileCache.clear();
  global.fetch = jest.fn(async (url) => {
    fetched.push(String(url));
    return { ok: true, status: 200, text: async () => `Made-up words of ${String(url).slice(RAW.length)}` };
  });
});
afterAll(() => { delete global.fetch; });

function app(userId) {
  const a = express();
  a.use((req, _res, next) => { req.session = { userId }; req.githubToken = 'made-up-token'; next(); });
  a.get('/api/github/file', readFile);
  return a;
}
const read = (who, path, repo = 'made-up/repo') => request(app(who)).get('/api/github/file').query({ repo, path, branch: 'main' });
const OWNER_ONLY = { error: FILE_PROBLEMS.ownerOnly, reason: 'ownerOnly' };

describe('a file that holds keys in a GitHub project', () => {
  test('Sam gets plain words, however the path is spelled, and GitHub is never asked', async () => {
    for (const path of ['.env', 'config/made-up-server.key', 'docs/../.env', '.env.', 'made-up/.env/.', 'made-up\\.env', '.env?x=.md', 'notes.md#.env']) {
      expect((await read(SAM, path).expect(403)).body).toEqual(OWNER_ONLY);
    }
    expect(fetched).toEqual([]);
  });

  test('Pat opens it, marked as Pat\'s alone so the window keeps it off the shared board', async () => {
    const res = await read(PAT, '.env').expect(200);
    expect(res.body).toMatchObject({ content: 'Made-up words of .env', path: '.env', ownerOnly: true });
    expect(fetched).toEqual([`${RAW}.env`]);
  });

  test("Pat's kept copy is not handed to Sam", async () => {
    await read(PAT, '.env').expect(200);
    expect((await read(SAM, '.env').expect(403)).body).toEqual(OWNER_ONLY);
    const cached = await read(PAT, '.env').expect(200);
    expect(cached.body).toMatchObject({ cached: true, ownerOnly: true });
  });
});

test('an ordinary file or an example file opens for both, with no such mark', async () => {
  for (const who of [PAT, SAM]) {
    for (const path of ['notes.md', '.env.example']) {
      const res = await read(who, path).expect(200);
      expect(res.body.content).toBe(`Made-up words of ${path}`);
      expect(res.body.ownerOnly).toBeUndefined();
    }
  }
});

test('every part of the path is spelled out, so GitHub reads the name that was checked', async () => {
  await read(SAM, '%2eenv').expect(200);
  await read(SAM, 'made up/notes#1.md').expect(200);
  expect(fetched).toEqual([`${RAW}%252eenv`, `${RAW}made%20up/notes%231.md`]);
});

test('a repo that is not owner/name, or a path that climbs out, is refused before GitHub is asked', async () => {
  for (const repo of ['made-up/repo/../other', 'made-up', 'made-up/repo?ref=x', 'https://example.invalid/x', '../made-up', 'made-up/..']) {
    await read(PAT, 'notes.md', repo).expect(400);
  }
  for (const path of ['../notes.md', '.', 'docs/../../notes.md']) {
    await read(PAT, path).expect(400);
  }
  expect(fetched).toEqual([]);
});
