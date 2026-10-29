/**
 * "Sam joined" and "Sam left" pop-ups, once per person. Someone can be on
 * the board in several tabs and through two links at once (the shared
 * board's presence and the board's live socket), and each used to announce
 * the same arrival. Here people are counted by who they are, across every
 * link:
 * - a link's first list after it (re)connects only says who is already
 *   here, so nobody is announced because this tab arrived or reconnected;
 * - while a link is down (`null`) the people only it could see are out of
 *   sight, not gone, so this tab losing its connection never reads as
 *   everyone leaving; once a link is back they have RECONNECT_MS to show up
 *   again (after a server restart everyone returns at a different moment)
 *   and are otherwise forgotten quietly;
 * - someone a working link stops listing gets "left" only if they are still
 *   gone after LEAVE_GRACE_MS, so a reload or a short drop says nothing.
 * Pure: the caller feeds the lists and runs `due()` when `nextDueIn()` says.
 */
export const LEAVE_GRACE_MS = 10_000;
export const RECONNECT_MS = 45_000;

function personKey(participant) {
  const actor = participant?.actor || {};
  return `${actor.type || 'human'}:${String(actor.id ?? participant?.clientId ?? '')}`;
}

export function createPresenceNotices({
  now = () => Date.now(), graceMs = LEAVE_GRACE_MS, reconnectMs = RECONNECT_MS,
} = {}) {
  let selfId = '';
  let count = 0;
  const links = new Map(); // link -> Map(person -> name), only while it is up
  // person -> { name, state, since }. 'here'; 'leaving': a working link saw
  // them go, "left" after graceMs; 'unsure': out of sight, forgotten quietly
  // after reconnectMs of some link being up without them (`since` is null
  // while every link is down, so that wait has not started).
  const people = new Map();

  const listed = (key) => [...links.values()].some((seen) => seen.has(key));
  const waitFor = (person) => (person.state === 'leaving' ? graceMs : reconnectMs);
  const notice = (kind, name) => {
    const at = now();
    count += 1;
    const text = kind === 'join' ? `${name} joined the canvas` : `${name} left`;
    return { id: `${kind}-${at}-${count}`, kind, text, at };
  };
  const peopleIn = (list) => {
    const seen = new Map();
    for (const participant of list) {
      const actor = participant?.actor || {};
      // Your own other tabs are not news; a guest is never you.
      if (selfId && actor.type !== 'guest' && String(actor.id ?? '') === selfId) continue;
      seen.set(personKey(participant), String(actor.label || 'Someone'));
    }
    return seen;
  };

  return {
    setSelf(id) { selfId = String(id ?? ''); },

    /** One link's people now (`null` while it is down); returns new "joined" notices. */
    see(link, list) {
      if (!list) {
        links.delete(link);
        const since = links.size ? now() : null;
        for (const [key, person] of people) {
          if (person.state === 'here' && !listed(key)) Object.assign(person, { state: 'unsure', since });
          else if (person.state === 'unsure' && !links.size) person.since = null;
        }
        return [];
      }
      const arriving = !links.has(link);
      const seen = peopleIn(list);
      links.set(link, seen);
      const notices = [];
      for (const [key, name] of seen) {
        if (!people.has(key) && !arriving) notices.push(notice('join', name));
        people.set(key, { name, state: 'here', since: null });
      }
      for (const [key, person] of people) {
        if (listed(key)) continue;
        if (person.state === 'here') Object.assign(person, { state: 'leaving', since: now() });
        else if (person.since === null) person.since = now(); // a link is back: their wait starts
      }
      return notices;
    },

    /** "Left" notices for people still gone once their grace time is up. */
    due() {
      const notices = [];
      for (const [key, person] of people) {
        if (person.since === null || now() - person.since < waitFor(person)) continue;
        people.delete(key);
        if (person.state === 'leaving') notices.push(notice('leave', person.name));
      }
      return notices;
    },

    /** Milliseconds until the next `due()` has something to do, or null. */
    nextDueIn() {
      let soonest = null;
      for (const person of people.values()) {
        if (person.since === null) continue;
        const wait = Math.max(0, person.since + waitFor(person) - now());
        if (soonest === null || wait < soonest) soonest = wait;
      }
      return soonest;
    },
  };
}
