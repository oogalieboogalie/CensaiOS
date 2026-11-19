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
import { openQuickInvite, partyHost, readPartyCode } from './codes.js';
import { KNOCK_PATH } from './quick.js';
import { identityFile } from './settings.js';
import { reachFriend } from './tailcat.js';

const log = createLogger('friends');
export const MAX_JOINS = 4;
const ANSWER_TIMEOUT_MS = 20 * 1000;
const WATCH_EVERY_MS = 15 * 1000;
const HELLO_PATH = '/api/web-os/friends/party/hello';

/**
 * A friend's board opens in the browser at a port on the computer that runs
 * censaiOS. In Docker that port is inside the container, so a Docker install
 * opens friends' boards on a few set ports that docker-compose.yml publishes
 * to the computer under the same numbers (CENSAI_FRIENDS_JOIN_PORTS, for
 * example "3031-3034"). Outside Docker any free port will do: [].
 */
export function joinPorts(env = process.env) {
  if (env.CENSAI_IN_CONTAINER !== '1') return [];
  const range = /^(\d{4,5})-(\d{4,5})$/.exec(String(env.CENSAI_FRIENDS_JOIN_PORTS || '').trim());
  const [first, last] = range ? [Number(range[1]), Number(range[2])] : [0, 0];
  if (!range || first < 1024 || last > 65535 || last < first || last - first >= 16) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** False only in a Docker install that was started without those ports. */
export const canJoinHere = (env = process.env) => env.CENSAI_IN_CONTAINER !== '1' || joinPorts(env).length > 0;
export const needJoinHere = () => {
  if (!canJoinHere()) throw new JoinError('This censaiOS runs in Docker and was started without the ports a friend\'s board opens on (3031 to 3034 in docker-compose.yml). You can still share your boards and invite people. To open theirs, update censaiOS and start it again.', { code: 'NO_JOIN_IN_DOCKER' });
};

let lastSetPort = 0;
/**
 * The set port for the next join in Docker, or 0 outside Docker. Takes the
 * one after the last given, so a port a join has just left gets a moment
 * before it is used again.
 */
function nextSetPort() {
  const all = joinPorts();
  if (!all.length) return 0;
  const taken = new Set([...joins.values()].map((join) => join.localPort));
  const from = all.indexOf(lastSetPort) + 1;
  const free = [...all.slice(from), ...all.slice(0, from)].find((port) => !taken.has(port));
  if (!free) throw new JoinError(`You have ${all.length} friends' boards open already. Leave one first.`, { code: 'TOO_MANY' });
  lastSetPort = free;
  return free;
}

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
  needJoinHere();
  const party = readPartyCode(code);
  party.host = partyHost(party.label);
  if (!party.host || !party.token || !party.port) throw new JoinError('That party code is not complete. Ask for a new one.', { statusCode: 400, code: 'BAD_CODE' });
  if (hostName) party.hostName = hostName;
  if (joins.size >= MAX_JOINS) throw new JoinError(`You have ${MAX_JOINS} friends' boards open already. Leave one first.`, { code: 'TOO_MANY' });
  const join = { id: crypto.randomUUID(), url: '', hostName: party.hostName, boardName: party.boardName, startedAt: new Date().toISOString(), tunnel: null, localPort: nextSetPort() };
  joins.set(join.id, join);
  try {
    join.tunnel = reachFriend({ address: party.address, identityFile: identityFile(), port: party.port, localPort: join.localPort });
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

function knockOnce(port, body) {
  return new Promise((resolve) => {
    const text = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: KNOCK_PATH, method: 'POST', timeout: 8000, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) } }, (res) => {
      let got = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { got = (got + chunk).slice(0, 8192); });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(got) }); } catch { resolve(null); } });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end(text);
  });
}

/**
 * Uses a quick invite: opens the box with the 8 digits, goes to the door it
 * leads to, and asks to be let in as this computer's own friend code.
 * @returns {Promise<{ partyCode: string, hostCode: string }>} the ordinary party code made for this computer, and who is sharing.
 */
export async function useQuickInvite({ invite, doorCode, friendCode, timeoutMs = 2 * ANSWER_TIMEOUT_MS }) {
  needJoinHere();
  const { address, port } = await openQuickInvite(invite, doorCode);
  const tunnel = reachFriend({ address, identityFile: identityFile(), port });
  let open = true;
  tunnel.child.once('exit', () => { open = false; });
  try {
    const local = await tunnel.port;
    const until = Date.now() + timeoutMs;
    let said = null;
    // Silence means the tunnel is still finding its way. Any answer is final.
    while (!said && open && Date.now() < until) {
      said = await knockOnce(local, { doorCode, friendCode });
      if (!said) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!said) throw new JoinError('No answer from that invite. It may be over, or their censaiOS or internet is off. Ask for a new one.', { code: 'NO_ANSWER' });
    if (said.status !== 200 || !said.body?.partyCode || !said.body?.hostCode) {
      throw new JoinError(said.body?.error || 'That invite did not let you in. Ask for a new one.', { statusCode: 409, code: said.body?.code || 'NOT_LET_IN' });
    }
    return { partyCode: String(said.body.partyCode), hostCode: String(said.body.hostCode) };
  } finally {
    tunnel.stop();
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
