// One face in the people list per signed-in person. Each browser tab publishes
// its own awareness state, so a second tab used to look like a second person.
// When this browser is one of the tabs, that local tab is the face that stays.
import { logToApp } from '../appLog/browserLog.js';

// Presence is re-read on every cursor move, so the line is written only when
// the number of merged tabs changes.
let lastMerged = 0;

/** Fold extra tabs of the same person into the participant already kept. */
export function mergeDuplicateTabs(participants) {
  const byPerson = new Map();
  let merged = 0;
  for (const participant of participants || []) {
    const key = String(participant?.actor?.id || participant?.clientId || '');
    const kept = byPerson.get(key);
    if (!kept) {
      byPerson.set(key, { ...participant });
      continue;
    }
    merged += 1;
    if (participant.self) byPerson.set(key, { ...participant });
  }
  if (merged > 0 && merged !== lastMerged) {
    const tabs = merged === 1 ? 'tab' : 'tabs';
    logToApp('debug', `presence: merged ${merged} duplicate ${tabs}`, { where: 'presence' });
  }
  lastMerged = merged;
  return [...byPerson.values()];
}
