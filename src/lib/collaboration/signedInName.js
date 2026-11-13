// The signed-in person's display name, noted by the board's presence hook, so
// things a person writes on a shared window (a Doc note) carry their name
// instead of "You", which reads as the viewer on everyone else's screen.
// The id goes along on the marks that say who typed which letters.
import { typedByMark } from '../../../shared/collab/typedBy.js';

let signedInName = null;
let signedInId = null;

export function noteSignedInName(name, id = null) {
  signedInName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : null;
  signedInId = signedInName && id != null && String(id) ? String(id).slice(0, 64) : null;
}

/** The name to sign a note with; "You" when nobody is signed in (single-user boards). */
export function authorName() {
  return signedInName || 'You';
}

/** The mark for letters this tab types (typedBy.js); empty marks when nobody is signed in. */
export function myTypedMark() {
  return typedByMark(signedInName, signedInId);
}
