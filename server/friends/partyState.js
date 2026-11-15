// What is shared right now: the live parties, and the questions every other
// part asks about a request ("which party did this arrive on?").

import crypto from 'node:crypto';
import { partyHost } from './codes.js';

export const MAX_PARTIES = 8;
export const PARTY = Symbol('censai.friendParty');

export const parties = new Map(); // party id -> party
export const closing = new Set(); // ended parties still saying why

export class PartyError extends Error {
  constructor(message, { statusCode = 409, code = 'PARTY_FAILED' } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** The party this request arrived on, or null. */
export function partyOf(req) {
  const party = req?.socket?.[PARTY];
  return party && parties.get(party.id) === party ? party : null;
}

/** True when this request carries its party's own password (from the party code). */
export function hasPartyPassword(req) {
  const party = partyOf(req);
  const given = Buffer.from(String(req.get?.('x-party-token') || ''), 'utf8');
  const wanted = Buffer.from(party?.secret || '', 'utf8');
  return wanted.length > 0 && given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

/**
 * True when `host` (a Host header) is this party's own name, with or without
 * a port. A friend's page is only ever served under that name: under
 * 127.0.0.1 or localhost the browser would hand it the sign-in of the
 * friend's own censaiOS, and any other name is a web page elsewhere trying
 * to ride their browser in.
 */
export function isPartyHost(party, host) {
  const name = partyHost(party?.label);
  const given = String(host || '').trim().toLowerCase();
  return Boolean(name) && (given === name || (given.startsWith(`${name}:`) && /^\d{1,5}$/.test(given.slice(name.length + 1))));
}

/** True for any connection that arrived on a party port, live or ended. */
export const cameOnPartyPort = (req) => Boolean(req?.socket?.[PARTY]);

export function publicParty(party) {
  return {
    id: party.id,
    friendId: party.friend.id,
    friendName: party.friend.name,
    boardId: party.board.id,
    boardName: party.board.name,
    role: party.role,
    code: party.code,
    startedAt: party.startedAt,
    joined: party.joined,
  };
}

export function listParties() {
  return [...parties.values()].filter((party) => party.code).map(publicParty);
}
