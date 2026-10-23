import fs from 'node:fs';
import path from 'node:path';
import { jest } from '@jest/globals';

const TOKEN = 'made-up-secret-138 xai-madeup-token guest-link-tok_madeup';
const failure = () => Object.assign(new Error(TOKEN), { code: 'EPIPE' });

jest.unstable_mockModule('../server/grokSignin/login.js', () => ({
  startGrokLogin: async () => { throw failure(); },
  grokLoginState: () => null,
  grokLogout: async () => { throw failure(); },
}));

const { onLogRecord } = await import('../server/logger.js');
const { grokSigninRouter } = await import('../server/routes/grokSignin.js');
const { sendError } = await import('../server/routes/shareLinkHttp.js');
const express = (await import('express')).default;
const request = (await import('supertest')).default;

function capture() {
  const records = [];
  const stop = onLogRecord((r) => records.push(r));
  return { records, stop };
}

test('a failed Grok sign-in logs a code, never the error text', async () => {
  const app = express();
  app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  app.use(grokSigninRouter);
  const { records, stop } = capture();
  await request(app).post('/login');
  await request(app).post('/logout');
  stop();
  const text = JSON.stringify(records);
  expect(text).toContain('grok sign-in could not start');
  expect(text).toContain('grok sign-out failed');
  expect(text).toContain('EPIPE');
  expect(text).not.toContain('made-up-secret-138');
});

test('a failed guest-link request logs a code, never the error text', () => {
  const { records, stop } = capture();
  const res = { status() { return this; }, json() { return this; } };
  sendError(res, failure());
  stop();
  const text = JSON.stringify(records);
  expect(text).toContain('share link request failed');
  expect(text).toContain('EPIPE');
  expect(text).not.toContain('made-up-secret-138');
  expect(text).not.toContain('guest-link-tok_madeup');
});

test('no log call under server/routes passes the error text', () => {
  const dir = path.resolve('server/routes');
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.js'));
  const leaks = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/log\.(info|warn|error|debug)\(.*\b(err|error|e)\??\.message/.test(line)) leaks.push(`${file}:${i + 1}`);
    });
  }
  expect(leaks).toEqual([]);
});
