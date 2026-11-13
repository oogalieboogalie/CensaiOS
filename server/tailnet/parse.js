// Turns what Tailscale reports about a tailnet (`tailscale status --json`)
// into the few plain facts censaiOS uses: is Tailscale connected, what is
// this computer called there, and which other devices are on it.

import { isTailnetAddress, plainAddress } from './addresses.js';

const PHONE_SYSTEMS = new Set(['ios', 'android', 'ipados']);

/** One line of text someone else chose: no control characters, not too long. */
export function cleanLabel(value, max = 60) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dnsName(node) {
  return cleanLabel(node?.DNSName, 200).toLowerCase().replace(/\.$/, '');
}

function deviceName(node) {
  const host = cleanLabel(node?.HostName);
  // Phones often report "localhost"; their tailnet name is the useful one.
  if (host && host.toLowerCase() !== 'localhost') return host;
  return dnsName(node).split('.')[0] || host || 'Unnamed device';
}

function addresses(node) {
  const list = Array.isArray(node?.TailscaleIPs) ? node.TailscaleIPs : [];
  return list.map(plainAddress).filter(isTailnetAddress);
}

function toDevice(node, users, selfUserId) {
  const tagged = Array.isArray(node?.Tags) && node.Tags.length > 0;
  const system = cleanLabel(node?.OS, 20);
  const owner = cleanLabel(users?.[String(node?.UserID)]?.LoginName, 80);
  return {
    id: cleanLabel(node?.ID || node?.PublicKey, 120),
    name: deviceName(node),
    dnsName: dnsName(node),
    system,
    kind: PHONE_SYSTEMS.has(system.toLowerCase()) ? 'phone' : 'computer',
    addresses: addresses(node),
    online: node?.Online === true,
    // Signed in to Tailscale as the same person as this computer.
    mine: !tagged && node?.ShareeNode !== true && selfUserId != null && node?.UserID === selfUserId,
    owner: tagged ? '' : owner,
    tagged,
  };
}

export const NOT_CONNECTED = Object.freeze({ connected: false, self: null, devices: [] });

/**
 * @param {object} raw  the JSON `tailscale status --json` prints
 * @returns {{ connected: boolean, self: object|null, devices: object[] }}
 */
export function parseTailnetStatus(raw) {
  if (!raw || typeof raw !== 'object' || !raw.Self) return { ...NOT_CONNECTED };
  const users = raw.User && typeof raw.User === 'object' ? raw.User : {};
  const selfUserId = raw.Self.UserID ?? null;
  const self = toDevice(raw.Self, users, selfUserId);
  const peers = raw.Peer && typeof raw.Peer === 'object' ? Object.values(raw.Peer) : [];
  const devices = peers
    .map((node) => toDevice(node, users, selfUserId))
    .filter((device) => device.id && device.id !== self.id && device.addresses.length > 0)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  const connected = raw.BackendState === 'Running' && self.addresses.length > 0;
  return { connected, self, devices };
}
