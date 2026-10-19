import express from 'express';
import request from 'supertest';
import { redactUrl } from '../server/logger.js';
import { requestLogger } from '../server/boot/requestLog.js';

const INVITE_CODE = 'Q2hlY2tUaGlzSW52aXRlQ29kZTEyMzQ1';
const PAIR_CODE = 'pairCODE-0123456789abcdef';

function appWithLog() {
  const lines = [];
  const log = Object.fromEntries(['error', 'warn', 'info', 'debug'].map((level) => [level, (line) => lines.push(`${level} ${line}`)]));
  const app = express();
  app.use(requestLogger(log));
  app.get('/api/invites/preview', (req, res) => res.status(410).json({ error: 'used' }));
  app.get('/', (req, res) => res.send('ok'));
  app.get('/api/workspaces', (req, res) => res.json({ ok: true }));
  return { app, lines };
}

describe('request log keeps codes out of the app log', () => {
  test('a raw invite code and a raw pair code never reach the log', async () => {
    const { app, lines } = appWithLog();
    await request(app).get(`/api/invites/preview?code=${INVITE_CODE}`);
    await request(app).get(`/?pair=${PAIR_CODE}`);
    await request(app).get(`/?invite=${INVITE_CODE}&workspace=w1`);
    const text = lines.join('\n');
    expect(text).not.toContain(INVITE_CODE);
    expect(text).not.toContain(PAIR_CODE);
    // The path and the outcome are still there.
    expect(text).toContain('GET /api/invites/preview?code=[redacted] 410');
    expect(text).toContain('GET /?pair=[redacted] 200');
    expect(text).toContain('GET /?invite=[redacted]&workspace=w1 200');
  });

  test('share, lesson and Legion link codes in the path never reach the log', async () => {
    const SHARE_TOKEN = 'shareTOKEN-abcdefghijklmnopqrstuvwxyz0123';
    const CLASS_TOKEN = 'classTOKEN-zyxwvutsrqponmlkjihgfedcba9876';
    const LEGION_TOKEN = 'legionTOKEN-0011223344556677';
    const { app, lines } = appWithLog();
    app.get('/api/guest/links/:token', (req, res) => res.json({}));
    app.post('/api/guest/links/:token/join', (req, res) => res.json({}));
    app.get('/api/guest/classes/:token', (req, res) => res.json({}));
    app.get('/api/legion-view/:id/:token/*rest', (req, res) => res.send('ok'));
    await request(app).get(`/api/guest/links/${SHARE_TOKEN}`);
    await request(app).post(`/api/guest/links/${SHARE_TOKEN}/join`);
    await request(app).get(`/api/guest/classes/${CLASS_TOKEN}`);
    await request(app).get(`/?class=${CLASS_TOKEN}`);
    await request(app).get(`/api/legion-view/run-7/${LEGION_TOKEN}/index.html`);
    const text = lines.join('\n');
    for (const secret of [SHARE_TOKEN, CLASS_TOKEN, LEGION_TOKEN]) expect(text).not.toContain(secret);
    expect(text).toContain('GET /api/guest/links/[redacted] 200');
    expect(text).toContain('POST /api/guest/links/[redacted]/join 200');
    expect(text).toContain('GET /api/guest/classes/[redacted] 200');
    expect(text).toContain('GET /?class=[redacted]');
    expect(text).toContain('GET /api/legion-view/run-7/[redacted]/index.html 200');
  });

  test('ordinary addresses are logged as they are', async () => {
    const { app, lines } = appWithLog();
    await request(app).get('/api/workspaces?limit=5');
    expect(lines.join('\n')).toContain('GET /api/workspaces?limit=5 200');
  });

  test('tokens, keys and join links are hidden too', () => {
    expect(redactUrl('/?join=abc123')).toBe('/?join=[redacted]');
    expect(redactUrl('/ws?token=t0k&guest=1')).toBe('/ws?token=[redacted]&guest=1');
    expect(redactUrl('/x?api_key=k&access_token=a&client_secret=s')).toBe('/x?api_key=[redacted]&access_token=[redacted]&client_secret=[redacted]');
    expect(redactUrl('/confirm-email?Token=t')).toBe('/confirm-email?Token=[redacted]');
    expect(redactUrl('/plain/path')).toBe('/plain/path');
    expect(redactUrl(undefined)).toBe('');
  });
});
