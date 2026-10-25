// server/agentMemory/facts.js
//
// Dated facts with two clocks (pure helpers, no database):
//
//   valid_from / valid_to       when the fact was true in the world
//   recorded_at / superseded_at when the agent believed it
//
// Telling an agent something new never deletes what it believed before.
// A "change" (it was green, since Monday it is blue) closes the old value at
// the moment the new one starts and keeps it as history. A "correction" (it
// was never green, it was always blue) marks the old belief as replaced and
// gives the new value the old start date. Either way the history shows both
// versions with their dates.

import { cleanShelf, guessShelf } from '../../src/lib/agentMemory/shelves.js';

const MAX_PART = 80;
const MAX_VALUE = 500;

export class FactError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clean(value, max) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** One key per thing the fact is about: "alma|favorite color". */
export function factKey(subject, attribute) {
  return `${clean(subject, MAX_PART).toLowerCase()}|${clean(attribute, MAX_PART).toLowerCase()}`;
}

export function parseWhen(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new FactError(`"${clean(value, 40)}" is not a date I can read. Use a date like 2026-10-12.`);
  return at;
}

/** Validate what a person or an agent asked to remember. */
export function normalizeFactInput(input = {}, now = new Date()) {
  const subject = clean(input.subject || 'the user', MAX_PART);
  const attribute = clean(input.attribute, MAX_PART);
  const value = clean(input.value, MAX_VALUE);
  if (!attribute) throw new FactError('Say what the fact is about (for example "favorite color").');
  if (!value) throw new FactError('Say what the fact is (for example "green").');
  const kind = input.kind === 'correction' ? 'correction' : 'change';
  const validFrom = parseWhen(input.validFrom ?? input.valid_from, now);
  const shelf = cleanShelf(input.shelf) || guessShelf(subject, attribute, value);
  return { subject, attribute, value, key: factKey(subject, attribute), kind, validFrom, shelf };
}

/**
 * Decide what rows to write, given what the agent believes now (`current`,
 * or null). Returns { action: 'same' | 'insert' | 'replace', ... }:
 *   same     nothing to write, the agent already believes this
 *   insert   a brand-new fact
 *   replace  close `current` (superseded now) and write `rows` in order;
 *            the last row is the new current belief
 */
export function planFactWrite(current, input, now = new Date()) {
  const base = { subject: input.subject, attribute: input.attribute, fact_key: input.key, shelf: input.shelf || null };
  if (!current) {
    return { action: 'insert', rows: [{ ...base, value: input.value, valid_from: input.validFrom, change_kind: 'new' }] };
  }
  if (current.value.toLowerCase() === input.value.toLowerCase()) return { action: 'same' };

  const oldFrom = new Date(current.valid_from);
  // A change that starts before the old value did cannot be a change over
  // time; the old value was simply wrong.
  const correction = input.kind === 'correction' || input.validFrom <= oldFrom;
  if (correction) {
    return {
      action: 'replace',
      rows: [{ ...base, value: input.value, valid_from: oldFrom, change_kind: 'correction' }],
    };
  }
  return {
    action: 'replace',
    rows: [
      { ...base, value: current.value, valid_from: oldFrom, valid_to: input.validFrom, change_kind: 'history' },
      { ...base, value: input.value, valid_from: input.validFrom > now ? now : input.validFrom, change_kind: 'change' },
    ],
  };
}

/**
 * Two-clock question over history rows: what did the agent believe at
 * `knownAt` about the world at `trueAt`? Used by tests and the eval.
 */
export function factsAsOf(rows, { trueAt = new Date(), knownAt = new Date() } = {}) {
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

export function day(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

/** "favorite color of the user: blue (true since 2026-10-12, learned 2026-10-12)" */
export function describeFact(row) {
  const learned = day(row.recorded_at);
  const span = row.valid_to
    ? `true ${day(row.valid_from)} to ${day(row.valid_to)}`
    : `true since ${day(row.valid_from)}`;
  return `${row.attribute} of ${row.subject}: ${row.value} (${span}, learned ${learned})`;
}

/** One line per row of a fact's history, oldest belief first. */
export function describeHistory(rows) {
  if (!rows.length) return 'Nothing remembered about that yet.';
  return rows.map((row) => {
    const state = row.superseded_at ? `replaced ${day(row.superseded_at)}` : row.valid_to ? 'past value' : 'current';
    const label = row.change_kind === 'correction' ? 'corrected to' : row.change_kind === 'history' ? 'was' : 'is';
    return `- ${label} "${row.value}" (${row.valid_to ? `true ${day(row.valid_from)} to ${day(row.valid_to)}` : `true since ${day(row.valid_from)}`}; learned ${day(row.recorded_at)}; ${state})`;
  }).join('\n');
}

function words(text) {
  return new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
}

/** Facts sharing at least one word with the query, most shared words first. */
export function matchFacts(facts, query) {
  const wanted = words(query);
  if (!wanted.size) return [];
  return facts
    .map((fact) => {
      const have = words(`${fact.subject} ${fact.attribute} ${fact.value}`);
      let score = 0;
      for (const w of wanted) if (have.has(w)) score += 1;
      return { fact, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.fact);
}

