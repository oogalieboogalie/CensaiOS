import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const allow = { value: true };
jest.unstable_mockModule('./access.js', () => ({ canReadAppLog: jest.fn(async () => allow.value) }));

const { readRecentLog, sourceOf } = await import('./readLog.js');
const { installConsoleCapture } = await import('./consoleCapture.js');
const { onLogRecord } = await import('../logger.js');
const { appLogRouter } = await import('../routes/appLog.js');
const { handleReadAppLog } = await import('../tools/handlers/appLog.js');

const NOW = Date.parse('2026-10-17T23:00:00Z');
const at = (min) => new Date(NOW - min * 60_000).toISOString();

function logDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'applog-'));
  for (const [name, records] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n');
  }
  return dir;
}

describe('readRecentLog', () => {
  const dir = logDir({
    'homebase-2026-10-16.jsonl': [{ time: '2026-10-16T22:00:00Z', level: 'info', namespace: 'boot', message: 'yesterday' }],
    'homebase-2026-10-17.jsonl': [
      { time: at(90), level: 'error', namespace: 'todos', message: 'old error' },
      'not json',
      { time: at(5), level: 'info', namespace: 'console', message: 'plain console line' },
      { time: at(4), level: 'warn', namespace: 'browser:todos', message: 'POST /api/todos returned 403' },
      { time: at(3), level: 'error', namespace: 'chat', message: 'key sk-ant-abcdefghijklmnop for alma@example.com' },
    ],
    'notes.txt': ['ignored'],
  });

  test('newest lines last, across days, bad lines skipped', async () => {
    const { lines, file } = await readRecentLog({ dir, now: NOW });
    expect(file).toBe('homebase-2026-10-17.jsonl');
    expect(lines[0]).toContain('yesterday');
    expect(lines.at(-1)).toContain('[chat]');
    expect(lines).toHaveLength(5);
  });

  test('filters by level, minutes, source and words', async () => {
    expect((await readRecentLog({ dir, now: NOW, level: 'warn', minutes: 30 })).lines).toHaveLength(2);
    expect((await readRecentLog({ dir, now: NOW, source: 'browser' })).lines[0]).toContain('returned 403');
    expect((await readRecentLog({ dir, now: NOW, source: 'console' })).lines).toHaveLength(1);
    expect((await readRecentLog({ dir, now: NOW, search: 'OLD ERROR' })).lines).toHaveLength(1);
    expect((await readRecentLog({ dir, now: NOW, lines: 2 })).lines).toHaveLength(2);
  });

  test('lines come out scrubbed even if an old file was not', async () => {
    const { lines } = await readRecentLog({ dir, now: NOW, search: 'chat' });
    expect(lines[0]).not.toMatch(/sk-ant-|alma@example\.com/);
    expect(lines[0]).toContain('[key]');
  });

  test('no folder means no file, not an error', async () => {
    expect(await readRecentLog({ dir: path.join(dir, 'missing') })).toMatchObject({ file: null, lines: [] });
  });

  test('sources', () => {
    expect(sourceOf({ namespace: 'browser:chat' })).toBe('browser');
    expect(sourceOf({ namespace: 'console' })).toBe('console');
    expect(sourceOf({ namespace: 'self-fix' })).toBe('server');
  });
});

describe('installConsoleCapture', () => {
  test('still prints, and copies the line to the log once', () => {
    const printed = [];
    const written = [];
    const target = { log: (...a) => printed.push(a), error: (...a) => printed.push(a) };
    installConsoleCapture(target, (record) => written.push(record));
    target.log('listening on %d', 3001);
    target.error(new Error('boom'));
    target.log('   ');
    expect(printed).toHaveLength(3);
    expect(written).toEqual([
      expect.objectContaining({ level: 'info', namespace: 'console', message: 'listening on 3001' }),
      expect.objectContaining({ level: 'error', message: expect.stringContaining('boom') }),
    ]);
  });

  test('a write that logs again does not loop', () => {
    const target = { warn: () => {} };
    let calls = 0;
    installConsoleCapture(target, () => { calls += 1; target.warn('again'); });
    target.warn('first');
    expect(calls).toBe(1);
  });
});

describe('/api/logs', () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = req.get('x-user') ? { userId: Number(req.get('x-user')) } : {}; next(); });
  app.use('/api/logs', appLogRouter);

  test('the board writes its errors into the log', async () => {
    const seen = [];
    const stop = onLogRecord((r) => seen.push(r));
    const res = await request(app).post('/api/logs/browser').set('x-user', '2').send({
      entries: [
        { level: 'error', message: 'Cannot read x', where: 'todos<script>', detail: 'at a.js:1' },
        { level: 'nonsense', message: 'odd level' },
      ],
    });
    stop();
    expect(res.status).toBe(202);
    expect(seen[0]).toMatchObject({ level: 'error', namespace: 'browser:todosscript', message: 'Cannot read x' });
    expect(seen[0].meta).toMatchObject({ user: 2, detail: 'at a.js:1' });
    expect(seen[1].level).toBe('info');
  });

  test('signed-out browsers cannot write', async () => {
    expect((await request(app).post('/api/logs/browser').send({ entries: [{ message: 'x' }] })).status).toBe(401);
  });

  test('a flood is cut off', async () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({ level: 'warn', message: `w${i}` }));
    let kept = 0;
    for (let i = 0; i < 4; i += 1) kept += (await request(app).post('/api/logs/browser').set('x-user', '9').send({ entries })).body.kept;
    expect(kept).toBe(120);
  });

  test('reading follows the access rule', async () => {
    allow.value = true;
    const ok = await request(app).get('/api/logs/recent?lines=5').set('x-user', '1');
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.lines)).toBe(true);
    allow.value = false;
    const no = await request(app).get('/api/logs/recent').set('x-user', '3');
    expect(no.status).toBe(403);
    expect(no.body.reason).toBe('owner-only');
    allow.value = true;
  });
});

describe('read_app_log tool', () => {
  test('reads with sensible defaults and says when there is nothing', async () => {
    const read = jest.fn(async () => ({ file: 'homebase-2026-10-17.jsonl', lines: ['a', 'b'] }));
    const out = await handleReadAppLog({ level: 'warn' }, { userId: 2 }, { read, allowed: async () => true });
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ minutes: 30, lines: 80, level: 'warn' }));
    expect(out).toContain('2 line(s)');
    const empty = await handleReadAppLog({}, {}, { read: async () => ({ file: 'f', lines: [] }), allowed: async () => true });
    expect(empty).toMatch(/Nothing in the log/);
    const none = await handleReadAppLog({}, {}, { read: async () => ({ file: null, lines: [] }), allowed: async () => true });
    expect(none).toMatch(/no log file yet/);
    expect(await handleReadAppLog({}, {}, { read, allowed: async () => false })).toMatch(/owner/);
  });
});
