// What the database remembers of a party, taken away when the party ends:
// the friend's sign-in, and their place on the board.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('friends');

export async function endSavedSignIns(partyIds) {
  // A sign-in the store kept is ended there too: the board's live sync reads it directly.
  try {
    const { default: pool } = await import('../db.js');
    if (partyIds) await pool.query("DELETE FROM session WHERE sess->>'friendPartyId' = ANY($1::text[])", [partyIds]);
    else await pool.query("DELETE FROM session WHERE sess->>'friendPartyId' IS NOT NULL");
    return true;
  } catch {
    // checkPartySignIn (every request) still ends them.
    return false;
  }
}

/**
 * A friend is on a board only while it is shared with them: when the party
 * ends, so does their place on it. `ended` null is every friend, for the
 * start of censaiOS, when no party can be live.
 */
export async function takeOffBoards(ended) {
  try {
    const { default: pool } = await import('../db.js');
    if (!ended) {
      await pool.query(
        `DELETE FROM workspace_members wm USING friends f
          WHERE wm.user_id = f.user_id AND wm.role IN ('member', 'viewer')`,
      );
      return true;
    }
    for (const party of ended) {
      if (party.friend.userId == null) continue;
      await pool.query(
        "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role IN ('member', 'viewer')",
        [party.board.id, party.friend.userId],
      );
    }
    return true;
  } catch (error) {
    // An install with no friends list yet (42P01) has nobody to take off.
    if (!ended) return error?.code === '42P01';
    log.warn('friends: a friend could not be taken off a board', { code: safeErrorCode(error) });
    return false;
  }
}

/** For a share that did not start: the friend is not left on the board. */
export const takeOffBoard = (friend, board) => takeOffBoards([{ friend, board }]);
