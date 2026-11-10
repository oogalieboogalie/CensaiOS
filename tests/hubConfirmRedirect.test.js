import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import { hubConfirmRedirect, HUB_CONFIRM_ROUTE } from '../server/hubAccounts/confirmRedirect.js';
import { mountRouters } from '../server/boot/routers.js';

const TOKEN = 'ab'.repeat(32);

function appWithRedirect() {
  const app = express();
  app.get('/confirm-email', hubConfirmRedirect);
  return app;
}

describe('hub sign-up confirmation link', () => {
  test('the emailed /confirm-email link goes on to the route that confirms', async () => {
    const res = await request(appWithRedirect()).get(`/confirm-email?token=${TOKEN}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${HUB_CONFIRM_ROUTE}?token=${TOKEN}`);
  });

  test.each([
    ['no token', '/confirm-email'],
    ['a token with markup', '/confirm-email?token=%3Cscript%3E'],
    ['a repeated token', `/confirm-email?token=${TOKEN}&token=${TOKEN}`],
    ['a header-splitting token', '/confirm-email?token=ab%0d%0aSet-Cookie:x=1'],
  ])('%s goes to the route without it', async (_label, url) => {
    const res = await request(appWithRedirect()).get(url);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(HUB_CONFIRM_ROUTE);
  });

  test('the real router table answers /confirm-email before any page fallback', async () => {
    const app = express();
    app.use((req, _res, next) => { req.session = {}; next(); });
    mountRouters(app);
    app.get(/.*/, (_req, res) => res.send('page'));
    const res = await request(app).get(`/confirm-email?token=${TOKEN}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${HUB_CONFIRM_ROUTE}?token=${TOKEN}`);
  });

  test('the dev server forwards the link to the API server', () => {
    expect(fs.readFileSync('vite.config.js', 'utf8')).toMatch(/'\/confirm-email': 'http:\/\/127\.0\.0\.1:3001'/);
  });
});
