// Friends, the quick invite (server/friends/quick.js): letting in someone
// who is not on the list yet, with 8 digits and a door open for 30 seconds.
// For the owner of this copy, with the other Friends routes (friends.js).
//
//   POST   /quick       { workspaceId, role }   make an invite for a board
//   POST   /quick/open                          open its door for 30 seconds
//   DELETE /quick                               end it
//   POST   /quick/use   { invite, doorCode }    come in on someone else's invite

import pool from '../db.js';
import { makeFriendCode, readFriendCode, readPartyCode } from '../friends/codes.js';
import { joinParty, useQuickInvite } from '../friends/joins.js';
import { endQuickInvite, openQuickDoor, startQuickInvite } from '../friends/quick.js';
import { readFriendsSettings } from '../friends/settings.js';
import { addFriend, boardToShare } from '../friends/store.js';

/** @param {import('express').Router} router the Friends router; the rest is what friends.js shares with these routes. */
export function addQuickInviteRoutes(router, { owner, friendsOn, cardFor, sendError, shareBoard, notYourBoard, log }) {

  router.post('/quick', async (req, res) => {
    const ownerId = owner(req, res);
    if (ownerId === null) return;
    if (!friendsOn()) return res.status(409).json({ error: 'Turn Friends on first.' });
    try {
      const role = req.body?.role === 'viewer' ? 'viewer' : 'member';
      const board = await boardToShare(pool, { ownerId, workspaceId: req.body?.workspaceId });
      await startQuickInvite({
        board,
        role,
        // Called by the door once the right 8 digits arrived in time.
        admit: async ({ friendCode }) => {
          if (!friendsOn()) throw Object.assign(new Error('This invite is over. Ask for a new one.'), { statusCode: 410, code: 'INVITE_OVER' });
          const { name, key } = readFriendCode(friendCode);
          const settings = readFriendsSettings();
          const { friend } = await addFriend(pool, { ownerId, name, key, ownKey: settings.key });
          const party = await shareBoard({ ownerId, friend, workspaceId: board.id, role });
          log.info('friends: added by quick invite', { friendId: friend.id, by: ownerId });
          return { name: friend.name, friendId: friend.id, partyCode: party.code, hostCode: makeFriendCode({ name: settings.name, key: settings.key }) };
        },
      });
      res.status(201).json(await cardFor(req));
    } catch (error) {
      if (notYourBoard(error)) return res.status(403).json({ error: 'You can only share a board you own or manage.' });
      sendError(res, error, 'making a quick invite');
    }
  });

  router.post('/quick/open', async (req, res) => {
    const ownerId = owner(req, res);
    if (ownerId === null) return;
    try {
      openQuickDoor();
      res.json(await cardFor(req));
    } catch (error) {
      sendError(res, error, 'opening the door');
    }
  });

  router.delete('/quick', async (req, res) => {
    const ownerId = owner(req, res);
    if (ownerId === null) return;
    endQuickInvite();
    res.json(await cardFor(req));
  });

  router.post('/quick/use', async (req, res) => {
    const ownerId = owner(req, res);
    if (ownerId === null) return;
    if (!friendsOn()) return res.status(409).json({ error: 'Turn Friends on first.' });
    try {
      const settings = readFriendsSettings();
      const { partyCode, hostCode } = await useQuickInvite({
        invite: req.body?.invite,
        doorCode: String(req.body?.doorCode || '').replace(/\D/g, ''),
        friendCode: makeFriendCode({ name: settings.name, key: settings.key }),
      });
      // Whoever let us in goes on the list, and the party has to be theirs.
      const host = readFriendCode(hostCode);
      if (readPartyCode(partyCode).hostKey !== host.key) throw Object.assign(new Error('That invite did not let you in. Ask for a new one.'), { statusCode: 409 });
      const { friend, alreadyThere } = await addFriend(pool, { ownerId, name: host.name, key: host.key, ownKey: settings.key });
      const join = await joinParty({ code: partyCode, hostName: friend.name });
      log.info('friends: came in on a quick invite', { friendId: friend.id, by: ownerId });
      res.status(201).json({ ...(await cardFor(req)), joined: join, added: { id: friend.id, name: friend.name, alreadyThere } });
    } catch (error) {
      sendError(res, error, 'using a quick invite');
    }
  });
}
