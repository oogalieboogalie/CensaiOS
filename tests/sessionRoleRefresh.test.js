import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { createSessionRoleRefresh } from '../server/security/sessionRole.js';

// A made-up users table: Pat (id 7) starts as a plain user.
function fakeDb(roles) {
  return {
    calls: 0,
    async query(sql, [id]) {
      this.calls += 1;
      if (roles.fail) throw Object.assign(new Error('db down'), { code: 'ECONNREFUSED' });
      return { rows: id in roles ? [{ role: roles[id] }] : [] };
    },
  };
}

function appWith(db) {
  const app = express();
  app.use(session({ secret: 'made-up-test-secret', resave: false, saveUninitialized: false }));
  app.use(createSessionRoleRefresh({ db }));
  app.post('/sign-in', (req, res) => {
    // Sign-in copies the role into the session, like establishAuthenticatedSession.
    req.session.userId = 7;
    req.session.userRole = 'user';
    res.json({ ok: true });
  });
  app.get('/whoami', (req, res) => res.json({ role: req.session.userRole ?? null }));
  return app;
}

describe('session role refresh', () => {
  test('promotion counts on the next request, without signing out', async () => {
    const roles = { 7: 'user' };
    const agent = request.agent(appWith(fakeDb(roles)));
    await agent.post('/sign-in').expect(200);
    expect((await agent.get('/whoami')).body.role).toBe('user');
    roles[7] = 'admin';
    expect((await agent.get('/whoami')).body.role).toBe('admin');
  });

  test('demotion counts on the next request too', async () => {
    const roles = { 7: 'user' };
    const agent = request.agent(appWith(fakeDb(roles)));
    await agent.post('/sign-in').expect(200);
    roles[7] = 'admin';
    expect((await agent.get('/whoami')).body.role).toBe('admin');
    roles[7] = 'user';
    expect((await agent.get('/whoami')).body.role).toBe('user');
  });

  test('signed-out requests never touch the database', async () => {
    const db = fakeDb({ 7: 'admin' });
    const res = await request(appWith(db)).get('/whoami');
    expect(res.body.role).toBeNull();
    expect(db.calls).toBe(0);
  });

  test('a database error keeps the sign-in copy and does not fail the request', async () => {
    const roles = { 7: 'user' };
    const agent = request.agent(appWith(fakeDb(roles)));
    await agent.post('/sign-in').expect(200);
    roles.fail = true;
    const res = await agent.get('/whoami').expect(200);
    expect(res.body.role).toBe('user');
  });
});
