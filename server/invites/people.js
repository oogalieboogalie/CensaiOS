// "Invite to this board" by tapping a name: the people you already share a
// board with. Anyone who joined one of your boards once (a join link, an
// email invite) shows up here, so the next invite is one tap, and they get
// the Inbox line and pop-up (store.js notifyAccount) in their own censaiOS.

const LIMIT = 50;

function displayName(row) {
  const name = String(row.name || '').trim();
  if (name) return name;
  return String(row.email || '').split('@')[0] || 'Someone';
}

/** Everyone who shares at least one board with userId, not userId. */
export async function listKnownPeople(db, userId) {
  const { rows } = await db.query(
    `SELECT DISTINCT u.id, u.name, u.email
       FROM workspace_members mine
       JOIN workspace_members theirs ON theirs.workspace_id = mine.workspace_id
       JOIN users u ON u.id = theirs.user_id
      WHERE mine.user_id = $1 AND theirs.user_id <> $1
      ORDER BY u.id
      LIMIT ${LIMIT}`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, name: displayName(row) }));
}

/**
 * The sign-in email of someone userId shares a board with, or null. Only
 * people you already know resolve, so a tap can't reach a stranger.
 */
export async function emailOfKnownPerson(db, userId, personId) {
  const id = Number(personId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows } = await db.query(
    `SELECT u.email
       FROM workspace_members mine
       JOIN workspace_members theirs ON theirs.workspace_id = mine.workspace_id
       JOIN users u ON u.id = theirs.user_id
      WHERE mine.user_id = $1 AND theirs.user_id = $2 AND theirs.user_id <> $1
      LIMIT 1`,
    [userId, id],
  );
  return rows[0]?.email || null;
}
