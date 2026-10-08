// Who is on the board right now, for modules' censai.presence. The app shell
// publishes the collaboration roster here; module windows subscribe.

let people = [];
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
