import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { ideasRouter, setStatusFrontmatter, resolveIdeaFile } from '../server/routes/ideas.js';

// Hermetic inbox: the route reads CENSAI_IDEAS_DIR lazily, so these tests never
// depend on (or write to) the repo's own .team/ideas — which the public
// self-host export does not ship at all.
const CARD = '---\ntitle: Fixture idea\ndate: 2026-10-01\nsource: test\nstatus: parked\nphase: 1\ntags: [canvas, test]\n---\n\nBody\n';
let ideasRoot;
beforeAll(() => {
  ideasRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-ideas-test-'));
  fs.writeFileSync(path.join(ideasRoot, '2026-10-01-fixture-idea.md'), CARD);
  process.env.CENSAI_IDEAS_DIR = ideasRoot;
});
afterAll(() => {
  delete process.env.CENSAI_IDEAS_DIR;
  fs.rmSync(ideasRoot, { recursive: true, force: true });
});

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/ideas', ideasRouter);
  return a;
}

describe('idea frontmatter helpers', () => {
  test('setStatusFrontmatter replaces an existing status line', () => {
    const out = setStatusFrontmatter('---\ntitle: T\nstatus: parked\n---\n\nBody\n', 'placed');
    expect(out).toContain('status: placed');
    expect(out).not.toContain('status: parked');
    expect(out).toContain('Body');
  });

  test('setStatusFrontmatter inserts a missing status line', () => {
    const out = setStatusFrontmatter('---\ntitle: T\nphase: 1\n---\n\nBody\n', 'killed');
    expect(out).toContain('status: killed');
  });

  test('setStatusFrontmatter returns null without frontmatter', () => {
    expect(setStatusFrontmatter('Just some notes\n', 'placed')).toBeNull();
  });

  test('resolveIdeaFile accepts basenames and rejects traversal', () => {
    expect(() => resolveIdeaFile('2026-06-06-x.md')).not.toThrow();
    expect(() => resolveIdeaFile('../x.md')).toThrow();
    expect(() => resolveIdeaFile('/etc/x.md')).toThrow();
    expect(() => resolveIdeaFile('sub/dir.md')).toThrow();
  });
});

describe('GET /api/ideas', () => {
  test('returns the deterministic index cards', async () => {
    const res = await request(app()).get('/api/ideas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
    expect(res.body.cards.length).toBeGreaterThan(0);
    expect(res.body.summary).toBeDefined();
    expect(res.body.cards[0]).toEqual(expect.objectContaining({ title: 'Fixture idea', status: 'parked' }));
  });

  test('a missing ideas folder is an empty inbox, not a 500 (fresh self-host install)', async () => {
    process.env.CENSAI_IDEAS_DIR = path.join(ideasRoot, 'does-not-exist');
    try {
      const res = await request(app()).get('/api/ideas');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        cards: [], invalid: [], raw: [],
        summary: { filesScanned: 0, validCards: 0, invalidCards: 0, rawItems: 0 },
      });
    } finally {
      process.env.CENSAI_IDEAS_DIR = ideasRoot;
    }
  });
});

describe('POST /api/ideas/disposition round trip', () => {
  test('writes the new status into the card frontmatter and returns the refreshed card', async () => {
    const res = await request(app()).post('/api/ideas/disposition')
      .send({ file: '2026-10-01-fixture-idea.md', disposition: 'placed' });
    expect(res.status).toBe(200);
    expect(res.body.card).toEqual(expect.objectContaining({ status: 'placed' }));
    expect(fs.readFileSync(path.join(ideasRoot, '2026-10-01-fixture-idea.md'), 'utf8')).toContain('status: placed');
  });
});

describe('POST /api/ideas/disposition validation', () => {
  test('400 when file is missing or disposition is unknown', async () => {
    const a = app();
    const r1 = await request(a).post('/api/ideas/disposition').send({ disposition: 'placed' });
    expect(r1.status).toBe(400);
    const r2 = await request(a).post('/api/ideas/disposition').send({ file: 'x.md', disposition: 'nope' });
    expect(r2.status).toBe(400);
  });

  test('403 for traversal, 404 for missing files', async () => {
    const a = app();
    const r1 = await request(a).post('/api/ideas/disposition').send({ file: '../x.md', disposition: 'placed' });
    expect(r1.status).toBe(403);
    const r2 = await request(a).post('/api/ideas/disposition').send({ file: 'no-such-idea-file.md', disposition: 'placed' });
    expect(r2.status).toBe(404);
  });
});
