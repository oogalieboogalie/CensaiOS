import {
  applyAllowListToInitial,
  filterAllowedWindows,
} from '../src/lib/workspace/allowList.js';

const WINS = [
  { id: 'a', kind: 'chat' },
  { id: 'b', kind: 'todos' },
  { id: 'c', kind: 'doc' },
];

test('a narrow allow-list never deletes existing windows on boot', () => {
  const { wins, windowAllowList } = applyAllowListToInitial(
    { wins: WINS, windowAllowList: { canva: true, figma: true } },
    {},
  );
  expect(wins.map((w) => w.id).sort()).toEqual(['a', 'b', 'c']);
  expect(windowAllowList.chat).toBe(true);
  expect(windowAllowList.todos).toBe(true);
  expect(windowAllowList.doc).toBe(true);
});

test('explicit false still hides, unknown future kinds stay hidden', () => {
  const { wins } = applyAllowListToInitial(
    { wins: [...WINS, { id: 'd', kind: 'todos' }], windowAllowList: { todos: false } },
    {},
  );
  expect(wins.map((w) => w.id)).toEqual(['a', 'c']);
  expect(filterAllowedWindows([{ id: 'x', kind: 'someday-new-kind' }], { windowAllowList: {} })).toEqual([]);
});

test('empty canvas stays empty, missing kinds pass through untouched', () => {
  expect(applyAllowListToInitial({ wins: [], windowAllowList: {} }, {}).wins).toEqual([]);
  expect(applyAllowListToInitial(null, null)).toEqual({ wins: [], windowAllowList: {} });
});
