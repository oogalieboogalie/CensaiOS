// Joining a friend's party from this computer.
//
// A party code names an address that only this computer's identity can
// reach. censaiOS asks tailcat to open a port here that leads to it, checks
// that the friend's censaiOS answers, and hands back the address to open in
// a browser. A code made for someone else, or one whose party has ended,
// gets no answer at all, and that is what the person is told.

import crypto from 'node:crypto';
import http from 'node:http';
import { createLogger } from '../logger.js';
import { partyHost, readPartyCode } from './codes.js';
import { identityFile } from './settings.js';
import { reachFriend } from './tailcat.js';

const log = createLogger('friends');
export const MAX_JOINS = 4;
const ANSWER_TIMEOUT_MS = 20 * 1000;
const WATCH_EVERY_MS = 15 * 1000;
const HELLO_PATH = '/api/web-os/friends/party/hello';

const joins = new Map(); // join id -> { id, url, hostName, boardName, startedAt, tunnel, watching }

export class JoinError extends Error {
  constructor(message, { statusCode = 409, code = 'JOIN_FAILED' } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const publicJoin = (join) => ({ id: join.id, url: join.url, hostName: join.hostName, boardName: join.boardName, startedAt: join.startedAt });

export function listJoins() {
  return [...joins.values()].filter((join) => join.url).map(publicJoin);
}

function askOnce(port, { token, host }) {
  return new Promise((resolve) => {
    const headers = { accept: 'application/json', 'x-party-token': token, host: `${host}:${port}` };
    const req = http.get({ host: '127.0.0.1', port, path: HELLO_PATH, timeout: 4000, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text = (text + chunk).slice(0, 4096); });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); } catch { resolve({ status: res.statusCode, body: null }); }
      });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

/** Keeps asking until the friend's censaiOS answers, or time runs out. */
async function waitForAnswer(port, party, { timeoutMs = ANSWER_TIMEOUT_MS, stillOpen = () => true } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && stillOpen()) {
    const answer = await askOnce(port, party);
    if (answer?.body?.app === 'censaiOS' && answer.body.boardId) return answer.body;
    if (answer?.body?.partyEnded === true) return { ended: true };
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

function drop(join) {
  joins.delete(join.id);
  clearInterval(join.watching);
  join.tunnel?.stop();
}

/**
 * A party that ended gives no sign: its address just stops answering. So
 * each open join is asked now and then, and closed after two silences, which
 * turns a frozen page on this computer into a plain "can't connect".
 */
function watch(join, port, party) {
  let silences = 0;
  join.watching = setInterval(async () => {
    const answer = await askOnce(port, party);
    silences = answer?.body?.app === 'censaiOS' ? 0 : silences + 1;
    // The friend's censaiOS said the sharing ended, or it has gone quiet twice.
    if ((answer?.body?.partyEnded === true || silences >= 2) && joins.has(join.id)) {
      log.info('friends: a party ended or went quiet, closed', { joinId: join.id });
      drop(join);
    }
  }, WATCH_EVERY_MS);
  join.watching.unref?.();
}

/**
 * @param {{ code: string, hostName?: string, timeoutMs?: number }} input
 *   hostName: the name this person saved for the friend who is sharing.
 * @returns {Promise<{ id, url, hostName, boardName, startedAt }>}
 *   url opens the board in a browser on this computer, under a name made
 *   for this one party. It carries the party's password, so it is for this
 *   person only.
 */
export async function joinParty({ code, hostName = '', timeoutMs }) {
  const party = readPartyCode(code);
  party.host = partyHost(party.label);
  if (!party.host || !party.token) throw new JoinError('That party code is not complete. Ask for a new one.', { statusCode: 400, code: 'BAD_CODE' });
  if (hostName) party.hostName = hostName;
  if (joins.size >= MAX_JOINS) throw new JoinError(`You have ${MAX_JOINS} friends' boards open already. Leave one first.`, { code: 'TOO_MANY' });
  const join = { id: crypto.randomUUID(), url: '', hostName: party.hostName, boardName: party.boardName, startedAt: new Date().toISOString(), tunnel: null };
  joins.set(join.id, join);
  try {
    join.tunnel = reachFriend({ address: party.address, identityFile: identityFile() });
    // If tailcat stops by itself, the join is over, and so is its watch.
    join.tunnel.child.once('exit', () => drop(join));
    const port = await join.tunnel.port;
    const hello = await waitForAnswer(port, party, { timeoutMs, stillOpen: () => joins.has(join.id) });
    if (hello?.ended) {
      throw new JoinError(`${party.hostName} has stopped sharing this board. Ask for a new party code.`, { code: 'PARTY_ENDED' });
    }
    if (!hello) {
      throw new JoinError(
        `No answer from ${party.hostName}. Either this code was made for a different person, or ${party.hostName} has stopped sharing. Ask for a new code.`,
        { code: 'NO_ANSWER' },
      );
    }
    if (!hostName) join.hostName = hello.host || join.hostName;
    join.boardName = hello.boardName || join.boardName;
    // Under the party's own name, never 127.0.0.1 or localhost: a browser
    // sends a sign-in to every port of the name it was made for, and this
    // person's own censaiOS lives at one of those two.
    join.url = `http://${party.host}:${port}/?party=${encodeURIComponent(party.token)}`;
    watch(join, port, party);
    log.info('friends: joined a party', { joinId: join.id });
    return publicJoin(join);
  } catch (error) {
    drop(join);
    throw error;
  }
}

export function leaveParty(joinId) {
  const join = joins.get(String(joinId || ''));
  if (!join) return false;
  drop(join);
  return true;
}

export function leaveEveryParty() {
  for (const join of [...joins.values()]) drop(join);
}

process.once('exit', () => { for (const join of joins.values()) join.tunnel?.stop(); });
