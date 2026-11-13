// Switching a device off has to mean it is out, right away. This keeps track
// of the open connections from other computers and of the sign-ins made by
// switched-on devices, so both can be ended the moment the owner switches a
// device off or turns "My Tailscale devices" off.

import { isTailnetAddress, plainAddress } from './addresses.js';

const sockets = new Set();
const signIns = new Map(); // device id -> [{ id, store }]
const USER_FIELDS = ['userId', 'userRole', 'userEmail', 'userName', 'tailnetDeviceId'];

/** Every connection on a port other computers use is watched until it closes. */
export function watchVisitorSocket(socket) {
  if (!socket || sockets.has(socket)) return socket;
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
  return socket;
}

/** Closes open connections (pages and live sync) from these Tailscale addresses, or from all of them. */
export function dropVisitorSockets(addresses = null) {
  const wanted = addresses ? new Set(addresses.map(plainAddress)) : null;
  let dropped = 0;
  for (const socket of sockets) {
    const address = plainAddress(socket.remoteAddress);
    if (wanted ? wanted.has(address) : isTailnetAddress(address)) {
      socket.destroy();
      dropped += 1;
    }
  }
  return dropped;
}

/** Marks this sign-in as made by a switched-on device, so it ends with the switch. */
export function rememberDeviceSignIn(req, device) {
  if (!req?.session || !device?.id) return;
  req.session.tailnetDeviceId = device.id;
  const list = signIns.get(device.id) || [];
  list.push({ id: req.sessionID, store: req.sessionStore });
  signIns.set(device.id, list.slice(-20));
}

/** Ends the sign-ins of these devices (by id), or of every device. */
export async function endDeviceSignIns(deviceIds = null) {
  const ids = deviceIds || [...signIns.keys()];
  let ended = 0;
  for (const id of ids) {
    for (const entry of signIns.get(id) || []) {
      try { entry.store?.destroy?.(entry.id, () => {}); ended += 1; } catch { /* already gone */ }
    }
    signIns.delete(id);
  }
  // A sign-in from before censaiOS last restarted is only in the saved
  // sign-ins, so end those too. The board's live sync reads them directly.
  try {
    const { default: pool } = await import('../db.js');
    if (deviceIds) await pool.query("DELETE FROM session WHERE sess->>'tailnetDeviceId' = ANY($1::text[])", [deviceIds.map(String)]);
    else await pool.query("DELETE FROM session WHERE sess->>'tailnetDeviceId' IS NOT NULL");
  } catch {
    // The check on every request (checkDeviceSignIn) still ends them.
  }
  return ended;
}

/**
 * A sign-in made by a switched-on device only counts while that same device
 * is still switched on and is the one using it. Runs on every request from
 * another computer (webOs/doorListener.js), so it also catches a sign-in
 * from before a restart, and a copied cookie used from a different device.
 */
export function checkDeviceSignIn(req) {
  const signedInAs = req?.session?.tailnetDeviceId;
  if (!signedInAs || req.tailnetDevice?.id === signedInAs) return true;
  for (const field of USER_FIELDS) delete req.session[field];
  return false;
}
