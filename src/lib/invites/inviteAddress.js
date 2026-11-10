// Which origin an "Invite to this board" link may start with.
//
// The Share panel already stores that origin (`homebase.shareBase.v1`):
// the address other people type to reach this censaiOS. Invite links used
// to ignore it and stamp the machine's own name onto the desktop app's
// port. That port answers 127.0.0.1 only, so the link does not open — not
// for the other person, and not for the owner trying it in a browser.

import { addressesFor } from '../webOs.js';
import { cleanShareBase, isThisComputerOnly } from '../workspace/shareBase.js';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function onThisComputer(address) {
  try {
    return isThisComputerOnly(new URL(address));
  } catch {
    return true;
  }
}

function trim(address) {
  return String(address || '').replace(/\/$/, '');
}

function listeningDoor(door, location) {
  // `available` is false on the desktop app: no Open anywhere port exists.
  // A machine name on the app's own port is not a door.
  if (!door?.port || door.available === false || door.thisComputerOnly === true) return '';
  const [address] = addressesFor(door.hosts || [], location, door.port);
  return address && !onThisComputer(address) ? trim(address) : '';
}

/**
 * @returns {{ address: string, tryAddress: string, doorClosed: boolean, localOnly: boolean, needsAddress: boolean }}
 * `address` is safe to put in a link someone else opens. `tryAddress` is
 * this computer's own localhost, for the owner to open the invite here.
 */
export function chooseInviteAddress({ location, door, shareBase } = {}) {
  const saved = cleanShareBase(shareBase);
  if (saved && !onThisComputer(saved)) {
    return { address: trim(saved), tryAddress: '', doorClosed: false, localOnly: false, needsAddress: false };
  }
  if (location?.origin && !isThisComputerOnly(location)) {
    return { address: trim(location.origin), tryAddress: '', doorClosed: false, localOnly: false, needsAddress: false };
  }
  const doorAddress = listeningDoor(door, location);
  if (doorAddress) {
    return { address: doorAddress, tryAddress: '', doorClosed: !door.open, localOnly: false, needsAddress: false };
  }
  const loopbackPage = location?.origin
    && (location.protocol === 'http:' || location.protocol === 'https:')
    && LOOPBACK.has(String(location.hostname || '').toLowerCase());
  return {
    address: '',
    tryAddress: loopbackPage ? trim(location.origin) : '',
    doorClosed: false,
    localOnly: true,
    needsAddress: true,
  };
}
