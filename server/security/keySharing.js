// "Share my AI keys with": the owner's per-person switch on a local install.
//
// The AI keys in this computer's .env file are the owner's. Teammates who
// come in through Open anywhere or a share link bring their own keys. The
// owner can turn sharing on for any account (a second account of their own,
// or a teammate they trust); then that account chats, runs agents and makes
// images on the owner's keys as the owner does. Off for everyone by default.
//
// Settings live in .homebase-state/key-sharing.json, next to Open anywhere's.

import fs from 'fs';
import path from 'path';

const FILE_NAME = 'key-sharing.json';
let cached = null;

function stateDir(env = process.env) {
  return env.HOMEBASE_STATE_DIR || path.resolve(process.cwd(), '.homebase-state');
}

function cleanIds(list) {
  const ids = Array.isArray(list) ? list : [];
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 500);
}

export function readKeySharing({ env = process.env, fresh = false } = {}) {
  if (cached && !fresh) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir(env), FILE_NAME), 'utf8'));
    cached = { userIds: cleanIds(raw.userIds) };
  } catch {
    cached = { userIds: [] };
  }
  return cached;
}

/** Turns sharing on or off for one account. Returns the new settings. */
export function setKeySharing(userId, shared, { env = process.env } = {}) {
  const id = String(userId || '').trim();
  if (!id) throw new TypeError('userId is required');
  const current = new Set(readKeySharing({ env }).userIds);
  if (shared) current.add(id);
  else current.delete(id);
  const next = { userIds: cleanIds([...current]) };
  const dir = stateDir(env);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(next, null, 2), 'utf8');
  cached = next;
  return next;
}

export function isKeySharedWith(userId, options = {}) {
  const id = String(userId || '').trim();
  return Boolean(id) && readKeySharing(options).userIds.includes(id);
}

export function resetKeySharingCache() {
  cached = null;
}
