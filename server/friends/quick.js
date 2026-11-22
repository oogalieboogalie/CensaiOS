// A quick invite: letting in someone who is not on the friends list yet,
// with an 8-digit code and a door that is open for 30 seconds.
//
// What the owner does: makes an invite, sends it any way they like, tells
// the person the 8 digits, and opens the door. What happens:
//
//   1. The invite is a locked box (codes.js). Inside is the address of a
//      door on this computer. Only the 8 digits open the box.
//   2. The door is a tiny server of its own. It answers one question,
//      "here are the 8 digits and my friend code, may I come in?", and only
//      while the owner holds it open. It is not the board and leads nowhere.
//   3. The right digits, in time: the person goes on the friends list and
//      the board is shared with them the ordinary way (parties.js), under an
//      address that only their computer can reach. The door closes for good.
//   4. From there they are a friend like any other: they stay until they
//      leave or the owner presses Stop sharing.
//
// What keeps a stranger out: the door counts wrong tries and closes for good
// after a few, it does not look at a code at all while it is shut, and one
// invite lets one person in. Someone who copied the box still has to get the
// 8 digits past this door, live, in those 30 seconds.

import http from 'node:http';
import crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { isDoorCode, makeDoorCode, makeQuickInvite } from './codes.js';
import { shareWithAnyone } from './tailcat.js';

const log = createLogger('friends');

export const DOOR_OPEN_MS = 30 * 1000;
export const INVITE_KEEP_MS = 10 * 60 * 1000;
export const MAX_TRIES = 5;
const MAX_BODY = 4096;
const REPEAT_ANSWER_MS = 20 * 1000;
export const KNOCK_PATH = '/knock';

let invite = null; // the one live invite, or null
let lastGuest = null; // { name, at } of the last person a quick invite let in

export class QuickError extends Error {
  constructor(message, { statusCode = 409, code = 'QUICK_FAILED' } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const doorOpen = (now = Date.now()) => Boolean(invite && invite.openUntil > now);

/** What the owner's card shows: the invite, the 8 digits, and whether the door is open. */
export function quickInviteCard(now = Date.now()) {
  if (!invite?.box || invite.done) return null;
  return {
    invite: invite.box,
    doorCode: invite.doorCode,
    boardId: invite.board.id,
    boardName: invite.board.name,
    role: invite.role,
    open: doorOpen(now),
    secondsLeft: doorOpen(now) ? Math.ceil((invite.openUntil - now) / 1000) : 0,
    triesLeft: MAX_TRIES - invite.tries,
    endsAt: new Date(invite.endsAt).toISOString(),
  };
}

export const lastQuickGuest = () => lastGuest;
export const forgetQuickGuest = () => { lastGuest = null; };

/** Ends the invite: the door is gone and the box leads nowhere. */
export function endQuickInvite() {
  const old = invite;
  invite = null;
  if (!old) return false;
  clearTimeout(old.endTimer);
  clearTimeout(old.doneTimer);
  old.tunnel?.stop();
  old.server?.close();
  for (const socket of old.sockets) socket.destroy();
  return true;
}

function answer(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store', connection: 'close' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const parts = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { resolve(null); req.destroy(); return; }
      parts.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

const sameDigits = (given, wanted) => {
  const a = Buffer.from(String(given), 'utf8');
  const b = Buffer.from(wanted, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Puts the person on the list and shares the board. Never throws: the answer says what happened. */
async function letIn(mine, friendCode) {
  try {
    const guest = await mine.admit({ friendCode, board: mine.board, role: mine.role });
    lastGuest = { name: guest.name, boardName: mine.board.name, at: new Date().toISOString() };
    log.info('friends: a quick invite let someone in', { friendId: guest.friendId });
    // One invite, one person. The owner's card lets go of it now; the door
    // stays a few seconds more, only to repeat this answer to that person.
    mine.done = true;
    mine.doneTimer = setTimeout(() => { if (invite === mine) endQuickInvite(); }, REPEAT_ANSWER_MS);
    mine.doneTimer.unref?.();
    return { status: 200, body: { ok: true, partyCode: guest.partyCode, hostCode: guest.hostCode } };
  } catch (error) {
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) log.warn('friends: a quick invite could not let someone in', { code: safeErrorCode(error) });
    return { status, body: { error: status === 500 ? 'Could not open the board. Try again.' : error.message, ...(error.code ? { code: error.code } : {}) } };
  }
}

async function knock(mine, req, res) {
  if (req.method !== 'POST' || req.url !== KNOCK_PATH) return answer(res, 404, { error: 'Not found.' });
  const body = await readBody(req);
  if (invite !== mine || mine.tries >= MAX_TRIES) return answer(res, 410, { error: 'This invite is over. Ask for a new one.', code: 'INVITE_OVER' });
  if (mine.letting) {
    // The person coming in may ask twice (their first question got lost on
    // the way). They get the one answer. Anyone else is told to wait.
    const again = isDoorCode(body?.doorCode) && sameDigits(body.doorCode, mine.doorCode) && String(body.friendCode || '') === mine.letting.friendCode;
    if (!again) return answer(res, 409, { error: 'Someone is coming in on this invite right now.', code: 'BUSY' });
    const said = await mine.letting.answer;
    return answer(res, said.status, said.body);
  }
  // While the door is shut, no code is looked at, right or wrong.
  if (!doorOpen()) return answer(res, 403, { error: 'The door is not open right now. Ask them to open it, then try again.', code: 'DOOR_SHUT' });
  if (!isDoorCode(body?.doorCode) || !sameDigits(body.doorCode, mine.doorCode)) {
    mine.tries += 1;
    const left = MAX_TRIES - mine.tries;
    log.warn('friends: a wrong code at the door', { left });
    // The last try is told why before the door goes.
    if (left <= 0) res.once('close', () => { if (invite === mine) endQuickInvite(); });
    return answer(res, 403, { error: left > 0 ? 'Those 8 digits are not right.' : 'Too many wrong tries. This invite is over.', code: left > 0 ? 'WRONG_DOOR_CODE' : 'INVITE_OVER', left: Math.max(0, left) });
  }
  const friendCode = String(body.friendCode || '');
  mine.letting = { friendCode, answer: letIn(mine, friendCode) };
  const said = await mine.letting.answer;
  // A refusal (a broken friend code, a full list) leaves the door for another go.
  if (said.status !== 200 && invite === mine) mine.letting = null;
  answer(res, said.status, said.body);
  return undefined;
}

/**
 * Makes the invite and its door. The door starts shut (openQuickDoor).
 * An earlier invite ends first: there is one at a time.
 * @param {{ board: {id: string, name: string}, role: 'member'|'viewer', admit: (who: {friendCode: string, board: object, role: string}) => Promise<{name: string, friendId: string, partyCode: string, hostCode: string}> }} input
 */
export async function startQuickInvite({ board, role, admit }) {
  endQuickInvite();
  const mine = { doorCode: makeDoorCode(), board, role, admit, tries: 0, openUntil: 0, endsAt: Date.now() + INVITE_KEEP_MS, sockets: new Set(), letting: null, done: false, box: '', server: null, tunnel: null };
  invite = mine;
  try {
    mine.server = http.createServer((req, res) => { knock(mine, req, res).catch((error) => {
        log.warn('friends: the door could not answer', { code: safeErrorCode(error) });
        if (!res.headersSent && !res.destroyed) answer(res, 500, { error: 'Try again.' });
      });
    });
    mine.server.on('connection', (socket) => { mine.sockets.add(socket); socket.once('close', () => mine.sockets.delete(socket)); });
    mine.server.requestTimeout = 10 * 1000;
    const port = await new Promise((resolve, reject) => {
      mine.server.once('error', reject);
      mine.server.listen(0, '127.0.0.1', () => resolve(mine.server.address().port));
    });
    mine.tunnel = shareWithAnyone({ port });
    mine.tunnel.child.once('exit', () => { if (invite === mine) endQuickInvite(); });
    const address = await mine.tunnel.address;
    if (invite !== mine) throw new QuickError('The invite was cancelled.', { code: 'ENDED' });
    mine.box = await makeQuickInvite({ address, port, doorCode: mine.doorCode });
    if (invite !== mine) throw new QuickError('The invite was cancelled.', { code: 'ENDED' });
    mine.endTimer = setTimeout(() => { if (invite === mine) endQuickInvite(); }, INVITE_KEEP_MS);
    mine.endTimer.unref?.();
    log.info('friends: a quick invite was made', { role });
    return quickInviteCard();
  } catch (error) {
    if (invite === mine) endQuickInvite();
    throw error;
  }
}

/** Opens the door for 30 seconds. Pressing again starts the 30 seconds over. */
export function openQuickDoor() {
  if (!invite?.box || invite.done) throw new QuickError('Make an invite first.', { code: 'NO_INVITE' });
  invite.openUntil = Math.min(Date.now() + DOOR_OPEN_MS, invite.endsAt);
  return quickInviteCard();
}

process.once('exit', () => { invite?.tunnel?.stop(); });
