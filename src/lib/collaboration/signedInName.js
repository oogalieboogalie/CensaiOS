// The signed-in person's display name, noted by the board's presence hook, so
// things a person writes on a shared window (a Doc note) carry their name
// instead of "You", which reads as the viewer on everyone else's screen.

let signedInName = null;

export function noteSignedInName(name) {
  signedInName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : null;
}

/** The name to sign a note with; "You" when nobody is signed in (single-user boards). */
export function authorName() {
  return signedInName || 'You';
}
