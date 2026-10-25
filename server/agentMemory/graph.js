// server/agentMemory/graph.js
//
// The time-aware knowledge graph (pure helpers, no database). Things an
// agent knows about are entities; a connection between two of them is a
// relation with the same two clocks as facts (see facts.js):
//
//   valid_from / valid_to       when the connection was true in the world
//   recorded_at / superseded_at when the agent believed it
//
// "Alma works at Indigo Labs LLC since 2026-01-01" is one relation. If Alma later
// works somewhere else, the old one is closed on that date and kept, so the
// agent can still answer "where did Alma work in 2025?".

import { FactError, day, parseWhen } from './facts.js';

const MAX_NAME = 80;
const MAX_RELATION = 60;
export const ENTITY_KINDS = Object.freeze(['person', 'company', 'place', 'project', 'thing']);

function clean(value, max) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const nameKey = (name) => clean(name, MAX_NAME).toLowerCase();

/** Validate one connection someone asked the agent to remember. */
export function normalizeLinkInput(input = {}, now = new Date()) {
  const from = clean(input.from || 'the user', MAX_NAME);
  const to = clean(input.to, MAX_NAME);
  const relation = clean(input.relation, MAX_RELATION);
  if (!relation) throw new FactError('Say how they are connected (for example "works at").');
  if (!to) throw new FactError('Say what it connects to (for example "Indigo Labs LLC").');
  if (nameKey(from) === nameKey(to)) throw new FactError('A connection needs two different things.');
  const validFrom = parseWhen(input.since ?? input.validFrom ?? input.valid_from, now);
  const validTo = parseWhen(input.until ?? input.validTo ?? input.valid_to, null);
  if (validTo && validTo < validFrom) throw new FactError('The end date is before the start date.');
  const kind = (k) => (ENTITY_KINDS.includes(k) ? k : 'thing');
  return {
    from, to, relation, relationKey: relation.toLowerCase(),
    fromKind: kind(input.fromKind ?? input.from_kind), toKind: kind(input.toKind ?? input.to_kind),
    validFrom: validFrom > now ? now : validFrom,
    validTo,
    replaces: input.replaces === true || input.replaces === 'true',
  };
}

/**
 * What to do with the connections already open for the same "from" and
 * relation (`open`), given a new one (`input`). Returns:
 *   { action: 'same' }                              already known
 *   { action: 'end', row, at }                      the known one stopped at `at`
 *   { action: 'insert', close: [{ row, mode }] }    write the new one; for
 *     each row to close, mode 'ended' keeps it as a past connection that
 *     stopped on the new start date, mode 'replaced' means it was never
 *     true (the new one starts on or before it did).
 */
export function planLink(open, input) {
  const sameTarget = open.find((row) => nameKey(row.to_name) === nameKey(input.to));
  if (sameTarget && input.validTo) return { action: 'end', row: sameTarget, at: input.validTo };
  if (sameTarget) return { action: 'same', row: sameTarget };
  if (!input.replaces) return { action: 'insert', close: [] };
  const close = open
    .filter((row) => row !== sameTarget)
    .map((row) => ({ row, mode: new Date(row.valid_from) < input.validFrom ? 'ended' : 'replaced' }));
  return { action: 'insert', close };
}

/** The connections that were true at `trueAt`, as the agent knew it at `knownAt`. */
export function relationsAsOf(rows, { trueAt = new Date(), knownAt = new Date() } = {}) {
  const t = new Date(trueAt).getTime();
  const k = new Date(knownAt).getTime();
  return rows.filter((row) => {
    const recorded = new Date(row.recorded_at).getTime();
    const superseded = row.superseded_at ? new Date(row.superseded_at).getTime() : Infinity;
    const from = new Date(row.valid_from).getTime();
    const to = row.valid_to ? new Date(row.valid_to).getTime() : Infinity;
    return recorded <= k && superseded > k && from <= t && to > t;
  });
}

/** "Alma works at Indigo Labs LLC (true since 2026-01-01, learned 2026-10-16)" */
export function describeRelation(row) {
  const span = row.valid_to
    ? `true ${day(row.valid_from)} to ${day(row.valid_to)}`
    : `true since ${day(row.valid_from)}`;
  return `${row.from_name} ${row.relation} ${row.to_name} (${span}, learned ${day(row.recorded_at)})`;
}

/** Connections that touch any word of `query` (empty query: all of them). */
export function matchRelations(rows, query) {
  const wanted = String(query || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  if (!wanted.length) return rows;
  return rows.filter((row) => {
    const text = `${row.from_name} ${row.relation} ${row.to_name}`.toLowerCase();
    return wanted.some((w) => text.includes(w));
  });
}
