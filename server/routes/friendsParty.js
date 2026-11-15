// Friends, on a party port: what the page a friend opened asks before they
// are signed in. No sign-in is needed for these, and they exist only on a
// port where a board is being shared with one friend (friends/parties.js).
// Both ask for the party's own password (header X-Party-Token, from the
// party code). Hangs under /api/web-os/friends (server/routes/webOs.js).
//
//   GET  /party/hello   who is sharing, which board, and who you are here
//   POST /party/enter   the friend signs in as their own account

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { authSecurityRateLimiter } from '../middleware/standardRateLimits.js';
import { establishAuthenticatedSession } from '../security/authSession.js';
import { doorUsable } from '../webOs/door.js';
import { WRONG_ADDRESS } from '../friends/endedPage.js';
import { hasPartyPassword, rememberPartySignIn } from '../friends/parties.js';
import { readFriendsSettings } from '../friends/settings.js';

const log = createLogger('friends');
export const friendsPublicRouter = express.Router();

const friendsOn = () => doorUsable() && readFriendsSettings().on && Boolean(readFriendsSettings().key);

friendsPublicRouter.get('/party/hello', (req, res) => {
  const party = req.friendParty;
  if (!party) return res.status(404).json({ error: 'Not found.' });
  // Without the party's password this says only that a board is shared here.
  if (!hasPartyPassword(req)) return res.json({ app: 'censaiOS', needsCode: true });
  res.json({ app: 'censaiOS', host: party.hostName, friend: party.friend.name, boardId: party.board.id, boardName: party.board.name });
});

friendsPublicRouter.post('/party/enter', authSecurityRateLimiter, async (req, res) => {
  const party = req.friendParty;
  if (!party || !friendsOn()) return res.status(403).json({ error: 'This board is not being shared with you right now.', partyEnded: true });
  if (!hasPartyPassword(req)) return res.status(403).json({ error: WRONG_ADDRESS, needsCode: true });
  if (!dbReady()) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'censaiOS is still starting, please try again in a moment.' });
  }
  try {
    // The friend's own account, looked up fresh: never the owner's.
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role
         FROM friends f JOIN users u ON u.id = f.user_id
        WHERE f.id = $1 AND f.friend_key = $2`,
      [party.friend.id, party.friend.key],
    );
    const account = rows[0];
    if (!account || account.role === 'admin') {
      return res.status(403).json({ error: 'This board is not being shared with you right now.', partyEnded: true });
    }
    await establishAuthenticatedSession(req, account);
    rememberPartySignIn(req, party);
    log.info('friends: a friend came in', { partyId: party.id, friendId: party.friend.id, userId: account.id });
    res.json({ ok: true, user: { id: account.id, name: account.name }, boardId: party.board.id });
  } catch (error) {
    log.error('friends: sign-in failed', { code: safeErrorCode(error) });
    res.status(500).json({ error: 'Could not open the board.' });
  }
});
