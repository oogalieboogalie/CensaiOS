// Raw error text stays out of answers and log lines (item 104). A database or
// provider message can repeat an email, a key or a table name, so the browser
// gets a fixed sentence plus a short code, and the app log gets a reason and
// a code. Made-up people only: Pat at Testco.

import { jest } from '@jest/globals';
import fs from 'node:fs';
import request from 'supertest';
import express from 'express';

const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query, on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true, setDbReady: () => {} }));
jest.unstable_mockModule('googleapis', () => ({
  google: { auth: { OAuth2: jest.fn(() => ({})) }, oauth2: jest.fn(() => ({ userinfo: { get: jest.fn() } })) },
}));
jest.unstable_mockModule('../server/credentials/oauthStore.js', () => ({ saveOAuthCredential: jest.fn() }));
jest.unstable_mockModule('../server/security/byokPolicy.js', () => ({
  getClientAccessPolicy: () => ({ requiresUserApiKey: false }),
}));

const { authRouter } = await import('../server/routes/auth.js');
const { safeErrorCode } = await import('../server/security/errorCode.js');

const RAW = 'duplicate key value violates unique constraint "users_email_key" for pat@testco.example';
const dbError = () => Object.assign(new Error(RAW), { code: '23505' });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { regenerate: (cb) => cb && cb(), save: (cb) => cb && cb() };
    next();
  });
  app.use('/api/auth', authRouter);
  return app;
}

beforeAll(() => { process.env.CENSAI_MODE = 'local_desktop'; });
afterAll(() => { delete process.env.CENSAI_MODE; });

test('a short code comes from the error\'s code or status, never its message', () => {
  expect(safeErrorCode(dbError())).toBe('23505');
  expect(safeErrorCode({ statusCode: 429 })).toBe('429');
  expect(safeErrorCode({ response: { data: { error: 'invalid_grant' } } })).toBe('invalid_grant');
  expect(safeErrorCode({ code: 'user pat@testco.example not found' })).toBeNull();
  expect(safeErrorCode(new Error(RAW))).toBeNull();
  expect(safeErrorCode(undefined)).toBeNull();
});

test('a failed sign-in on this computer answers a fixed sentence and a code', async () => {
  query.mockRejectedValueOnce(dbError());
  const res = await request(buildApp()).post('/api/auth/local').send({ name: 'Pat' });
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Sign-in on this computer failed. Please try again.', code: 'local_signin_failed' });
  expect(JSON.stringify(res.body)).not.toMatch(/pat@|users_email_key/);
});

test('the four leftover places no longer print or send an error\'s message', () => {
  const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const execution = read('server/task-worker/execution.js');
  for (const line of execution.split('\n').filter((l) => /log\.(warn|error|info)\(/.test(l))) {
    expect(line).not.toMatch(/\.message/);
  }
  expect(read('server/routes/auth.js')).not.toMatch(/json\(\{ error: err\.message/);
  for (const file of ['server/routes/chat/handlers.js', 'server/routes/chat/savedChatKey.js']) {
    expect(read(file)).not.toMatch(/console\.(log|warn|error)\(/);
  }
});
