// The keyboard contract between the canvas and its windows (spec 11).
//
// Canvas shortcuts listen on the whole page. A window that needs every key
// (a game while you play it) claims the keyboard; page-level shortcut
// handlers check keyboardClaimed() and stand down until it lets go. The
// claiming window releases on Escape, on blur and when it unmounts.

let owner = null;

export function claimKeyboard(id) {
  owner = String(id || 'window');
  return () => releaseKeyboard(owner);
}

export function releaseKeyboard(id) {
  if (owner !== null && (id === undefined || owner === String(id))) owner = null;
}

export function keyboardClaimed() {
  return owner !== null;
}

export function keyboardOwner() {
  return owner;
}
