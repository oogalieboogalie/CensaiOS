import { normalizeTodos } from '../src/components/todos/TodosData.js';

describe('a new To-do List', () => {
  test('starts empty instead of with sample newsletter tasks', () => {
    expect(normalizeTodos(undefined)).toEqual([]);
    expect(normalizeTodos(null)).toEqual([]);
  });

  test('keeps the tasks it was given', () => {
    expect(normalizeTodos([{ id: 1, text: ' Call the lender ', done: 1 }])).toEqual([
      { id: 1, text: 'Call the lender', done: true, assignee: null },
    ]);
  });
});
