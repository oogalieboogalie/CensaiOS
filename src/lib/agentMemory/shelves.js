/**
 * Memory shelves (Alex's diagram 20): an agent's facts sorted onto shelves
 * a person can see. Plain JS, shared by the server (which saves the shelf)
 * and the Memory panel (which draws them).
 */

export const SHELVES = Object.freeze([
  { id: 'personal', label: 'Personal', parts: ['identity', 'goals', 'preferences', 'achievements'], hint: 'Who you are and what you like.' },
  { id: 'project', label: 'Project', parts: ['goals', 'architecture', 'roadmap', 'to-dos', 'state', 'project files'], hint: 'What the work is and where it stands.' },
  { id: 'team', label: 'Team', parts: ['culture', 'goals', 'purpose'], hint: 'How the team works and why.' },
  { id: 'accomplishments', label: 'Accomplishments', parts: ['shipped', 'won', 'finished'], hint: 'What got done, for you and the team.' },
  { id: 'tooling', label: 'Tooling', parts: ['sub-agents', 'descriptions', 'where things are', 'what and when'], hint: 'Tools, helpers, and where to find things.' },
]);

export const SHELF_IDS = Object.freeze(SHELVES.map((s) => s.id));

/** A known shelf id, or '' for anything else. */
export function cleanShelf(value) {
  const id = String(value || '').trim().toLowerCase();
  return SHELF_IDS.includes(id) ? id : '';
}

const has = (text, words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

/** Best shelf for a fact nobody filed, from its words. Personal when unsure. */
export function guessShelf(subject = '', attribute = '', value = '') {
  const about = `${subject} ${attribute}`;
  const all = `${about} ${value}`;
  if (has(all, ['shipped', 'launched', 'finished', 'won', 'award', 'accomplish', 'achiev', 'milestone', 'completed'])) return 'accomplishments';
  if (has(about, ['tool', 'sub-agent', 'subagent', 'helper', 'api', 'location', 'where', 'path', 'folder', 'url', 'command', 'schedule', 'when'])) return 'tooling';
  if (has(about, ['team', 'culture', 'purpose', 'mission', 'values', 'crew', 'company'])) return 'team';
  if (has(about, ['project', 'repo', 'architecture', 'roadmap', 'to-do', 'todo', 'state', 'status', 'deadline', 'stack', 'file', 'release', 'version'])) return 'project';
  return 'personal';
}

/** The shelf a saved fact sits on: the one it was filed on, or a guess. */
export function shelfOf(fact = {}) {
  return cleanShelf(fact.shelf) || guessShelf(fact.subject, fact.attribute, fact.value);
}

export function shelfLabel(id) {
  return SHELVES.find((s) => s.id === id)?.label || 'Personal';
}
