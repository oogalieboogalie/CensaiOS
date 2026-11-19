// tests/friendsQuickInvite.test.js
//
// Friends, the quick invite: letting in someone who is not on the list yet.
// The owner makes an invite, tells the person 8 digits, and opens a door for
// 30 seconds. The right digits in that time put the person on the friends
// list and share the board with them the ordinary way. Wrong digits, a shut
// door, a second person or an ended invite get nothing.
//
// Real servers on real ports, with the stand-in for tailcat
// (tests/fixtures/tailcatStandin.mjs) carrying the connection. This one
// process plays both computers, as in tests/friendsParties.test.js.

import { jest } from '@jest/globals';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const OWNER_ID = 7;
const query = jest.fn(async () => ({ rows: [], rowCount: 0 }));
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
const board = (workspaceId) => {
  if (!boards[workspaceId]) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  return boards[workspaceId];
};
let listFull = false;
jest.unstable_mockModule('../server/friends/store.js', () => ({
  listFriends: async () => [...list.values()],
  findFriend: async (_db, _owner, id) => list.get(id) || null,
  addFriend: async (_db, { name, key }) => {
    const existing = [...list.values()].find((friend) => friend.key === key);
    if (existing) return { friend: existing, alreadyThere: true };
    if (listFull) throw Object.assign(new Error('Your friends list is full (100). Remove someone first.'), { statusCode: 409, code: 'LIST_FULL' });
    const friend = { id: `f${list.size + 1}`, name, key, userId: 100 + list.size };
    list.set(friend.id, friend);
    return { friend, alreadyThere: false };
  },
  removeFriend: async () => null,
  boardToShare: async (_db, { workspaceId }) => board(workspaceId),
  putOnBoard: async (_db, { friend, workspaceId, role }) => {
    onBoard.push({ friendId: friend.id, workspaceId: board(workspaceId).id, role });
    return board(workspaceId);
  },
}));

const { resetDoorCache } = await import('../server/webOs/door.js');
const { doorGuard } = await import('../server/webOs/doorListener.js');
const { webOsPublicRouter, webOsRouter } = await import('../server/routes/webOs.js');
const { endParties, listParties, wireParties } = await import('../server/friends/parties.js');
const { leaveEveryParty, listJoins } = await import('../server/friends/joins.js');
const { DOOR_OPEN_MS, INVITE_KEEP_MS, KNOCK_PATH, MAX_TRIES, endQuickInvite, forgetQuickGuest } = await import('../server/friends/quick.js');
const { identityFile, readFriendsSettings, resetFriendsSettingsCache } = await import('../server/friends/settings.js');
const { reachFriend, setTailcatProgram } = await import('../server/friends/tailcat.js');
const { makeFriendCode, openQuickInvite } = await import('../server/friends/codes.js');

const STAND_IN = path.resolve('tests/fixtures/tailcatStandin.mjs');
const FRIENDS = '/api/web-os/friends';

let dir;
let main;
const tunnels = [];
const api = () => request(`http://127.0.0.1:${main.address().port}`);
const asOwner = (call) => call.set('x-test-owner', '1');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.set('Connection', 'close'); next(); });
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  app.use(doorGuard);
  app.use('/api/web-os', webOsPublicRouter);
  app.use('/api/web-os', (req, _res, next) => {
    if (req.get('x-test-owner')) Object.assign(req.session, { userId: OWNER_ID, userRole: 'admin', userName: 'Alma Example' });
    next();
  }, webOsRouter);
  app.get('/', (_req, res) => res.type('html').send('<title>the board</title>'));
  return app;
}

/** The owner makes an invite. Gives what their card shows: { invite, doorCode, open, ... }. */
async function makeInvite(role = 'member') {
  const made = await asOwner(api().post(`${FRIENDS}/quick`)).send({ workspaceId: 'board-a', role });
  expect(made.status).toBe(201);
  return made.body.quick;
}
const openDoor = () => asOwner(api().post(`${FRIENDS}/quick/open`)).send({});
const card = async () => (await asOwner(api().get(FRIENDS))).body;
/** The other person pastes the invite and types the digits. */
const comeIn = (invite, doorCode) => asOwner(api().post(`${FRIENDS}/quick/use`)).send({ invite, doorCode });

/** Someone who opened the box goes to the door itself, as a program of their own would. */
async function atTheDoor(quick) {
  const { address, port } = await openQuickInvite(quick.invite, quick.doorCode);
  const tunnel = reachFriend({ address, identityFile: identityFile(), port });
  tunnels.push(tunnel);
  const door = request(`http://127.0.0.1:${await tunnel.port}`);
  return { door, knock: (body) => door.post(KNOCK_PATH).send(body), port };
}
const strangerCode = (name = 'Robin') => makeFriendCode({ name, key: 'cd'.repeat(32) });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-quick-'));
  process.env.HOMEBASE_STATE_DIR = path.join(dir, 'state');
  process.env.TAILCAT_STANDIN_DIR = path.join(dir, 'tailcat');
  setTailcatProgram([process.execPath, STAND_IN]);
  const app = buildApp();
  main = http.createServer(app);
  await new Promise((resolve) => main.listen(0, '127.0.0.1', resolve));
  wireParties({ emit: () => {} }, app);
  await asOwner(api().put(FRIENDS)).send({ on: true });
});

afterAll(async () => {
  endQuickInvite();
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

afterEach(async () => {
  jest.restoreAllMocks();
  for (const tunnel of tunnels.splice(0)) tunnel.stop();
  endQuickInvite();
  forgetQuickGuest();
  await endParties({ atOnce: true });
  leaveEveryParty();
  list.clear();
  onBoard.length = 0;
  listFull = false;
  await asOwner(api().put(FRIENDS)).send({ on: true });
});

describe('making a quick invite', () => {
  test('gives an invite to send and 8 digits to say, with the door shut', async () => {
    const quick = await makeInvite('viewer');
    expect(quick.invite).toMatch(/^cq1-[\w-]{60,}$/);
    expect(quick.doorCode).toMatch(/^\d{8}$/);
    expect(quick).toMatchObject({ boardId: 'board-a', boardName: 'Family board', role: 'viewer', open: false, secondsLeft: 0, triesLeft: MAX_TRIES });
    // The digits are not in the invite, and nobody is on a board or a list yet.
    expect(quick.invite).not.toContain(quick.doorCode);
    expect(list.size).toBe(0);
    expect(onBoard).toEqual([]);
    expect((await card()).quick).toEqual(expect.objectContaining({ invite: quick.invite }));
  });

  test('only for a board you own or manage', async () => {
    const refused = await asOwner(api().post(`${FRIENDS}/quick`)).send({ workspaceId: 'someone-elses', role: 'member' });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('You can only share a board you own or manage.');
    expect((await card()).quick).toBeNull();
  });

  test('not while Friends is off, and not by anyone but the owner', async () => {
    expect((await api().post(`${FRIENDS}/quick`).send({ workspaceId: 'board-a' })).status).toBe(401);
    expect((await api().post(`${FRIENDS}/quick/use`).send({ invite: 'cq1-x', doorCode: '12345678' })).status).toBe(401);
    await asOwner(api().put(FRIENDS)).send({ on: false });
    const off = await asOwner(api().post(`${FRIENDS}/quick`)).send({ workspaceId: 'board-a' });
    expect(off.status).toBe(409);
    expect(off.body.error).toBe('Turn Friends on first.');
  });

  test('a new invite replaces the old one, which then leads nowhere', async () => {
    const first = await makeInvite();
    const old = await atTheDoor(first);
    const second = await makeInvite();
    expect(second.invite).not.toBe(first.invite);
    expect(second.doorCode).not.toBe(first.doorCode);
    const gone = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: old.port }, () => resolve(false)).on('error', () => resolve(true));
    });
    expect(gone).toBe(true);
  });

  test('opening the door needs an invite', async () => {
    const none = await openDoor();
    expect(none.status).toBe(409);
    expect(none.body).toMatchObject({ error: 'Make an invite first.', code: 'NO_INVITE' });
  });
});

describe('coming in', () => {
  test('the right digits while the door is open: on the list, on the board, and the board opens', async () => {
    const quick = await makeInvite();
    const opened = await openDoor();
    expect(opened.body.quick).toMatchObject({ open: true, secondsLeft: DOOR_OPEN_MS / 1000 });

    const came = await comeIn(quick.invite, quick.doorCode);
    expect(came.status).toBe(201);
    // On the other person's computer: the sharer is on their list and the board is open.
    expect(came.body.added).toMatchObject({ name: 'Alma Example' });
    expect(came.body.joined).toMatchObject({ boardName: 'Family board' });
    expect(came.body.joined.url).toMatch(/^http:\/\/p-[0-9a-f]{12}\.localhost:\d+\/\?party=[\w-]{20,64}$/);
    const url = new URL(came.body.joined.url);
    const page = await request(`http://127.0.0.1:${url.port}`).get('/').set('Host', url.host);
    expect(page.text).toContain('the board');

    // On the owner's computer: they are a friend like any other, sharing that board.
    expect([...list.values()]).toEqual([expect.objectContaining({ name: 'Alma Example', key: readFriendsSettings().key })]);
    expect(onBoard).toEqual([{ friendId: 'f1', workspaceId: 'board-a', role: 'member' }]);
    expect(listParties()).toEqual([expect.objectContaining({ friendId: 'f1', boardId: 'board-a', role: 'member' })]);
    const after = await card();
    expect(after.quick).toBeNull();
    expect(after.quickGuest).toMatchObject({ name: 'Alma Example', boardName: 'Family board' });
    expect(after.friends[0].party).toMatchObject({ boardName: 'Family board' });
  });

  test('digits typed with a space in the middle work the same', async () => {
    const quick = await makeInvite();
    await openDoor();
    const came = await comeIn(quick.invite, `${quick.doorCode.slice(0, 4)} ${quick.doorCode.slice(4)}`);
    expect(came.status).toBe(201);
  });

  test('"can look" lets them in to look only', async () => {
    const quick = await makeInvite('viewer');
    await openDoor();
    expect((await comeIn(quick.invite, quick.doorCode)).status).toBe(201);
    expect(onBoard[0].role).toBe('viewer');
    expect(listParties()[0].role).toBe('viewer');
  });

  test('wrong digits never leave the other person\'s computer: the box does not open', async () => {
    const quick = await makeInvite();
    await openDoor();
    const wrong = quick.doorCode === '11111111' ? '22222222' : '11111111';
    const refused = await comeIn(quick.invite, wrong);
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ code: 'WRONG_DOOR_CODE', error: 'Those 8 digits do not open this invite. Check them and try again.' });
    expect((await card()).quick.triesLeft).toBe(MAX_TRIES);
    expect(list.size).toBe(0);
  });

  test('something that is not an invite is refused in plain words', async () => {
    const refused = await comeIn('cq1-not-an-invite', '12345678');
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/invite/);
  });
});

describe('the door', () => {
  test('while it is shut, the right digits get nothing, and are not counted as a try', async () => {
    const quick = await makeInvite();
    const refused = await comeIn(quick.invite, quick.doorCode);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'DOOR_SHUT', error: 'The door is not open right now. Ask them to open it, then try again.' });
    expect(list.size).toBe(0);
    expect((await card()).quick).toMatchObject({ open: false, triesLeft: MAX_TRIES });
    // The same invite still works once the owner opens the door.
    await openDoor();
    expect((await comeIn(quick.invite, quick.doorCode)).status).toBe(201);
  });

  test('shuts by itself after 30 seconds', async () => {
    const quick = await makeInvite();
    await openDoor();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + DOOR_OPEN_MS - 1000);
    expect((await card()).quick).toMatchObject({ open: true, secondsLeft: 1 });
    Date.now.mockReturnValue(now + DOOR_OPEN_MS + 1000);
    expect((await card()).quick).toMatchObject({ open: false, secondsLeft: 0 });
    expect((await comeIn(quick.invite, quick.doorCode)).body.code).toBe('DOOR_SHUT');
    expect(list.size).toBe(0);
  });

  test('pressing Open again starts the 30 seconds over, but never past the invite\'s 10 minutes', async () => {
    const quick = await makeInvite();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 20 * 1000);
    expect((await openDoor()).body.quick.secondsLeft).toBe(30);
    Date.now.mockReturnValue(now + INVITE_KEEP_MS - 5000);
    const late = (await openDoor()).body.quick;
    expect(late.secondsLeft).toBeLessThanOrEqual(5);
    expect(quick.endsAt).toBe(late.endsAt);
  });

  test('answers one question only', async () => {
    const quick = await makeInvite();
    await openDoor();
    const { door } = await atTheDoor(quick);
    for (const call of [door.get('/'), door.get(KNOCK_PATH), door.get('/api/web-os/friends'), door.post('/api/auth/login').send({})]) {
      const said = await call;
      expect(said.status).toBe(404);
      expect(said.body).toEqual({ error: 'Not found.' });
    }
  });

  test('someone who opened the box but sends other digits is counted, and after 5 the invite is over for good', async () => {
    const quick = await makeInvite();
    await openDoor();
    const { knock } = await atTheDoor(quick);
    const wrong = quick.doorCode === '11111111' ? '22222222' : '11111111';
    for (let left = MAX_TRIES - 1; left > 0; left -= 1) {
      const said = await knock({ doorCode: wrong, friendCode: strangerCode() });
      expect(said.status).toBe(403);
      expect(said.body).toEqual({ error: 'Those 8 digits are not right.', code: 'WRONG_DOOR_CODE', left });
    }
    expect((await card()).quick.triesLeft).toBe(1);
    const last = await knock({ doorCode: 'not digits', friendCode: strangerCode() });
    expect(last.body).toEqual({ error: 'Too many wrong tries. This invite is over.', code: 'INVITE_OVER', left: 0 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await card()).quick).toBeNull();
    // Now even the right digits get no answer: the door is gone.
    const tooLate = await knock({ doorCode: quick.doorCode, friendCode: strangerCode() }).timeout(1500).then((res) => res.status, () => 'no answer');
    expect(tooLate).toBe('no answer');
    expect(list.size).toBe(0);
  });

  test('one invite lets one person in: a second person with the same digits is turned away', async () => {
    const quick = await makeInvite();
    await openDoor();
    const { knock } = await atTheDoor(quick);
    const mine = makeFriendCode({ name: 'Sam', key: readFriendsSettings().key });
    const first = await knock({ doorCode: quick.doorCode, friendCode: mine });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, partyCode: expect.stringMatching(/^cp1-/), hostCode: expect.stringMatching(/^cf1-/) });
    const second = await knock({ doorCode: quick.doorCode, friendCode: strangerCode() });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('BUSY');
    expect([...list.values()].map((friend) => friend.name)).toEqual(['Sam']);
    // The person who came in may ask again (a lost answer) and hears the same.
    const again = await knock({ doorCode: quick.doorCode, friendCode: mine });
    expect(again.body).toEqual(first.body);
    expect(listParties()).toHaveLength(1);
  });

  test('a friend code that is not one is refused, and the door stays for another go', async () => {
    const quick = await makeInvite();
    await openDoor();
    const { knock } = await atTheDoor(quick);
    const broken = await knock({ doorCode: quick.doorCode, friendCode: 'hello' });
    expect(broken.status).toBe(400);
    expect((await card()).quick).toMatchObject({ open: true, triesLeft: MAX_TRIES });
    const good = await knock({ doorCode: quick.doorCode, friendCode: strangerCode() });
    expect(good.status).toBe(200);
  });

  test('when the owner\'s friends list is full the person is told so, and nobody is put on the board', async () => {
    listFull = true;
    const quick = await makeInvite();
    await openDoor();
    const refused = await comeIn(quick.invite, quick.doorCode);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'LIST_FULL' });
    expect(onBoard).toEqual([]);
    expect(listJoins()).toEqual([]);
  });

  test('a body too big to be a knock is not read', async () => {
    const quick = await makeInvite();
    await openDoor();
    const { knock } = await atTheDoor(quick);
    const said = await knock({ doorCode: quick.doorCode, friendCode: 'x'.repeat(8000) }).then((res) => res.status, () => 'cut off');
    expect(said).not.toBe(200);
    expect(list.size).toBe(0);
  });
});

describe('a censaiOS that runs in Docker', () => {
  afterEach(() => { delete process.env.CENSAI_IN_CONTAINER; delete process.env.CENSAI_FRIENDS_JOIN_PORTS; });

  test('started without the ports for friends\' boards: makes invites and lets people in like any other, and says it can\'t open a friend\'s board', async () => {
    process.env.CENSAI_IN_CONTAINER = '1';
    expect((await card()).canJoin).toBe(false);
    const quick = await makeInvite();
    await openDoor();
    // Someone else's computer comes in on the invite.
    const { knock } = await atTheDoor(quick);
    const came = await knock({ doorCode: quick.doorCode, friendCode: strangerCode('Robin') });
    expect(came.status).toBe(200);
    expect(listParties()).toEqual([expect.objectContaining({ friendName: 'Robin', boardId: 'board-a' })]);
    // The other way round is refused in plain words, before anything connects.
    for (const refused of [await comeIn(quick.invite, quick.doorCode), await asOwner(api().post(`${FRIENDS}/joins`)).send({ code: came.body.partyCode })]) {
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('NO_JOIN_IN_DOCKER');
      expect(refused.body.error).toContain('started without the ports a friend\'s board opens on');
    }
    expect(listJoins()).toEqual([]);
  });

  test('outside Docker, and in Docker with the ports, the card says joining works', async () => {
    expect((await card()).canJoin).toBe(true);
    Object.assign(process.env, { CENSAI_IN_CONTAINER: '1', CENSAI_FRIENDS_JOIN_PORTS: '3031-3034' });
    expect((await card()).canJoin).toBe(true);
  });
});

describe('ending an invite', () => {
  const doorGone = (port) => new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port }, () => resolve(false)).on('error', () => resolve(true));
  });

  test('End this invite: the door is gone and the card lets go of it', async () => {
    const quick = await makeInvite();
    await openDoor();
    const { address, port } = await openQuickInvite(quick.invite, quick.doorCode);
    expect(address).toMatch(/^tc/);
    expect(await doorGone(port)).toBe(false);
    const ended = await asOwner(api().delete(`${FRIENDS}/quick`));
    expect(ended.body.quick).toBeNull();
    expect(await doorGone(port)).toBe(true);
  });

  test('turning Friends off ends it too', async () => {
    const quick = await makeInvite();
    const { port } = await openQuickInvite(quick.invite, quick.doorCode);
    await asOwner(api().put(FRIENDS)).send({ on: false });
    expect(await doorGone(port)).toBe(true);
    await asOwner(api().put(FRIENDS)).send({ on: true });
    expect((await card()).quick).toBeNull();
  });

  test('past its 10 minutes the door cannot be opened again', async () => {
    const quick = await makeInvite();
    const { port } = await openQuickInvite(quick.invite, quick.doorCode);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + INVITE_KEEP_MS + 1000);
    // Past its time, the door is shut whatever the owner presses.
    expect((await openDoor()).body.quick).toMatchObject({ open: false });
    expect((await comeIn(quick.invite, quick.doorCode)).body.code).toBe('DOOR_SHUT');
    expect(port).toBeGreaterThan(0);
  });
});
