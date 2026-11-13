// "My Tailscale devices": the owner's switch and tick list, kept in
// .homebase-state/tailnet.json next to the Open anywhere settings.
//
//   on       the switch. Off until the owner turns it on.
//   ownerId  the person who turned it on. A switched-on device opens
//            censaiOS signed in as them.
//   devices  the devices switched on, by the id Tailscale gives each one.
//            A device that is not listed here is refused.

import fs from 'node:fs';
import path from 'node:path';

const FILE_NAME = 'tailnet.json';
const MAX_DEVICES = 200;
const ID_PATTERN = /^[A-Za-z0-9:_.-]{1,120}$/;

let cached = null;

function stateDir(env = process.env) {
  return env.HOMEBASE_STATE_DIR || path.resolve(process.cwd(), '.homebase-state');
}

function cleanDevices(value) {
  const devices = {};
  if (!value || typeof value !== 'object') return devices;
  for (const [id, entry] of Object.entries(value).slice(0, MAX_DEVICES)) {
    if (!ID_PATTERN.test(id)) continue;
    devices[id] = { name: String(entry?.name || '').slice(0, 60), addedAt: String(entry?.addedAt || '') };
  }
  return devices;
}

export function readTailnetSettings({ env = process.env, fresh = false } = {}) {
  if (cached && !fresh) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir(env), FILE_NAME), 'utf8'));
    cached = {
      on: raw.on === true,
      ownerId: raw.ownerId ?? null,
      devices: cleanDevices(raw.devices),
    };
  } catch {
    cached = { on: false, ownerId: null, devices: {} };
  }
  return cached;
}

function save(next, env) {
  const dir = stateDir(env);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(next, null, 2), 'utf8');
  cached = next;
  return next;
}

/**
 * @param {{ on?: boolean, ownerId?: any, allow?: Array<{id: string, name?: string}>, refuse?: string[] }} patch
 */
export function writeTailnetSettings(patch = {}, { env = process.env, now = new Date() } = {}) {
  const current = readTailnetSettings({ env });
  const devices = { ...current.devices };
  for (const device of patch.allow || []) {
    if (!ID_PATTERN.test(String(device?.id || ''))) continue;
    if (!devices[device.id] && Object.keys(devices).length >= MAX_DEVICES) continue;
    devices[device.id] = { name: String(device.name || '').slice(0, 60), addedAt: devices[device.id]?.addedAt || now.toISOString() };
  }
  for (const id of patch.refuse || []) delete devices[id];
  const on = typeof patch.on === 'boolean' ? patch.on : current.on;
  return save({
    on,
    ownerId: patch.ownerId !== undefined ? patch.ownerId : current.ownerId,
    devices,
  }, env);
}

export function resetTailnetSettingsCache() {
  cached = null;
}
