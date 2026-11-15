// The rules for every request on a party port, and for a sign-in made there.

import { addOwnAddressRule } from '../webOs/door.js';
import { ENDED, WRONG_ADDRESS, endedPage } from './endedPage.js';
import { PARTY, cameOnPartyPort, isPartyHost, parties, partyOf } from './partyState.js';

const USER_FIELDS = ['userId', 'userRole', 'userEmail', 'userName', 'friendPartyId'];
// On a party port a friend signs in one way only: as themselves (routes/friendsParty.js).
const OTHER_SIGN_INS = /^\/api\/(auth\/(developer|local|google)|hub-auth|web-os\/pair|web-os\/tailnet|invites\/redeem)(\/|$)/i;

/** Marks this sign-in as made in a party, so it ends with the party. */
export function rememberPartySignIn(req, party) {
  req.session.friendPartyId = party.id;
  party.signIns.push({ id: req.sessionID, store: req.sessionStore });
  party.joined = true;
}

/**
 * A sign-in made in a party counts only on that party's own port, while the
 * party is live. Anywhere else (another party, the Open anywhere port, this
 * computer's own address, a copied cookie) it is dropped. Checked for every
 * request there is (webOs/doorListener.js).
 */
export function checkPartySignIn(req) {
  const signedInAt = req?.session?.friendPartyId;
  if (!signedInAt || partyOf(req)?.id === signedInAt) return true;
  for (const field of USER_FIELDS) delete req.session[field];
  return false;
}

function refuse(req, res, message, page) {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    if (page) return res.status(403).type('html').send(page);
    return res.status(403).type('text/plain; charset=utf-8').send(message);
  }
  return res.status(403).json({ error: message, partyEnded: true });
}

/**
 * Runs first for every request from another computer
 * (webOs/doorListener.js). Returns true when the request arrived on a party
 * port, which means this guard has answered it or passed it on.
 */
export function partyGuard(req, res, next) {
  if (!cameOnPartyPort(req)) return false;
  const party = partyOf(req);
  if (!party) { refuse(req, res, ENDED, endedPage(req.socket[PARTY].hostName)); return true; }
  // Only under the party's own name (isPartyHost): not 127.0.0.1 or
  // localhost, and not a name some other web page chose.
  if (!isPartyHost(party, req.headers?.host)) { refuse(req, res, WRONG_ADDRESS); return true; }
  if (OTHER_SIGN_INS.test(req.path)) {
    res.status(403).json({ error: 'On a shared board you come in as yourself. Nothing else signs in here.', partyOnly: true });
    return true;
  }
  req.friendParty = party;
  next();
  return true;
}

// A page a friend opened may talk to this copy when its address and the
// address it asks are the same one: a live party's own name.
addOwnAddressRule((host) => [...parties.values()].some((party) => isPartyHost(party, host)));
