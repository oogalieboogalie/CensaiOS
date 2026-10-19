import { jest } from '@jest/globals';
import { cleanTag, openTodosFromBoard, tagHue, SCHEDULE_TAGS } from '../src/lib/schedule/tags.js';
import { cleanScheduleTag, createSchedule } from '../server/scheduler/store.js';

describe('scheduler tags and to-do picker (diagram 02)', () => {
  test('tags are one short line and keep a steady color', () => {
    expect(cleanTag('  Slop \n maintenance ')).toBe('Slop maintenance');
    expect(cleanTag('x'.repeat(50))).toHaveLength(32);
    expect(tagHue('maintenance')).toBe(SCHEDULE_TAGS[0].hue);
    expect(tagHue('Launch day')).toBe(tagHue('launch day'));
    expect(cleanScheduleTag('   ')).toBeNull();
  });

  test('picks only open to-dos from to-do list windows, without repeats', () => {
    const wins = [
      { id: 'a', kind: 'todos', items: [{ id: 1, text: 'Fix the dock', done: false }, { id: 2, text: 'Old', done: true }] },
      { id: 'b', kind: 'chat', items: [{ id: 3, text: 'Not a to-do' }] },
      { id: 'c', kind: 'todos', title: 'Launch', items: [{ id: 4, text: 'fix the dock' }, { id: 5, text: 'Write the post' }] },
    ];
    expect(openTodosFromBoard(wins).map((t) => t.text)).toEqual(['fix the dock', 'Write the post']);
    expect(openTodosFromBoard(undefined)).toEqual([]);
  });

  test('a new run saves its tag', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 's1' }] }) };
    await createSchedule({
      agent_id: 'atlas', task_text: 'Sweep the logs', tag: ' Maintenance ',
      scheduled_date: '2026-10-20', scheduled_time: '3:00 AM',
    }, { db, userId: 7, workspaceId: 'w1' });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('tag, workspace_id');
    expect(values).toContain('Maintenance');
    expect(values.slice(-2)).toEqual(['w1', 7]);
  });
});
