// Social canvas doors: the outside door another censaiOS reads (key per
// person, signed answers), and following someone there by address and key.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { generateIdentity, identitySigner } from '../server/agentNetwork/installIdentity.js';
import { createLimiter } from '../server/agentEndpoints/rateLimit.js';
import { createOutsideApp } from '../server/agentEndpoints/outsideListener.js';
import { createSocialPublicRouter } from '../server/routes/socialPublic.js';
import { createProfileKey, hashProfileKey } from '../server/social/keys.js';
import { followRemote } from '../server/social/follows.js';
import { refreshRemoteFollow, verifyFeed } from '../server/social/remote.js';
import { decryptKey, encryptKey } from '../server/security/vault.js';

const PROFILE = '5fff44d6-bf7c-44a2-9076-1e7f1f2bca48';
const ALMA_KEY = createProfileKey();
const JO_KEY = createProfileKey();
const install = identitySigner(generateIdentity());

function fakeDb() {
  const profile = { user_id: 7, id: PROFILE, display_name: 'Alma', bio: 'Builds censaiOS' };
  const owners = { [hashProfileKey(ALMA_KEY)]: 7, [hashProfileKey(JO_KEY)]: 8 };
  return {
    query: jest.fn(async (sql, params = []) => {
      if (sql.includes('FROM social_profiles WHERE id::text')) return { rows: params[0] === PROFILE ? [profile] : [] };
      if (sql.includes('FROM social_profiles WHERE user_id')) return { rows: [profile] };
      if (sql.includes('UPDATE social_keys SET last_used_at')) return { rows: owners[params[0]] ? [{ user_id: owners[params[0]] }] : [] };
      if (sql.includes('FROM social_posts')) {
        return { rows: [{ id: 'p1', workspace_id: null, kind: 'post', agent_name: null, body: 'Landing page is up', created_at: new Date('2026-10-12T06:00:00Z') }] };
      }
      return { rows: [] };
    }),
  };
}

function door() {
  const app = express();
  app.use('/api/social/v1', createSocialPublicRouter({ db: fakeDb(), signer: async () => install, limiter: createLimiter() }));
  return app;
}

const url = `/api/social/v1/profiles/${PROFILE}`;

test('the right key reads a signed profile and feed', async () => {
  const res = await request(door()).get(url).set('Authorization', `Bearer ${ALMA_KEY}`).expect(200);
  expect(verifyFeed(res.body)).toEqual({ ok: true, installId: install.installId });
  expect(res.body.body.profile).toEqual({ id: PROFILE, name: 'Alma', bio: 'Builds censaiOS' });
  expect(res.body.body.items).toEqual([expect.objectContaining({ kind: 'post', text: 'Landing page is up', actor: { kind: 'person', name: 'Alma' } })]);
  expect(res.headers['cache-control']).toBe('no-store');
});

test('no key, a wrong key or someone else\'s key gets nothing', async () => {
  const app = door();
  await request(app).get(url).expect(401);
  await request(app).get(url).set('Authorization', `Bearer ${createProfileKey()}`).expect(401);
  const other = await request(app).get(url).set('Authorization', `Bearer ${JO_KEY}`).expect(401);
  expect(other.body.body).toBeUndefined();
  await request(app).get('/api/social/v1/profiles/not-an-id').set('Authorization', `Bearer ${ALMA_KEY}`).expect(404);
  await request(app).get('/api/social/v1/profiles/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${ALMA_KEY}`).expect(404);
});

test('the outside-only port serves profiles too, and still nothing else', async () => {
  const router = express.Router();
  router.get('/profiles/:id', (_req, res) => res.json({ ok: true }));
  const app = createOutsideApp(express.Router(), router);
  await request(app).get(url).expect(200, { ok: true });
  await request(app).get('/api/workspaces').expect(404);
  await request(app).get(url).set('Origin', 'https://evil.example').expect(403);
});

function fetchFrom(app) {
  return async (target, init) => {
    const path = new URL(target).pathname;
    const res = await request(app).get(path).set('Authorization', init.headers.Authorization);
    return { status: res.status, ok: res.status < 300, json: async () => res.body };
  };
}

test('following someone on another censaiOS checks the key once and keeps a sealed copy', async () => {
  const insert = { query: jest.fn(async () => ({ rows: [{ id: 'f1' }] })) };
  const address = `https://alma.example${url}`;
  await expect(followRemote(insert, 3, { address, key: createProfileKey() }, { guardedFetch: fetchFrom(door()) }))
    .rejects.toThrow(/does not open this profile/);
  await expect(followRemote(insert, 3, { address, key: 'nope' }, { guardedFetch: fetchFrom(door()) })).rejects.toThrow(/csk_/);
  const result = await followRemote(insert, 3, { address, key: ALMA_KEY }, { guardedFetch: fetchFrom(door()) });
  expect(result).toEqual({ id: 'f1', already: false });
  const params = insert.query.mock.calls.at(-1)[1];
  expect(params.slice(0, 7)).toEqual([3, 'person', null, null, `https://alma.example${url}`, null, install.installId]);
  expect(params[7]).not.toContain(ALMA_KEY.slice(4));
  expect(decryptKey(params[7], 3)).toBe(ALMA_KEY);
  expect(JSON.parse(params[9])).toMatchObject({ verified: true, profile: { name: 'Alma' } });
});

test('a computer that is off keeps the last copy; a different computer at the address is refused', async () => {
  const db = { query: jest.fn(async (_sql, params) => ({ rows: [{ id: params[0], remote_cache: params[1] && JSON.parse(params[1]), fetch_error: params[3] }] })) };
  const follow = { id: 'f2', user_id: 3, remote_address: `https://alma.example${url}`, key_encrypted: '', remote_cache: { items: [{ id: 'post:1' }] }, remote_install_id: 'ci_000000000000000000000000' };
  const off = await refreshRemoteFollow(db, follow, { guardedFetch: async () => { throw new Error('ECONNREFUSED'); } });
  expect(off.fetch_error).toMatch(/not answering/);
  expect(off.remote_cache).toEqual({ items: [{ id: 'post:1' }] });
  const moved = await refreshRemoteFollow(db, { ...follow, id: 'f3', key_encrypted: encryptKey(ALMA_KEY, 3) }, { guardedFetch: fetchFrom(door()) });
  expect(moved.fetch_error).toMatch(/different computer/);
  expect(moved.remote_cache).toEqual({ items: [{ id: 'post:1' }] });
});
