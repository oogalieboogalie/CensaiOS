// The two codes people pass to each other by text or chat.
//
//  Friend code (cf1-…)  who someone is: the name they chose and the public
//                       half of their censaiOS identity. It is safe to post
//                       anywhere: holding it lets nobody in. The secret half
//                       never leaves their computer.
//  Party code (cp1-…)   where one board is being shared right now, made for
//                       one friend, with that party's own password. Only that
//                       friend's computer can use it, and it stops working
//                       when the sharing ends. Unlike a friend code it is
//                       private: it goes to that one friend.
//
//  Quick invite (cq1-…) a locked box for someone who is not on the list yet.
//                       Inside is where a door on the owner's computer is.
//                       Only the 8-digit door code opens the box, and the
//                       door itself asks for the same 8 digits, a few tries
//                       at most, while the owner holds it open
//                       (friends/quick.js). So the box can travel openly.
//
// Each code ends with a short check so a code cut off in a text message is
// caught before anything is tried with it.

import crypto from 'node:crypto';

const KEY_PATTERN = /^[0-9a-f]{64}$/;
const ADDRESS_PATTERN = /^tc[A-Za-z0-9_-]{16,700}$/;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const LABEL_PATTERN = /^p-[0-9a-f]{12}$/;

/**
 * The name a friend's browser uses for one shared board:
 * "<label>.localhost". Browsers keep sign-ins apart by name, so a name of
 * its own means the friend's own censaiOS (at localhost or 127.0.0.1) and
 * this board never see each other's sign-in. '' when the label is not one.
 */
export const partyHost = (label) => (LABEL_PATTERN.test(String(label || '')) ? `${label}.localhost` : '');
const MAX_CODE_LENGTH = 1400;

export class CodeError extends Error {
  constructor(message, code = 'BAD_CODE') {
    super(message);
    this.code = code;
    this.statusCode = 400;
  }
}

/** One line of text someone else chose: no control characters, not too long. */
export function cleanLabel(value, max = 40) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 'nodekey:AB12…' or 'ab12…' -> 'ab12…' (64 hex), or '' when it is not a key. */
export function plainKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/^nodekey:/, '');
  return KEY_PATTERN.test(key) ? key : '';
}

export const isTailcatAddress = (value) => typeof value === 'string' && ADDRESS_PATTERN.test(value);

const check = (kind, body) => crypto.createHash('sha256').update(`${kind}:${body}`).digest('hex').slice(0, 6);

const sealed = (kind, body) => `${kind}-${body}-${check(kind, body)}`;

/** The middle of a code, once its kind and its check are right. */
function open(kind, text, what) {
  const code = String(text || '').trim();
  const cutOff = new CodeError(`That ${what} is not complete. Copy the whole code and paste it again.`);
  if (!code || code.length > MAX_CODE_LENGTH) throw cutOff;
  const match = /^([a-z]{2}\d)-([A-Za-z0-9_-]+)-([0-9a-f]{6})$/.exec(code);
  if (!match) throw cutOff;
  if (match[1] !== kind) throw new CodeError(`That is not a ${what}.`, 'WRONG_KIND');
  if (check(kind, match[2]) !== match[3]) throw cutOff;
  return { body: Buffer.from(match[2], 'base64url'), cutOff };
}

// A friend code is kept short, since people text it: the 32 bytes of the
// key, then the name.
export function makeFriendCode({ name, key }) {
  const clean = plainKey(key);
  if (!clean) throw new CodeError('This censaiOS has no identity yet.');
  const body = Buffer.concat([Buffer.from(clean, 'hex'), Buffer.from(cleanLabel(name) || 'Someone', 'utf8')]);
  return sealed('cf1', body.toString('base64url'));
}

/** @returns {{ name: string, key: string }} */
export function readFriendCode(text) {
  const { body, cutOff } = open('cf1', text, 'friend code');
  if (body.length < 32) throw cutOff;
  return { name: cleanLabel(body.subarray(32).toString('utf8')) || 'Someone', key: body.subarray(0, 32).toString('hex') };
}

function pack(kind, data) {
  return sealed(kind, Buffer.from(JSON.stringify(data), 'utf8').toString('base64url'));
}

function unpack(kind, text, what) {
  const { body, cutOff } = open(kind, text, what);
  try {
    const data = JSON.parse(body.toString('utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // falls through
  }
  throw cutOff;
}

const isPort = (value) => Number.isInteger(value) && value >= 1 && value <= 65535;

export function makePartyCode({ address, hostName, hostKey, boardName, boardId, token, label, port }) {
  if (!isTailcatAddress(address)) throw new CodeError('Sharing has not started yet.');
  const key = plainKey(hostKey);
  return pack('cp1', {
    a: address, h: cleanLabel(hostName), b: cleanLabel(boardName, 80), w: String(boardId || ''),
    // Who is sharing, so the person joining can see it is someone on their list.
    ...(key ? { k: Buffer.from(key, 'hex').toString('base64url') } : {}),
    // This party's own password. The board asks for it on the way in.
    ...(TOKEN_PATTERN.test(String(token || '')) ? { t: token } : {}),
    // The name the friend's browser opens it under (partyHost).
    ...(partyHost(label) ? { n: label } : {}),
    // The port the board is shared on. Tailcat cannot rename it, so the friend needs the number.
    ...(isPort(port) ? { p: port } : {}),
  });
}

/** @returns {{ address: string, hostName: string, hostKey: string, boardName: string, boardId: string, token: string, label: string, port: number }} */
export function readPartyCode(text) {
  const data = unpack('cp1', text, 'party code');
  if (!isTailcatAddress(data.a)) throw new CodeError('That party code is not complete. Copy the whole code and paste it again.');
  return {
    address: data.a,
    hostName: cleanLabel(data.h) || 'A friend',
    hostKey: typeof data.k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(data.k) ? Buffer.from(data.k, 'base64url').toString('hex') : '',
    boardName: cleanLabel(data.b, 80) || 'a board',
    boardId: ID_PATTERN.test(String(data.w || '')) ? String(data.w) : '',
    token: typeof data.t === 'string' && TOKEN_PATTERN.test(data.t) ? data.t : '',
    label: partyHost(data.n) ? data.n : '',
    port: isPort(data.p) ? data.p : 0,
  };
}

// ------------------------------------------------------------ quick invite

export const isDoorCode = (value) => typeof value === 'string' && /^\d{8}$/.test(value);

/** Eight digits, every one as likely as the next. */
export const makeDoorCode = () => String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');

// Slow on purpose: trying all hundred million door codes against a box takes
// far longer than the door stays open.
const boxKey = (doorCode, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(doorCode, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
});

/** Locks a door's address and port in a box that the door code opens. */
export async function makeQuickInvite({ address, port, doorCode }) {
  if (!isTailcatAddress(address) || !isPort(port) || !isDoorCode(doorCode)) throw new CodeError('The invite is not ready yet.');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', await boxKey(doorCode, salt), iv);
  const locked = Buffer.concat([cipher.update(JSON.stringify({ a: address, p: port }), 'utf8'), cipher.final()]);
  return sealed('cq1', Buffer.concat([salt, iv, cipher.getAuthTag(), locked]).toString('base64url'));
}

/** @returns {Promise<{ address: string, port: number }>} what is in the box; throws when the door code is not the one that locked it. */
export async function openQuickInvite(text, doorCode) {
  const { body, cutOff } = open('cq1', text, 'invite');
  if (body.length < 16 + 12 + 16 + 8) throw cutOff;
  const wrong = new CodeError('Those 8 digits do not open this invite. Check them and try again.', 'WRONG_DOOR_CODE');
  if (!isDoorCode(doorCode)) throw wrong;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', await boxKey(doorCode, body.subarray(0, 16)), body.subarray(16, 28));
    decipher.setAuthTag(body.subarray(28, 44));
    const data = JSON.parse(Buffer.concat([decipher.update(body.subarray(44)), decipher.final()]).toString('utf8'));
    if (isTailcatAddress(data?.a) && isPort(data?.p)) return { address: data.a, port: data.p };
  } catch {
    // A box that does not open means the digits are not the ones that locked it.
    throw wrong;
  }
  throw wrong;
}

/** Which kind of code this looks like, without reading it: 'friend', 'party', 'quick' or ''. */
export function kindOfCode(text) {
  const code = String(text || '').trim();
  if (code.startsWith('cf1-')) return 'friend';
  if (code.startsWith('cp1-')) return 'party';
  if (code.startsWith('cq1-')) return 'quick';
  return '';
}
