// tests/friendsParties.test.js
//
// Friends: the owner shares one board with one friend. The friend's own
// censaiOS opens it with a party code and comes in as themselves. A code
// made for someone else gets no answer, and ending the party (or removing
// the friend) puts them out at once.
//
// Real servers on real ports. A stand-in for the tailcat program
// (tests/fixtures/tailcatStandin.mjs) carries the connection and keeps
// tailcat's promise that a shared port answers only the key it was shared
// with. This one process plays both sides: the owner who shares, and the
// friend's computer that joins with this computer's own identity.

import { jest } from '@jest/globals';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const OWNER_ID = 7;
const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query, on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true, setDbReady: () => {} }));
const passThrough = (_req, _res, next) => next();
jest.unstable_mockModule('../server/middleware/standardRateLimits.js', () => ({
  authSecurityRateLimiter: passThrough,
  resourceRateLimiter: passThrough,
}));

// The friends list, kept in memory here. The real one is tests/friendsStore.test.js.
const list = new Map();
const boards = { 'board-a': { id: 'board-a', name: 'Family board' } };
const onBoard = [];
jest.unstable_mockModule('../server/friends/store.js', () => ({
  listFriends: async () => [...list.values()],
  findFriend: async (_db, _owner, id) => list.get(id) || null,
  addFriend: async (_db, { name, key }) => {
    const existing = [...list.values()].find((friend) => friend.key === key);
    if (existing) return { friend: existing, alreadyThere: true };
    const friend = { id: `f${list.size + 1}`, name, key, userId: 100 + list.size };
    list.set(friend.id, friend);
    return { friend, alreadyThere: false };
  },
  removeFriend: async (_db, { friendId }) => {
    const friend = list.get(friendId) || null;
    list.delete(friendId);
    return friend;
  },
  putOnBoard: async (_db, { friend, workspaceId, role }) => {
    if (!boards[workspaceId]) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
    onBoard.push({ friendId: friend.id, workspaceId, role });
    return boards[workspaceId];
  },
}));

const { doorAllowsOrigin, resetDoorCache } = await import('../server/webOs/door.js');
const { doorGuard } = await import('../server/webOs/doorListener.js');
const { doorClosedPage } = await import('../server/webOs/closedPage.js');
const { webOsPublicRouter, webOsRouter } = await import('../server/routes/webOs.js');
const { endParties, listParties, wireParties } = await import('../server/friends/parties.js');
const { joinParty, leaveEveryParty, listJoins } = await import('../server/friends/joins.js');
const { identityFile, readFriendsSettings, resetFriendsSettingsCache } = await import('../server/friends/settings.js');
const { setTailcatProgram } = await import('../server/friends/tailcat.js');
const { isTailcatAddress, makeFriendCode, makePartyCode, readPartyCode } = await import('../server/friends/codes.js');

const STAND_IN = path.resolve('tests/fixtures/tailcatStandin.mjs');
const STRANGER_KEY = 'cd'.repeat(32);

let dir;
let app; // one app, as in the real server: the owner's port and every party port serve it
let main; // the owner's own port: this computer only
const liveSync = [];
const api = () => request(`http://127.0.0.1:${main.address().port}`);
const asOwner = (call) => call.set('x-test-owner', '1');
// A browser on the friend's computer, at the address their censaiOS opened.
// It dials the forwarded port on this computer and names the party's own
// host, as a browser does once it has looked "p-….localhost" up.
const dial = (url) => `http://127.0.0.1:${new URL(url).port}`;
const hostOf = (url) => new URL(url).host;
const through = (url) => {
  const call = (method) => (path) => request(dial(url))[method](path).set('Host', hostOf(url));
  return { get: call('get'), post: call('post'), delete: call('delete') };
};
const agentAt = (url) => request.agent(dial(url)).set('Host', hostOf(url));
// The party's own password, which that address carries.
const password = (url) => new URL(url).searchParams.get('party');
const enterWith = (call, url) => call.post('/api/web-os/friends/party/enter').set('X-Party-Token', password(url)).send({});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.set('Connection', 'close'); next(); });
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  app.use(doorGuard);
  app.use('/api/web-os', webOsPublicRouter);
  app.get('/api/who', (req, res) => res.json({ userId: req.session?.userId ?? null, role: req.session?.userRole ?? null, party: Boolean(req.friendParty) }));
  // Stands in for the owner's signed-in session on the computer that runs censaiOS.
  app.use('/api/web-os', (req, _res, next) => {
    if (req.get('x-test-owner')) Object.assign(req.session, { userId: OWNER_ID, userRole: 'admin', userName: 'Alma Example' });
    next();
  }, webOsRouter);
  // As in the real server: Open anywhere is off here, and that must not turn a friend away.
  app.use(doorClosedPage);
  app.get('/', (_req, res) => res.type('html').send('<title>the board</title>'));
  return app;
}

/** Turns Friends on and adds one friend. `mine: true` gives them this computer's own identity, so joining works from here. */
async function addFriend(name, { mine = false } = {}) {
  await asOwner(api().put('/api/web-os/friends')).send({ on: true });
  const key = mine ? readFriendsSettings({ fresh: true }).key : STRANGER_KEY;
  const added = await asOwner(api().post('/api/web-os/friends')).send({ code: makeFriendCode({ name, key }) });
  return added.body.added.id;
}

async function share(friendId, role = 'member') {
  const started = await asOwner(api().post(`/api/web-os/friends/${friendId}/party`)).send({ workspaceId: 'board-a', role });
  return started;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-'));
  process.env.HOMEBASE_STATE_DIR = path.join(dir, 'state');
  process.env.TAILCAT_STANDIN_DIR = path.join(dir, 'tailcat');
  setTailcatProgram([process.execPath, STAND_IN]);
  app = buildApp();
  main = http.createServer(app);
  await new Promise((resolve) => main.listen(0, '127.0.0.1', resolve));
  // The board's live sync hangs off the main server; a party port hands its own over.
  wireParties({ emit: (event, req) => { liveSync.push({ event, url: req.url }); } }, app);
});

afterAll(async () => {
  await endParties({ atOnce: true });
  leaveEveryParty();
  setTailcatProgram(null);
  main.closeAllConnections?.();
  await new Promise((resolve) => main.close(resolve));
  delete process.env.HOMEBASE_STATE_DIR;
  delete process.env.TAILCAT_STANDIN_DIR;
  resetDoorCache();
  resetFriendsSettingsCache();
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await endParties({ atOnce: true });
  leaveEveryParty();
  list.clear();
  onBoard.length = 0;
  liveSync.length = 0;
  query.mockReset();
  // The friend's own account on this copy, as /party/enter looks it up.
  query.mockImplementation(async (sql, params) => {
    if (/FROM friends f JOIN users u/.test(sql)) {
      const friend = [...list.values()].find((item) => item.id === params[0] && item.key === params[1]);
      return { rows: friend ? [{ id: friend.userId, email: 'friend@friends.this-computer.local', name: friend.name, role: 'user' }] : [] };
    }
    return { rows: [], rowCount: 0 };
  });
});

describe('turning Friends on', () => {
  test('is off at first, and shows no code', async () => {
    fs.rmSync(path.join(dir, 'state'), { recursive: true, force: true });
    resetFriendsSettingsCache();
    const { body } = await asOwner(api().get('/api/web-os/friends'));
    expect(body).toMatchObject({ usable: true, on: false, tailcat: true, code: '', friends: [] });
  });

  test('makes this computer\'s identity once, and gives a friend code with only its public half', async () => {
    const first = await asOwner(api().put('/api/web-os/friends')).send({ on: true });
    expect(first.body).toMatchObject({ on: true, name: 'Alma Example' });
    expect(first.body.code.startsWith('cf1-')).toBe(true);
    const { key } = readFriendsSettings({ fresh: true });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(identityFile())).toBe(true);

    // Off and on again: still the same person to everyone who added them.
    await asOwner(api().put('/api/web-os/friends')).send({ on: false });
    const again = await asOwner(api().put('/api/web-os/friends')).send({ on: true });
    expect(again.body.code).toBe(first.body.code);
  });

  test('says so when tailcat is not on this computer', async () => {
    setTailcatProgram(null);
    try {
      fs.rmSync(path.join(dir, 'state'), { recursive: true, force: true });
      resetFriendsSettingsCache();
      const card = await asOwner(api().get('/api/web-os/friends'));
      expect(card.body.tailcat).toBe(false);
      expect(card.body.install.line).toContain('tailcat');
      const on = await asOwner(api().put('/api/web-os/friends')).send({ on: true });
      expect(on.status).toBe(409);
      expect(on.body.code).toBe('NOT_INSTALLED');
    } finally {
      setTailcatProgram([process.execPath, STAND_IN]);
    }
  });
});

describe('sharing a board with a friend', () => {
  test('the friend\'s own censaiOS opens it with the party code and comes in as themselves', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const started = await share(samId);
    expect(started.status).toBe(201);
    expect(started.body.party).toMatchObject({ friendName: 'Sam', boardName: 'Family board', role: 'member', joined: false });
    expect(onBoard).toEqual([{ friendId: samId, workspaceId: 'board-a', role: 'member' }]);
    const code = started.body.party.code;
    expect(readPartyCode(code)).toMatchObject({
      hostName: 'Alma Example', hostKey: readFriendsSettings().key, boardName: 'Family board', boardId: 'board-a',
    });

    // On the friend's computer: paste the code.
    const joined = await asOwner(api().post('/api/web-os/friends/joins')).send({ code });
    expect(joined.status).toBe(201);
    const { url } = joined.body.joined;
    expect(url).toMatch(/^http:\/\/p-[0-9a-f]{12}\.localhost:\d+\/\?party=[\w-]{20,64}$/);
    // The sharer shows under the name this person saved for them. (This one
    // process is both computers, so that saved name is "Sam".)
    expect(joined.body.joined).toMatchObject({ hostName: 'Sam', boardName: 'Family board' });

    const sam = agentAt(url);
    expect((await sam.get('/')).text).toContain('the board');
    expect((await sam.get('/api/web-os/friends/party/hello').set('X-Party-Token', password(url))).body).toEqual({
      app: 'censaiOS', host: 'Alma Example', friend: 'Sam', boardId: 'board-a', boardName: 'Family board',
    });
    expect((await sam.get('/api/who')).body).toEqual({ userId: null, role: null, party: true });
    const enter = await enterWith(sam, url);
    expect(enter.status).toBe(200);
    expect(enter.body).toMatchObject({ ok: true, boardId: 'board-a', user: { name: 'Sam' } });
    // Themselves: their own account and an ordinary role, never the owner's.
    const who = (await sam.get('/api/who')).body;
    expect(who.userId).toBe(list.get(samId).userId);
    expect(who.userId).not.toBe(OWNER_ID);
    expect(who.role).toBe('user');
    expect(listParties()[0].joined).toBe(true);
  });

  test('a party code from someone who is not on your list is refused before anything connects', async () => {
    await addFriend('Sam', { mine: true });
    const from = (hostKey) => makePartyCode({ address: `tc${'A'.repeat(40)}`, hostName: 'Robin', hostKey, boardName: 'Trip', boardId: 'board-x' });
    for (const code of [from(STRANGER_KEY.replace('c', 'e')), from('')]) {
      const refused = await asOwner(api().post('/api/web-os/friends/joins')).send({ code });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('NOT_A_FRIEND');
      expect(refused.body.error).toContain('Robin, who is not on your friends list');
    }
    expect(listJoins()).toEqual([]);
  });

  test('"can look" shares the board as look-only', async () => {
    const samId = await addFriend('Sam', { mine: true });
    expect((await share(samId, 'viewer')).body.party.role).toBe('viewer');
    expect(onBoard[0].role).toBe('viewer');
  });

  test('a code made for someone else gets no answer on this computer', async () => {
    const boId = await addFriend('Bo'); // Bo's key is not this computer's
    const code = (await share(boId)).body.party.code;
    await expect(joinParty({ code, timeoutMs: 1500 })).rejects.toMatchObject({
      code: 'NO_ANSWER',
      message: expect.stringContaining('made for a different person'),
    });
    expect(listJoins()).toEqual([]);
  });

  test('the way in asks for the party\'s own password, which only the party code carries', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const code = (await share(samId)).body.party.code;
    const { url } = await joinParty({ code });
    expect(password(url)).toBe(readPartyCode(code).token);
    // Reaching the port is not enough: no names, and no way in.
    for (const wrong of [null, 'x'.repeat(32), `${password(url).slice(0, -1)}_`]) {
      const ask = (call) => (wrong ? call.set('X-Party-Token', wrong) : call);
      expect((await ask(through(url).get('/api/web-os/friends/party/hello'))).body).toEqual({ app: 'censaiOS', needsCode: true });
      const enter = await ask(through(url).post('/api/web-os/friends/party/enter')).send({});
      expect(enter.status).toBe(403);
      expect(enter.body.needsCode).toBe(true);
      expect(enter.headers['set-cookie']).toBeUndefined();
    }
    expect(listParties()[0].joined).toBe(false);
    expect((await enterWith(through(url), url)).status).toBe(200);
  });

  test('on a party port nothing else signs in, and no other address works', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const { url } = await joinParty({ code: (await share(samId)).body.party.code });
    for (const path of ['/api/auth/developer', '/api/auth/local', '/api/web-os/pair/redeem', '/api/web-os/tailnet/enter', '/api/invites/redeem', '/API/Auth/Developer']) {
      const answer = await through(url).post(path).send({ email: 'alma@example.com', code: 'x' });
      expect(answer.status).toBe(403);
      expect(answer.body.partyOnly).toBe(true);
    }
    // A web page elsewhere pointing a name of its own at the friend's computer.
    const elsewhere = await through(url).get('/').set('Host', 'evil.example:8080');
    expect(elsewhere.status).toBe(403);
    expect(elsewhere.text).toContain('from your own censaiOS');
    expect((await through(url).post('/api/web-os/friends/party/enter').set('X-Party-Token', password(url)).set('Host', 'evil.example').send({})).status).toBe(403);
    // The owner's card is not for a friend, whatever they send.
    expect((await through(url).get('/api/web-os/friends').set('x-test-owner', '1')).body).toEqual({ usable: false });
    expect((await through(url).post('/api/web-os/friends').set('x-test-owner', '1').send({ code: 'x' })).status).toBe(403);
  });

  test('the board\'s live sync is handed over only while the party is on', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const { url } = await joinParty({ code: (await share(samId)).body.party.code });
    const knock = (headers = {}) => new Promise((resolve) => {
      const req = http.request(`${dial(url)}/sync`, { headers: { Host: hostOf(url), Connection: 'Upgrade', Upgrade: 'websocket', ...headers } });
      req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', () => resolve('closed'));
      req.on('upgrade', (_res, socket) => { socket.destroy(); resolve('upgraded'); });
      setTimeout(() => { req.destroy(); resolve('handed over'); }, 400);
      req.end();
    });
    expect(await knock()).toBe('handed over');
    expect(liveSync).toEqual([{ event: 'upgrade', url: '/sync' }]);
    expect(await knock({ Host: 'evil.example' })).toBe(403);
    expect(await knock({ Host: `127.0.0.1:${new URL(url).port}` })).toBe(403);
    expect(liveSync).toHaveLength(1);
  });

  test('a page the friend opened may talk to this copy only at the party\'s own address', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const { url } = await joinParty({ code: (await share(samId)).body.party.code });
    const own = hostOf(url);
    expect(doorAllowsOrigin(`http://${own}`, own)).toBe(true);
    const port = new URL(url).port;
    for (const [origin, host] of [
      ['http://evil.example', own], [`http://evil.example:${port}`, `evil.example:${port}`],
      [`http://127.0.0.1:${port}`, `127.0.0.1:${port}`], [`http://localhost:${port}`, `localhost:${port}`],
      [`http://p-000000000000.localhost:${port}`, `p-000000000000.localhost:${port}`], [`http://${own}.evil.example`, `${own}.evil.example`],
    ]) {
      expect(doorAllowsOrigin(origin, host)).toBe(false);
    }
    await endParties({ atOnce: true });
    expect(doorAllowsOrigin(`http://${own}`, own)).toBe(false);
    expect(isTailcatAddress('http://evil.example')).toBe(false);
  });

  // A browser sends a sign-in to every port of the name it was made for. The
  // friend's own censaiOS is at localhost or 127.0.0.1, so a shared board
  // must never be a page at either: it would be handed that sign-in.
  test('the board is served under a name of its own, never at an address the friend\'s own censaiOS uses', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const code = (await share(samId)).body.party.code;
    const { url } = await joinParty({ code });
    const { hostname, port } = new URL(url);
    expect(hostname).toBe(`${readPartyCode(code).label}.localhost`);
    expect(['localhost', '127.0.0.1']).not.toContain(hostname);
    // Another share gets another name, so two friends' boards share nothing either.
    list.set('f9', { id: 'f9', name: 'Kit', key: list.get(samId).key, userId: 222 });
    const other = await joinParty({ code: (await share('f9')).body.party.code });
    expect(new URL(other.url).hostname).not.toBe(hostname);
    // Asked for by any name that shares sign-ins with the friend's own copy,
    // the port serves nothing: no page, no names, no way in, and no cookie,
    // even with the right password and a cookie from the friend's own copy.
    const ownCopyCookie = 'connect.sid=s%3Athe-friends-own-sign-in.signature';
    for (const shared of [`127.0.0.1:${port}`, `localhost:${port}`, '127.0.0.1', `${hostname}.evil.example:${port}`, `p-000000000000.localhost:${port}`]) {
      const ask = (call) => call.set('Host', shared).set('Cookie', ownCopyCookie).set('X-Party-Token', password(url));
      const page = await ask(request(dial(url)).get('/'));
      expect(page.status).toBe(403);
      expect(page.text).not.toContain('the board');
      expect((await ask(request(dial(url)).get('/api/web-os/friends/party/hello'))).status).toBe(403);
      expect((await ask(request(dial(url)).get('/api/who'))).status).toBe(403);
      const enter = await ask(request(dial(url)).post('/api/web-os/friends/party/enter')).send({});
      expect(enter.status).toBe(403);
      expect(enter.headers['set-cookie']).toBeUndefined();
    }
    expect(listParties().find((party) => party.friendId === samId).joined).toBe(false);
  });

  test('a party code without the board\'s own name or password is refused before anything connects', async () => {
    await addFriend('Sam', { mine: true });
    const hostKey = readFriendsSettings().key;
    const bare = (extra) => makePartyCode({ address: `tc${'A'.repeat(40)}`, hostName: 'Alma', hostKey, boardName: 'B', boardId: 'b', ...extra });
    for (const code of [bare({ token: 'p'.repeat(32) }), bare({ label: 'p-0123456789ab' }), bare({ token: 'p'.repeat(32), label: 'localhost' })]) {
      await expect(joinParty({ code })).rejects.toMatchObject({ code: 'BAD_CODE' });
    }
    expect(listJoins()).toEqual([]);
  });

  test('when tailcat stops by itself the join is over, and its watch with it', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const code = (await share(samId)).body.party.code;
    const stopped = jest.spyOn(global, 'clearInterval');
    process.env.TAILCAT_STANDIN_FORWARD_LIFE_MS = '700';
    try {
      const join = await joinParty({ code });
      expect(listJoins()).toHaveLength(1);
      const watch = stopped.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(listJoins()).toEqual([]);
      // The watch that asks every 15 seconds was stopped, not left running for good.
      expect(stopped.mock.calls.length).toBeGreaterThan(watch);
      expect(await through(join.url).get('/').timeout(800).then(() => 'answered', () => 'no answer')).toBe('no answer');
    } finally {
      delete process.env.TAILCAT_STANDIN_FORWARD_LIFE_MS;
      stopped.mockRestore();
    }
  });
});

describe('ending it', () => {
  async function samInside() {
    const samId = await addFriend('Sam', { mine: true });
    const started = await share(samId);
    const { url } = await joinParty({ code: started.body.party.code });
    const sam = agentAt(url);
    await enterWith(sam, url);
    expect((await sam.get('/api/who')).body.userId).toBe(list.get(samId).userId);
    return { samId, sam, url, partyId: started.body.party.id, code: started.body.party.code };
  }
  // Out means: refused, signed out, or (the address being dead) no answer at all.
  const gone = async (call) => call.timeout(1500).then((res) => (res.status === 403 || res.body?.userId == null), () => true);

  test('the owner ends the party: the friend is out at once, off the board, and the code is dead', async () => {
    const { sam, samId, partyId, code } = await samInside();
    const ended = await asOwner(api().delete(`/api/web-os/friends/party/${partyId}`));
    expect(ended.body.friends[0].party).toBeNull();
    expect(await gone(sam.get('/api/who'))).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("sess->>'friendPartyId' = ANY"), [[partyId]]);
    // Their place on the board ends with the party; only a member or viewer row is touched.
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM workspace_members WHERE workspace_id = \$1 AND user_id = \$2 AND role IN \('member', 'viewer'\)/),
      ['board-a', list.get(samId).userId],
    );
    leaveEveryParty();
    await expect(joinParty({ code, timeoutMs: 1200 })).rejects.toMatchObject({ code: 'PARTY_ENDED' });
  });

  test('for a short while the friend\'s open page is told why, and nothing else answers there', async () => {
    const { sam, partyId, url } = await samInside();
    await asOwner(api().delete(`/api/web-os/friends/party/${partyId}`));
    // A fresh connection on the same address, with the friend's old sign-in.
    const page = await sam.get('/').timeout(3000);
    expect(page.status).toBe(403);
    expect(page.text).toContain('Alma Example stopped sharing this board');
    const who = await sam.get('/api/who').timeout(3000);
    expect(who.status).toBe(403);
    expect(who.body).toMatchObject({ partyEnded: true });
    const enter = await enterWith(through(url), url).timeout(3000);
    expect(enter.status).toBe(403);
    expect((await through(url).get('/assets/app.js').timeout(3000)).status).toBe(403);
    // When censaiOS itself stops, even that goes.
    await endParties({ atOnce: true });
    expect(await through(url).get('/').timeout(1500).then(() => 'answered', () => 'no answer')).toBe('no answer');
  });

  test('removing the friend ends their party too', async () => {
    const { sam, samId } = await samInside();
    const removed = await asOwner(api().delete(`/api/web-os/friends/${samId}`));
    expect(removed.body.friends).toEqual([]);
    expect(listParties()).toEqual([]);
    expect(await gone(sam.get('/api/who'))).toBe(true);
  });

  test('turning Friends off ends every party', async () => {
    const { sam } = await samInside();
    expect((await asOwner(api().put('/api/web-os/friends')).send({ on: false })).body.on).toBe(false);
    expect(listParties()).toEqual([]);
    expect(listJoins()).toEqual([]);
    expect(await gone(sam.get('/api/who'))).toBe(true);
  });

  test('sharing again with the same friend replaces the old code', async () => {
    const { samId, code, sam } = await samInside();
    // Taken off the board from the first share before being put on for the
    // second: the other way round would take them off the board just shared.
    let putOnWhenTakenOff = null;
    const answer = query.getMockImplementation();
    query.mockImplementation(async (sql, params) => {
      if (/DELETE FROM workspace_members/.test(sql)) putOnWhenTakenOff = onBoard.length;
      return answer(sql, params);
    });
    const again = await share(samId);
    expect(again.body.party.code).not.toBe(code);
    expect(listParties()).toHaveLength(1);
    expect(await gone(sam.get('/api/who'))).toBe(true);
    expect(putOnWhenTakenOff).toBe(1);
    expect(onBoard).toHaveLength(2);
  });

  test('when censaiOS starts, no friend is left signed in or on a board from before', async () => {
    query.mockClear();
    wireParties({ emit: (event, req) => { liveSync.push({ event, url: req.url }); } }, app);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(query).toHaveBeenCalledWith("DELETE FROM session WHERE sess->>'friendPartyId' IS NOT NULL");
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/DELETE FROM workspace_members wm USING friends f\s+WHERE wm\.user_id = f\.user_id AND wm\.role IN \('member', 'viewer'\)/));
  });

  test('if the database was not up at the start, that sweep runs before the first share instead', async () => {
    const samId = await addFriend('Sam', { mine: true });
    const answer = query.getMockImplementation();
    const sweeps = [];
    let databaseUp = false;
    query.mockImplementation(async (sql, params) => {
      if (/friendPartyId' IS NOT NULL|USING friends f/.test(sql)) {
        sweeps.push(onBoard.length);
        if (!databaseUp) throw new Error('the database is still starting');
      }
      return answer(sql, params);
    });
    wireParties({ emit: (event, req) => { liveSync.push({ event, url: req.url }); } }, app);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sweeps).toEqual([0]);
    databaseUp = true;
    expect((await share(samId)).status).toBe(201);
    // Both sweeps ran, and before Sam was put on the board, so he is still on it.
    expect(sweeps).toEqual([0, 0, 0]);
    expect(onBoard).toHaveLength(1);
    // Once is enough: a later share does not sweep again.
    await share(samId);
    expect(sweeps).toHaveLength(3);
  });

  test('a sign-in from one party is worth nothing on another party\'s port', async () => {
    const { sam, samId, url } = await samInside();
    const cookie = (await enterWith(sam, url)).headers['set-cookie'][0].split(';')[0];
    // A second friend with this computer's identity too, sharing in parallel.
    list.set('f9', { id: 'f9', name: 'Kit', key: list.get(samId).key, userId: 222 });
    const other = await joinParty({ code: (await share('f9')).body.party.code });
    const replay = await through(other.url).get('/api/who').set('Cookie', cookie);
    expect(replay.body).toEqual({ userId: null, role: null, party: true });
  });

  test('nor on the computer\'s own address, even while the party is live', async () => {
    const { sam, url } = await samInside();
    const cookie = (await enterWith(sam, url)).headers['set-cookie'][0].split(';')[0];
    const replay = await api().get('/api/who').set('Cookie', cookie);
    expect(replay.body).toEqual({ userId: null, role: null, party: false });
    // The party itself goes on; the friend's page just comes in again.
    expect(listParties()).toHaveLength(1);
  });
});
