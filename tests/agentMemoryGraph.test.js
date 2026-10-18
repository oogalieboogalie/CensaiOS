// The time-aware knowledge graph, pure parts: reading a connection, deciding
// what to close when a new one replaces an old one, and answering "what was
// true on a date" with both clocks.
import { normalizeLinkInput, planLink, relationsAsOf, describeRelation, matchRelations } from '../server/agentMemory/graph.js';
import { buildMemoryBlock } from '../server/agentMemory/recall.js';

const now = new Date('2026-10-16T00:00:00Z');

test('a connection needs a relation and a target, and two different things', () => {
  expect(() => normalizeLinkInput({ to: 'Iowa AI LLC' }, now)).toThrow(/how they are connected/);
  expect(() => normalizeLinkInput({ relation: 'works at' }, now)).toThrow(/connects to/);
  expect(() => normalizeLinkInput({ from: 'Alex', relation: 'is', to: 'alex' }, now)).toThrow(/two different/);
  expect(() => normalizeLinkInput({ relation: 'x', to: 'y', since: '2026-02-01', until: '2026-01-01' }, now)).toThrow(/before the start/);
  const input = normalizeLinkInput({ from: ' Alex ', relation: 'Works At', to: 'Iowa AI LLC', since: '2026-01-01', from_kind: 'person', toKind: 'nope' }, now);
  expect(input).toMatchObject({ from: 'Alex', relationKey: 'works at', fromKind: 'person', toKind: 'thing', replaces: false, validTo: null });
  expect(normalizeLinkInput({ relation: 'x', to: 'y', since: '2030-01-01' }, now).validFrom).toEqual(now);
});

test('replacing closes the old connection on the new start date, or drops it if it never held', () => {
  const open = [{ id: 1, to_name: 'Acme', valid_from: '2024-01-01T00:00:00Z' }];
  const move = normalizeLinkInput({ from: 'Alex', relation: 'works at', to: 'Iowa AI LLC', since: '2026-01-01', replaces: true }, now);
  expect(planLink(open, move)).toEqual({ action: 'insert', close: [{ row: open[0], mode: 'ended' }] });
  const before = normalizeLinkInput({ from: 'Alex', relation: 'works at', to: 'Iowa AI LLC', since: '2023-01-01', replaces: true }, now);
  expect(planLink(open, before).close[0].mode).toBe('replaced');
  expect(planLink(open, { ...move, replaces: false })).toEqual({ action: 'insert', close: [] });
  expect(planLink(open, { ...move, to: 'ACME' }).action).toBe('same');
  expect(planLink(open, { ...move, to: 'acme', validTo: new Date('2025-01-01') })).toMatchObject({ action: 'end', row: open[0] });
});

test('what was true on a date uses both clocks', () => {
  const rows = [
    { id: 1, from_name: 'Alex', relation: 'works at', to_name: 'Acme', valid_from: '2024-01-01', valid_to: null, recorded_at: '2026-10-01', superseded_at: '2026-10-10' },
    { id: 2, from_name: 'Alex', relation: 'works at', to_name: 'Acme', valid_from: '2024-01-01', valid_to: '2026-01-01', recorded_at: '2026-10-10', superseded_at: null },
    { id: 3, from_name: 'Alex', relation: 'works at', to_name: 'Iowa AI LLC', valid_from: '2026-01-01', valid_to: null, recorded_at: '2026-10-10', superseded_at: null },
  ];
  expect(relationsAsOf(rows, { trueAt: '2025-06-01', knownAt: now }).map((r) => r.id)).toEqual([2]);
  expect(relationsAsOf(rows, { trueAt: '2026-06-01', knownAt: now }).map((r) => r.id)).toEqual([3]);
  // What the agent believed on 2026-10-05, before it learned about the new job.
  expect(relationsAsOf(rows, { trueAt: '2026-06-01', knownAt: '2026-10-05' }).map((r) => r.id)).toEqual([1]);
  expect(describeRelation(rows[1])).toBe('Alex works at Acme (true 2024-01-01 to 2026-01-01, learned 2026-10-10)');
  expect(matchRelations(rows, 'iowa').map((r) => r.id)).toEqual([3]);
});

test('current connections go into the memory block the agent reads', () => {
  const block = buildMemoryBlock({ links: [{ from_name: 'Alex', relation: 'works at', to_name: 'Iowa AI LLC', valid_from: '2026-01-01', recorded_at: '2026-10-16' }] });
  expect(block).toContain('## How things are connected (true now)');
  expect(block).toContain('- Alex works at Iowa AI LLC (true since 2026-01-01, learned 2026-10-16)');
});
