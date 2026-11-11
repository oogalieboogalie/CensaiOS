import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createConfirmationStore } from '../server/confirmations/store.js';
import { createConfirmationsRouter } from '../server/routes/confirmations.js';

function tempFile() {
  return path.join(os.tmpdir(), `confirmations-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

describe('confirmations list', () => {
  test('starts empty, keeps one copy of the same ask, and drops it when it is done', () => {
    const file = tempFile();
    const store = createConfirmationStore({ file, now: () => '2026-11-11T12:00:00.000Z' });
    expect(store.listOpen()).toEqual([]);
    const first = store.addAsk({
      title: 'The shop DNS record still needs you',
      detail: 'Wave of 11 Nov. Nobody else can change the registrar.',
    });
    const again = store.addAsk({
      title: 'The shop DNS record still needs you',
      detail: 'Wave of 11 Nov. Nobody else can change the registrar.',
    });
    expect(again.id).toBe(first.id);
    expect(store.listOpen()).toHaveLength(1);
    expect(store.listOpen()[0].actionLabel).toBe('Mark done');
    expect(store.markDone(first.id).status).toBe('done');
    expect(store.listOpen()).toEqual([]);
    fs.rmSync(file, { force: true });
  });

  test('a risky pull request stays done for that commit and comes back if the commit changes', () => {
    const file = tempFile();
    const store = createConfirmationStore({ file, now: () => '2026-11-11T12:00:00.000Z' });
    store.upsertRisky({
      number: 12,
      sha: 'a'.repeat(40),
      title: 'Pull request 12 needs you',
      detail: 'It changes dependencies. The merge bot will not merge it.',
      actionLabel: 'Mark pull request 12 handled',
      url: 'https://github.com/acme/widgets/pull/12',
    });
    store.markDone('pr-12');
    const same = store.upsertRisky({
      number: 12, sha: 'a'.repeat(40), title: 'Pull request 12 needs you', detail: 'same', url: 'not a url',
    });
    expect(same.status).toBe('done');
    expect(store.listOpen()).toEqual([]);
    const moved = store.upsertRisky({
      number: 12, sha: 'b'.repeat(40), title: 'Pull request 12 needs you', detail: 'new', url: 'javascript:alert(1)',
    });
    expect(moved.status).toBe('open');
    expect(moved.url).toBe('');
    store.settleClosed([4]);
    expect(store.listOpen().some((item) => item.id === 'pr-12')).toBe(false);
    store.addAsk({ title: 'Keep this ask' });
    store.settleClosed([]);
    expect(store.listOpen().map((item) => item.title)).toEqual(['Keep this ask']);
    fs.rmSync(file, { force: true });
  });

  test('a blank ask is refused and a broken file is not replaced', () => {
    const file = tempFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{');
    const store = createConfirmationStore({ file });
    expect(() => store.listOpen()).toThrow(expect.objectContaining({ code: 'confirmations-unreadable' }));
    expect(() => store.addAsk({ title: '   ' })).toThrow(expect.objectContaining({ code: 'confirmations-title' }));
    expect(() => store.addAsk({ title: 'A real ask' })).toThrow(expect.objectContaining({ code: 'confirmations-unreadable' }));
    expect(fs.readFileSync(file, 'utf8')).toBe('{');
    fs.rmSync(file, { force: true });
  });
});

describe('confirmations route', () => {
  function appFor(store) {
    const app = express();
    app.use(express.json());
    const seen = { hits: [] };
    app.use(createConfirmationsRouter({
      store,
      requireOwner: (req, _res, next) => { seen.hits.push(`${req.method} ${req.path}`); next(); },
    }));
    return { app, seen };
  }

  test('an empty list, then one ask, then nothing after it is marked done', async () => {
    const file = tempFile();
    const { app, seen } = appFor(createConfirmationStore({ file, now: () => '2026-11-11T12:00:00.000Z' }));
    const empty = await request(app).get('/confirmations');
    expect(empty.status).toBe(200);
    expect(empty.body.items).toEqual([]);

    const added = await request(app).post('/confirmations').send({
      title: 'The shop DNS record still needs you',
      detail: 'Wave of 11 Nov.',
    });
    expect(added.status).toBe(201);
    expect(added.body.item.actionLabel).toBe('Mark done');

    const filled = await request(app).get('/confirmations');
    expect(filled.body.items).toHaveLength(1);
    expect(filled.body.items[0].title).toBe('The shop DNS record still needs you');

    const done = await request(app).post(`/confirmations/${added.body.item.id}/done`);
    expect(done.status).toBe(200);
    const after = await request(app).get('/confirmations');
    expect(after.body.items).toEqual([]);
    expect(seen.hits).toEqual([
      'GET /confirmations',
      'POST /confirmations',
      'GET /confirmations',
      `POST /confirmations/${added.body.item.id}/done`,
      'GET /confirmations',
    ]);
    fs.rmSync(file, { force: true });
  });

  test('a missing sentence is a plain error', async () => {
    const { app } = appFor(createConfirmationStore({ file: tempFile() }));
    const res = await request(app).post('/confirmations').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Write one sentence about what you need.');
  });
});
