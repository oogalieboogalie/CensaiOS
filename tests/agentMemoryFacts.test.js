// Agent memory, dated facts: telling an agent something new never deletes
// what it believed before. A change closes the old value when the new one
// starts; a correction replaces the old belief but keeps it as history.
import {
  describeFact, describeHistory, factKey, factsAsOf, normalizeFactInput, planFactWrite,
} from '../server/agentMemory/facts.js';

const NOW = new Date('2026-10-12T05:00:00Z');
const current = {
  id: 1, subject: 'the user', attribute: 'favorite color', fact_key: 'the user|favorite color', value: 'green',
  valid_from: '2026-10-01T00:00:00Z', valid_to: null, recorded_at: '2026-10-01T00:00:00Z', superseded_at: null, change_kind: 'new',
};

describe('normalizeFactInput', () => {
  test('cleans the words and keys facts without case', () => {
    const input = normalizeFactInput({ subject: ' Alex ', attribute: 'Favorite\nColor', value: ' green ' }, NOW);
    expect(input).toMatchObject({ subject: 'Alex', attribute: 'Favorite Color', value: 'green', key: 'alex|favorite color', kind: 'change' });
    expect(input.validFrom).toEqual(NOW);
    expect(factKey('ALEX', 'favorite color')).toBe(input.key);
  });

  test('needs what the fact is about and the fact itself, and a readable date', () => {
    expect(() => normalizeFactInput({ value: 'x' })).toThrow(/what the fact is about/);
    expect(() => normalizeFactInput({ attribute: 'x' })).toThrow(/what the fact is/);
    expect(() => normalizeFactInput({ attribute: 'x', value: 'y', validFrom: 'soon' })).toThrow(/not a date/);
  });
});

describe('planFactWrite', () => {
  const input = (value, extra = {}) => normalizeFactInput({ attribute: 'favorite color', value, ...extra }, NOW);

  test('a new fact is inserted', () => {
    expect(planFactWrite(null, input('green'), NOW)).toMatchObject({ action: 'insert', rows: [{ value: 'green', change_kind: 'new' }] });
  });

  test('saying the same thing again writes nothing', () => {
    expect(planFactWrite(current, input('GREEN'), NOW)).toEqual({ action: 'same' });
  });

  test('a change keeps the old value as history, true until the new one started', () => {
    const plan = planFactWrite(current, input('blue', { validFrom: '2026-10-10' }), NOW);
    expect(plan.action).toBe('replace');
    expect(plan.rows).toEqual([
      expect.objectContaining({ value: 'green', change_kind: 'history', valid_to: new Date('2026-10-10') }),
      expect.objectContaining({ value: 'blue', change_kind: 'change', valid_from: new Date('2026-10-10') }),
    ]);
  });

  test('a correction takes the old start date and keeps no "was" row', () => {
    const plan = planFactWrite(current, input('blue', { kind: 'correction' }), NOW);
    expect(plan.rows).toEqual([expect.objectContaining({ value: 'blue', change_kind: 'correction', valid_from: new Date(current.valid_from) })]);
  });

  test('a "change" dated before the old value started is treated as a correction', () => {
    const plan = planFactWrite(current, input('blue', { validFrom: '2020-01-01' }), NOW);
    expect(plan.rows[0].change_kind).toBe('correction');
  });
});

describe('two clocks', () => {
  // Learned green on Oct 1. On Oct 12 learned it changed to blue on Oct 10.
  const rows = [
    { ...current, superseded_at: '2026-10-12T00:00:00Z' },
    { ...current, id: 2, valid_to: '2026-10-10T00:00:00Z', recorded_at: '2026-10-12T00:00:00Z', change_kind: 'history' },
    { ...current, id: 3, value: 'blue', valid_from: '2026-10-10T00:00:00Z', recorded_at: '2026-10-12T00:00:00Z', change_kind: 'change' },
  ];
  const valueAt = (trueAt, knownAt) => factsAsOf(rows, { trueAt, knownAt }).map((r) => r.value);

  test('what is true now, as known now', () => expect(valueAt('2026-10-12T06:00:00Z', '2026-10-12T06:00:00Z')).toEqual(['blue']));
  test('what was true on Oct 5, as known now', () => expect(valueAt('2026-10-05', '2026-10-12T06:00:00Z')).toEqual(['green']));
  test('what the agent believed on Oct 11 about Oct 11', () => expect(valueAt('2026-10-11', '2026-10-11')).toEqual(['green']));

  test('descriptions carry both dates', () => {
    expect(describeFact(rows[2])).toBe('favorite color of the user: blue (true since 2026-10-10, learned 2026-10-12)');
    const history = describeHistory(rows);
    expect(history).toContain('"green" (true since 2026-10-01; learned 2026-10-01; replaced 2026-10-12)');
    expect(history).toContain('was "green" (true 2026-10-01 to 2026-10-10');
    expect(history).toContain('is "blue" (true since 2026-10-10; learned 2026-10-12; current)');
  });
});
