import express from 'express';
import request from 'supertest';
import { setupMiddleware } from '../server/boot/middleware.js';
import { isPlaygroundRead } from '../server/boot/playgroundAssets.js';

// Regression: the Game Playground runner is a sandboxed frame, so the browser
// sends `Origin: null` when love.js fetches love.wasm. The app's CORS check
// refused that origin, so LÖVE games froze on "Starting LÖVE…" in the real
// app (Docker, desktop) while the dev server, which has no such check, worked.
describe('Game Playground files and the app CORS check', () => {
  const app = express();
  setupMiddleware(app);
  app.get('/playground/vendor/love/love.wasm', (req, res) => res.type('application/wasm').send('wasm'));
  app.get('/api/thing', (req, res) => res.json({ ok: true }));
  app.post('/playground/thing', (req, res) => res.json({ ok: true }));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message })); // eslint-disable-line no-unused-vars

  test('a sandboxed frame can read the game engine files', async () => {
    const res = await request(app).get('/playground/vendor/love/love.wasm').set('Origin', 'null');
    expect(res.status).toBe(200);
  });

  test('the rest of the app still refuses that origin', async () => {
    expect((await request(app).get('/api/thing').set('Origin', 'null')).status).toBe(500);
    expect((await request(app).post('/playground/thing').set('Origin', 'null')).status).not.toBe(200);
  });

  test('only reads under /playground/ skip the check', () => {
    expect(isPlaygroundRead({ method: 'GET', path: '/playground/runner.js' })).toBe(true);
    expect(isPlaygroundRead({ method: 'HEAD', path: '/playground/vendor/love/love.js' })).toBe(true);
    expect(isPlaygroundRead({ method: 'POST', path: '/playground/runner.js' })).toBe(false);
    expect(isPlaygroundRead({ method: 'GET', path: '/api/playground/x' })).toBe(false);
  });
});
