// Shared by the group goals and milestones routes: who is asking, and
// whether an id from the address could be a row at all. Rows belong to the
// person who made them (docker/091-group-goal-owners.sql).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// docker/004-sub-agents.sql makes the ids UUIDs; an older install whose
// tables were made another way may have plain whole-number ids instead.
const WHOLE_NUMBER_RE = /^[1-9][0-9]{0,17}$/;

export function sessionUserId(req) {
  const userId = Number(req.session?.userId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export function isRowId(value) {
  const text = String(value || '');
  return UUID_RE.test(text) || WHOLE_NUMBER_RE.test(text);
}

// The id goes into a log line only when it is a real row id, never as typed.
export function loggedId(value) {
  return isRowId(value) ? value : 'not-an-id';
}
