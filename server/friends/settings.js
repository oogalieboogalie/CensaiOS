// Friends: the owner's switch and this computer's identity, kept in
// .homebase-state/friends/ next to the other settings of this copy.
//
//   settings.json     { on, ownerId, name, key }
//                     key is the PUBLIC half of this computer's identity.
//   me.private.json   the secret half, written by tailcat itself and
//                     readable by this user only. It never leaves this
//                     computer and censaiOS never reads what is in it.

import fs from 'node:fs';
import path from 'node:path';
import { cleanLabel, plainKey } from './codes.js';

const FILE_NAME = 'settings.json';
let cached = null;

export function friendsDir(env = process.env) {
  return path.join(env.HOMEBASE_STATE_DIR || path.resolve(process.cwd(), '.homebase-state'), 'friends');
}

export const identityFile = (env = process.env) => path.join(friendsDir(env), 'me.private.json');

export function readFriendsSettings({ env = process.env, fresh = false } = {}) {
  if (cached && !fresh) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(friendsDir(env), FILE_NAME), 'utf8'));
    cached = { on: raw.on === true, ownerId: raw.ownerId ?? null, name: cleanLabel(raw.name), key: plainKey(raw.key) };
  } catch {
    cached = { on: false, ownerId: null, name: '', key: '' };
  }
  // No identity file, no identity: a copied settings file alone proves nothing.
  if (cached.key && !fs.existsSync(identityFile(env))) cached = { ...cached, key: '' };
  return cached;
}

export function writeFriendsSettings(patch = {}, { env = process.env } = {}) {
  const current = readFriendsSettings({ env });
  const next = {
    on: typeof patch.on === 'boolean' ? patch.on : current.on,
    ownerId: patch.ownerId !== undefined ? patch.ownerId : current.ownerId,
    name: patch.name !== undefined ? cleanLabel(patch.name) : current.name,
    key: patch.key !== undefined ? plainKey(patch.key) : current.key,
  };
  const dir = friendsDir(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(next, null, 2), 'utf8');
  cached = next;
  return next;
}

export function resetFriendsSettingsCache() {
  cached = null;
}
