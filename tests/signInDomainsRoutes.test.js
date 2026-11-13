// Who can sign up, the admin side: only an admin reads or changes the list,
// and every change is what the sign-in checks use straight away.
import express from 'express';
import request from 'supertest';
import { createSignInDomainsRouter } from '../server/signInDomains/routes.js';
import { __test__, currentSignInDomains } from '../server/signInDomains/store.js';

/** An in-memory stand-in for users + sign_in_domains. */
function fakeDb({ roles = { 1: 'admin', 2: 'user' } } = {}) {
  const domains = new Map();
  return {
    domains,
    query: async (sql, params = []) => {
      if (sql.startsWith('SELECT role FROM users')) return { rows: roles[params[0]] ? [{ role: roles[params[0]] }] : [] };
      if (sql.startsWith('INSERT INTO sign_in_domains')) {
        if (!domains.has(params[0])) domains.set(params[0], params[1]);
        return { rowCount: 1 };
      }
      if (sql.startsWith('DELETE FROM sign_in_domains')) return { rowCount: domains.delete(params[0]) ? 1 : 0 };
      if (sql.trim().startsWith('SELECT d.domain')) {
        return { rows: [...domains.keys()].sort().map((domain) => ({ domain, addedAt: null, addedByName: 'Owner', addedByEmail: null })) };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

function app({ session = { userId: 1 }, db = fakeDb() } = {}) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { req.session = session; next(); });
  instance.use('/api/sign-in-domains', createSignInDomainsRouter({ db }));
  return { instance, db };
}

afterEach(() => __test__.setCurrent([]));

test('signed out gets a 401', async () => {
  const res = await request(app({ session: {} }).instance).get('/api/sign-in-domains');
  expect(res.status).toBe(401);
});

test('someone who is not an admin can neither read nor change the list', async () => {
  const { instance, db } = app({ session: { userId: 2 } });
  expect((await request(instance).get('/api/sign-in-domains')).status).toBe(403);
  const res = await request(instance).post('/api/sign-in-domains').send({ domain: 'evil.com' });
  expect(res.status).toBe(403);
  expect(db.domains.size).toBe(0);
});

test('an admin adds a domain, it takes effect at once, and removes it again', async () => {
  const { instance, db } = app();
  const added = await request(instance).post('/api/sign-in-domains').send({ domain: '@Censai.App' });
  expect(added.status).toBe(201);
  expect(added.body.domain).toBe('censai.app');
  expect(added.body.domains.map((d) => d.domain)).toEqual(['censai.app']);
  expect(db.domains.get('censai.app')).toBe(1);
  expect(currentSignInDomains().has('censai.app')).toBe(true);

  const listed = await request(instance).get('/api/sign-in-domains');
  expect(listed.body.domains.map((d) => d.domain)).toEqual(['censai.app']);
  expect(listed.body.settingsFile).toEqual(expect.objectContaining({ allowedUsers: expect.any(Array), adminEmails: expect.any(Array) }));

  const removed = await request(instance).delete('/api/sign-in-domains/censai.app');
  expect(removed.body).toMatchObject({ removed: true, domains: [] });
  expect(currentSignInDomains().has('censai.app')).toBe(false);
});

test('a bad or public-mail domain gets a 400 in plain words and is not saved', async () => {
  const { instance, db } = app();
  const bad = await request(instance).post('/api/sign-in-domains').send({ domain: 'not a domain' });
  expect(bad.status).toBe(400);
  expect(bad.body.error).toMatch(/censai\.app/);
  const gmail = await request(instance).post('/api/sign-in-domains').send({ domain: 'gmail.com' });
  expect(gmail.status).toBe(400);
  expect(db.domains.size).toBe(0);
});
