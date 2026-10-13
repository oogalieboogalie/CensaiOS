// Who is on the board right now, for modules' censai.presence. The app shell
// publishes the collaboration roster here; module windows subscribe.

let people = [];
let clientIds = [];
let self = { label: '', canEdit: true };
const listeners = new Set();

function namesOf(participants) {
  const seen = new Set();
  const list = [];
  for (const p of Array.isArray(participants) ? participants : []) {
    const name = String(p?.actor?.label || p?.name || '').replace(/^Member\s+/, '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    list.push({ name });
  }
  return list;
}

export function publishPresence(participants) {
  clientIds = (Array.isArray(participants) ? participants : []).map(p => String(p?.clientId || '')).filter(Boolean);
  const next = namesOf(participants);
  if (JSON.stringify(next) === JSON.stringify(people)) return;
  people = next;
  listeners.forEach(fn => fn(people));
}

export function getPresence() {
  return people;
}

export function subscribePresence(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Collaboration client ids on the board right now (empty when offline). */
export function getPresentClientIds() {
  return clientIds;
}

/**
 * Who this browser is on the board: the display name the server gave it and
 * whether its link may change things (read-only guests can't).
 */
export function publishSelf(actor, { canEdit = true } = {}) {
  self = {
    label: String(actor?.label || '').replace(/^Member\s+/, '').trim().slice(0, 40),
    canEdit: Boolean(canEdit),
  };
}

export function getSelf() {
  return self;
}
