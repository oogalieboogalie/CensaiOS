// Friends (server/friends/): friend codes, the friends list, and sharing a
// board with one friend at a time. For the owner of this copy, signed in,
// under /api/web-os/friends (server/routes/webOs.js). What a friend's own
// page asks on a party port is in friendsParty.js.
//
//   GET    /                 the card: switch, my code, friends, parties, joins
//   PUT    /                 { on?, name? }
//   POST   /                 { code }                add a friend
//   DELETE /:id              remove a friend (they are out at once)
//   POST   /:id/party        { workspaceId, role }   share a board; gives a party code
//   DELETE /party/:partyId   stop sharing
//   POST   /joins            { code }                join a friend's board
//   DELETE /joins/:joinId    leave it

import express from 'express';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { isJestRun } from '../security/testShortcut.js';
import { doorUsable, isFromAnotherComputer } from '../webOs/door.js';
import { cleanLabel, makeFriendCode, readFriendCode, readPartyCode } from '../friends/codes.js';
import { joinParty, leaveEveryParty, leaveParty, listJoins } from '../friends/joins.js';
import { MAX_PARTIES, endParties, listParties, startParty, takeOffBoard } from '../friends/parties.js';
import { identityFile, readFriendsSettings, writeFriendsSettings } from '../friends/settings.js';
import { addFriend, findFriend, listFriends, putOnBoard, removeFriend } from '../friends/store.js';
import { findTailcat, installHint, makeIdentity } from '../friends/tailcat.js';

const log = createLogger('friends');
export const friendsRouter = express.Router();

const canManage = (req) => req.session?.userRole === 'admin' || isJestRun();
const friendsOn = () => doorUsable() && readFriendsSettings().on && Boolean(readFriendsSettings().key);

function sendError(res, error, what) {
  const status = error.statusCode || 500;
  if (status >= 500 && status !== 502 && status !== 503) log.warn(`${what} failed`, { code: safeErrorCode(error) });
  res.status(status).json({
    error: status === 500 ? 'Something went wrong. Try again.' : error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}

// ---------------------------------------------------------------- the owner

/** The owner's user id, or null after answering why not. */
function owner(req, res) {
  if (!doorUsable()) { res.status(404).json({ error: 'Not found.' }); return null; }
  if (!canManage(req) || isFromAnotherComputer(req)) {
    res.status(403).json({ error: 'Friends is set up on the computer that runs censaiOS, by its owner.' });
    return null;
  }
  if (req.session?.userId == null) { res.status(401).json({ error: 'Sign in first.' }); return null; }
  return req.session.userId;
}

async function cardFor(req) {
  const settings = readFriendsSettings();
  const tailcat = Boolean(findTailcat());
  const ownerId = req.session?.userId ?? settings.ownerId;
  const friends = settings.on && ownerId != null ? await listFriends(pool, ownerId) : [];
  const parties = listParties();
  return {
    usable: true,
    on: settings.on && Boolean(settings.key),
    tailcat,
    install: tailcat ? null : installHint(),
    name: settings.name,
    code: settings.on && settings.key ? makeFriendCode({ name: settings.name, key: settings.key }) : '',
    friends: friends.map((friend) => ({
      id: friend.id,
      name: friend.name,
      // A few characters of their identity, to tell two friends with one name apart.
      mark: friend.key.slice(0, 6),
      party: parties.find((party) => party.friendId === friend.id) || null,
    })),
    joins: listJoins(),
  };
}

friendsRouter.get('/', async (req, res) => {
  if (!doorUsable() || !canManage(req) || isFromAnotherComputer(req)) return res.json({ usable: false });
  try {
    res.json(await cardFor(req));
  } catch (error) {
    sendError(res, error, 'friends card');
  }
});

friendsRouter.put('/', async (req, res) => {
  const ownerId = owner(req, res);
  if (ownerId === null) return;
  try {
    const patch = {};
    if (req.body?.name !== undefined) patch.name = cleanLabel(req.body.name);
    if (req.body?.on === true) {
      if (!findTailcat({ fresh: true })) return res.status(409).json({ error: 'Tailcat is not on this computer yet.', code: 'NOT_INSTALLED' });
      const current = readFriendsSettings({ fresh: true });
      // The identity is made once and kept: turning Friends off and on again
      // must not turn you into a stranger to everyone who added you.
      if (!current.key) patch.key = await makeIdentity(identityFile());
      patch.on = true;
      patch.ownerId = ownerId;
      if (!patch.name && !current.name) patch.name = cleanLabel(req.session?.userName) || 'Someone';
    } else if (req.body?.on === false) {
      patch.on = false;
      await endParties();
      leaveEveryParty();
    }
    writeFriendsSettings(patch);
    log.info('friends: settings changed', { on: readFriendsSettings().on, by: ownerId });
    res.json(await cardFor(req));
  } catch (error) {
    sendError(res, error, 'friends settings');
  }
});

friendsRouter.post('/', async (req, res) => {
  const ownerId = owner(req, res);
  if (ownerId === null) return;
  if (!friendsOn()) return res.status(409).json({ error: 'Turn Friends on first.' });
  try {
    const { name, key } = readFriendCode(req.body?.code);
    const { friend, alreadyThere } = await addFriend(pool, { ownerId, name, key, ownKey: readFriendsSettings().key });
    log.info('friends: added', { friendId: friend.id, by: ownerId, alreadyThere });
    res.status(alreadyThere ? 200 : 201).json({ ...(await cardFor(req)), added: { id: friend.id, name: friend.name, alreadyThere } });
  } catch (error) {
    sendError(res, error, 'adding a friend');
  }
});

friendsRouter.post('/joins', async (req, res) => {
  const ownerId = owner(req, res);
  if (ownerId === null) return;
  if (!friendsOn()) return res.status(409).json({ error: 'Turn Friends on first.' });
  try {
    // You join friends, not strangers: the code says who is sharing, and
    // that person has to be on this list already.
    const { hostKey, hostName } = readPartyCode(req.body?.code);
    const host = hostKey ? (await listFriends(pool, ownerId)).find((friend) => friend.key === hostKey) : null;
    if (!host) {
      return res.status(409).json({
        error: `This party code is from ${hostName}, who is not on your friends list. Paste ${hostName}'s friend code first, then this code again.`,
        code: 'NOT_A_FRIEND',
      });
    }
    const join = await joinParty({ code: req.body?.code, hostName: host.name });
    res.status(201).json({ ...(await cardFor(req)), joined: join });
  } catch (error) {
    sendError(res, error, 'joining a party');
  }
});

friendsRouter.delete('/joins/:joinId', async (req, res) => {
  const ownerId = owner(req, res);
  if (ownerId === null) return;
  leaveParty(req.params.joinId);
  res.json(await cardFor(req));
});

friendsRouter.delete('/party/:partyId', async (req, res) => {
  const ownerId = owner(req, res);
  if (ownerId === null) return;
  try {
    await endParties({ partyId: String(req.params.partyId) });
    res.json(await cardFor(req));
  } catch (error) {
    sendError(res, error, 'ending a party');
  }
});

// One share is set up at a time, so two quick presses can't undo each other.
let lastShare = Promise.resolve();
function inTurn(job) {
  const run = lastShare.then(job, job);
  lastShare = run.catch(() => undefined);
  return run;
}

friendsRouter.post('/:id/party', async (req, res) => {
  const ownerId = owner(req, res);
  if (ownerId === null) return;
  if (!friendsOn()) return res.status(409).json({ error: 'Turn Friends on first.' });
  let onBoard = null; // { friend, board } once the friend has been put on the board
  try {
    const party = await inTurn(async () => {
      const friend = await findFriend(pool, ownerId, req.params.id);
      if (!friend) throw Object.assign(new Error('That friend is not on your list.'), { statusCode: 404 });
      const role = req.body?.role === 'viewer' ? 'viewer' : 'member';
      // One board at a time per friend: an earlier party with them ends first,
      // and with it their place on that board.
      await endParties({ friendId: friend.id });
      if (listParties().length >= MAX_PARTIES) {
        throw Object.assign(new Error(`You are sharing with ${MAX_PARTIES} friends already. End one first.`), { statusCode: 409, code: 'TOO_MANY' });
      }
      const board = await putOnBoard(pool, { ownerId, friend, workspaceId: req.body?.workspaceId, role });
      onBoard = { friend, board };
      const settings = readFriendsSettings();
      const started = await startParty({ friend, board, role, hostName: settings.name, hostKey: settings.key });
      onBoard = null;
      return started;
    });
    res.status(201).json({ ...(await cardFor(req)), party });
  } catch (error) {
    // A share that did not start leaves nobody on the board.
    if (onBoard) await takeOffBoard(onBoard.friend, onBoard.board);
    if (error.message === 'Workspace access denied' || error.message === 'Workspace role does not allow this operation') {
      return res.status(403).json({ error: 'You can only share a board you own or manage.' });
    }
    sendError(res, error, 'starting a party');
  }
});

friendsRouter.delete('/:id', async (req, res) => {
  const ownerId = owner(req, res);
  if (ownerId === null) return;
  try {
    const removed = await removeFriend(pool, { ownerId, friendId: req.params.id });
    // Removed means out now: their party, their sign-in and their open pages.
    if (removed) await endParties({ friendId: removed.id });
    log.info('friends: removed', { found: Boolean(removed), by: ownerId });
    res.json(await cardFor(req));
  } catch (error) {
    sendError(res, error, 'removing a friend');
  }
});
