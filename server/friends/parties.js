// A party: one board shared with one friend, right now.
//
// For each party censaiOS opens a port of its own that only this computer
// can reach (127.0.0.1), and asks tailcat to lead exactly one friend's
// computer to it under a fresh address. So whoever arrives on that port is
// that friend: tailcat checked their key before a single byte got here.
//
// The friend's browser opens it under a name made for this party alone
// ("p-….localhost"), so it shares no sign-in with the friend's own censaiOS
// or with any other board they have joined.
//
// The party also has a password of its own, carried in the party code, and
// the way in asks for it. Two locks, so that neither a tailcat that lets a
// stranger through nor a party code that reaches a stranger is enough.
//
// Every connection on a party port is marked as coming from another
// computer (webOs/door.js) and as belonging to this party. The friend comes
// in as their own account, never as the owner. A party ends when the owner
// ends it, removes the friend, turns Friends off, or censaiOS stops. Its
// address then never works again.

import http from 'node:http';
import crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { markThroughDoor } from '../webOs/door.js';
import { makePartyCode } from './codes.js';
import { endSavedSignIns, takeOffBoards } from './partyCleanup.js';
import { MAX_PARTIES, PARTY, PartyError, closing, isPartyHost, parties, partyOf, publicParty } from './partyState.js';
import { shareWithFriend } from './tailcat.js';

// The other halves of a party, for the parts that only know this file.
export { takeOffBoard } from './partyCleanup.js';
export { checkPartySignIn, partyGuard, rememberPartySignIn } from './partyGuard.js';
export { MAX_PARTIES, PartyError, cameOnPartyPort, hasPartyPassword, listParties, partyOf } from './partyState.js';

const log = createLogger('friends');

// How long an ended party's port stays up, answering only "this is no longer
// shared with you", so the friend's open page says why instead of going blank.
const SAY_WHY_MS = 10 * 60 * 1000;

let wiring = null; // { mainServer, app }

/** Called once at server start (webOs/doorListener.js) with the app and its live-sync server. */
export function wireParties(mainServer, app) {
  wiring = { mainServer, app };
  cleaned = null;
  cleanStart();
}

// No party outlives a restart, so neither does a sign-in made in one, or a
// friend's place on a board. Tried when censaiOS starts; if the database was
// not up yet, tried again before the first party (endParties), which is
// before anything new could be swept away with the old.
let cleaned = null;
function cleanStart() {
  cleaned ??= (async () => {
    const swept = (await endSavedSignIns(null)) && (await takeOffBoards(null));
    if (!swept) cleaned = null;
  })();
  return cleaned;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function shut(party) {
  closing.delete(party);
  clearTimeout(party.shutTimer);
  party.tunnel?.stop();
  party.server?.close();
  for (const socket of party.sockets) socket.destroy();
  party.sockets.clear();
}

/**
 * Ends a party. From this line on nothing on its port is let in: the party
 * is off the list, its open connections are cut and its sign-ins are gone.
 * With `sayWhy`, the port itself stays up a little longer and answers every
 * request with the "no longer shared" page (partyGuard).
 */
function close(party, { sayWhy = false } = {}) {
  parties.delete(party.id);
  for (const socket of party.sockets) socket.destroy();
  party.sockets.clear();
  for (const entry of party.signIns) {
    try { entry.store?.destroy?.(entry.id, () => {}); } catch { /* already gone */ }
  }
  party.signIns.length = 0;
  if (!sayWhy || !party.code) return shut(party);
  if (closing.size >= MAX_PARTIES) shut(closing.values().next().value);
  closing.add(party);
  party.shutTimer = setTimeout(() => shut(party), SAY_WHY_MS);
  party.shutTimer.unref?.();
  return undefined;
}

/**
 * Starts sharing one board with one friend. The caller ends any earlier
 * party with the same friend first (endParties), so a friend holds one
 * working code, and is on one of the owner's boards, at a time.
 * @param {{ friend: object, board: {id: string, name: string}, role: string, hostName: string, hostKey: string }} input
 */
export async function startParty({ friend, board, role, hostName, hostKey }) {
  if (!wiring) throw new PartyError('censaiOS is still starting. Try again in a moment.', { statusCode: 503 });

  if ([...parties.values()].some((old) => old.friend.id === friend.id)) {
    throw new PartyError('You are already sharing a board with this friend. Stop that first.', { code: 'ALREADY_SHARING' });
  }
  if (parties.size >= MAX_PARTIES) {
    throw new PartyError(`You are sharing with ${MAX_PARTIES} friends already. End one first.`, { code: 'TOO_MANY' });
  }
  const party = {
    id: crypto.randomUUID(), friend, board, role, hostName,
    startedAt: new Date().toISOString(), joined: false, code: '',
    secret: crypto.randomBytes(24).toString('base64url'),
    label: `p-${crypto.randomBytes(6).toString('hex')}`,
    sockets: new Set(), signIns: [], server: null, tunnel: null,
  };
  parties.set(party.id, party);
  try {
    const server = http.createServer(wiring.app);
    party.server = server;
    server.on('connection', (socket) => {
      markThroughDoor(socket);
      socket[PARTY] = party;
      party.sockets.add(socket);
      socket.once('close', () => party.sockets.delete(socket));
    });
    server.on('upgrade', (req, socket, head) => {
      if (!partyOf(req) || !isPartyHost(party, req.headers?.host)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      wiring.mainServer.emit('upgrade', req, socket, head);
    });
    const port = await listen(server);
    party.tunnel = shareWithFriend({ friendKey: friend.key, port });
    // If tailcat stops by itself, the party is over.
    party.tunnel.child.once('exit', () => {
      if (parties.get(party.id) !== party) return;
      close(party);
      endSavedSignIns([party.id]);
      takeOffBoards([party]);
    });
    const address = await party.tunnel.address;
    if (parties.get(party.id) !== party) throw new PartyError('Sharing was ended.', { code: 'ENDED' });
    party.code = makePartyCode({ address, hostName, hostKey, boardName: board.name, boardId: board.id, token: party.secret, label: party.label });
    log.info('friends: a party started', { partyId: party.id, friendId: friend.id, role });
    return publicParty(party);
  } catch (error) {
    close(party);
    await takeOffBoards([party]);
    log.warn('friends: a party did not start', { friendId: friend.id, code: safeErrorCode(error) });
    throw error;
  }
}

/**
 * Ends parties: one by id, a friend's, or all of them. The friend is out at
 * once, and for a short while their open page is told why. `atOnce` skips
 * that (censaiOS itself is stopping).
 */
export async function endParties({ partyId = null, friendId = null, atOnce = false } = {}) {
  if (!atOnce) await cleanStart();
  const ending = [...parties.values()].filter((party) => (partyId ? party.id === partyId : friendId ? party.friend.id === friendId : true));
  for (const party of ending) close(party, { sayWhy: !atOnce });
  if (atOnce && !partyId && !friendId) for (const party of [...closing]) shut(party);
  if (ending.length) {
    await endSavedSignIns(ending.map((party) => party.id));
    await takeOffBoards(ending);
    log.info('friends: parties ended', { count: ending.length });
  }
  return ending.length;
}

process.once('exit', () => { for (const party of [...parties.values(), ...closing]) party.tunnel?.stop(); });
