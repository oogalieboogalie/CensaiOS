import {
  LessonError, helpQueue, lessonTemplate, normalizeCheckpoints, normalizeClassInput, normalizeStreamUrl, progressFor, thumbnailOf,
} from '../server/lessons/model.js';
import { __resetCursorTapForTests, cursorsFor, noteCursor } from '../server/lessons/cursorTap.js';
import { createInviteCode, hashInviteCode, normalizeInviteCode } from '../server/lessons/store.js';

describe('class input', () => {
  test('steps get stable ids and empty lines drop out', () => {
    expect(normalizeCheckpoints('Connect a key\n\n  Build the agent  ')).toEqual([
      { id: '1-connect-a-key', title: 'Connect a key' },
      { id: '2-build-the-agent', title: 'Build the agent' },
    ]);
    expect(normalizeCheckpoints(Array.from({ length: 30 }, (_, i) => `Step ${i}`))).toHaveLength(12);
  });

  test('a class needs a name and a step, and caps seats at 16', () => {
    expect(() => normalizeClassInput({ checkpoints: ['a'] })).toThrow(LessonError);
    expect(() => normalizeClassInput({ title: 'Agents', checkpoints: [] })).toThrow(/at least one step/);
    expect(() => normalizeClassInput({ title: 'Agents', checkpoints: ['a'], seatLimit: 17 })).toThrow(/Seats/);
    const fields = normalizeClassInput({ title: 'Agents', checkpoints: ['a'] });
    expect(fields).toMatchObject({ seatLimit: 16, gate: 'invite', agentMode: 'own', agentBudgetTokens: 0, streamUrl: null });
  });

  test('paid classes need a Stripe price id; own-key classes never spend the instructor budget', () => {
    expect(() => normalizeClassInput({ title: 'A', checkpoints: ['a'], gate: 'stripe' })).toThrow(/price_/);
    expect(normalizeClassInput({ title: 'A', checkpoints: ['a'], gate: 'stripe', stripePriceId: 'price_1AbCdEf' }).stripePriceId).toBe('price_1AbCdEf');
    expect(normalizeClassInput({ title: 'A', checkpoints: ['a'], agentMode: 'own', agentBudgetTokens: 9000 }).agentBudgetTokens).toBe(0);
    expect(normalizeClassInput({ title: 'A', checkpoints: ['a'], agentMode: 'instructor', agentBudgetTokens: 9000 }).agentBudgetTokens).toBe(9000);
  });

  test('only YouTube and Twitch links become stream embeds', () => {
    expect(normalizeStreamUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1');
    expect(normalizeStreamUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1');
    expect(normalizeStreamUrl('https://www.youtube.com/live/abcDEF12345')).toContain('/embed/abcDEF12345');
    expect(normalizeStreamUrl('https://twitch.tv/some_coach', { parentHost: 'os.censai.app' }))
      .toBe('https://player.twitch.tv/?channel=some_coach&parent=os.censai.app');
    expect(normalizeStreamUrl('')).toBeNull();
    expect(() => normalizeStreamUrl('https://evil.example/frame')).toThrow(LessonError);
    expect(() => normalizeStreamUrl('http://youtube.com/watch?v=dQw4w9WgXcQ')).toThrow(/https/);
  });
});

describe('starter board', () => {
  test('drops the classroom, private windows and secrets', () => {
    const template = lessonTemplate({
      wins: [
        { id: 'room', kind: 'classroom', x: 0, y: 0, w: 1, h: 1 },
        { id: 'shell', kind: 'terminal', x: 0, y: 0, w: 1, h: 1 },
        { id: 'brief', kind: 'doc', x: 0, y: 0, w: 1, h: 1, apiKey: 'sk-secret', public: true },
      ],
      links: [{ id: 'l1', fromId: 'room', toId: 'brief' }],
      paths: [{ id: 'ink' }],
    });
    expect(template.wins.map((win) => win.id)).toEqual(['brief']);
    expect(template.wins[0].apiKey).toBeUndefined();
    expect(template.links).toEqual([]);
    expect(template.paths).toEqual([{ id: 'ink' }]);
  });
});

describe('grid data', () => {
  const steps = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }];

  test('progress counts done and approved steps', () => {
    const progress = progressFor(steps, [
      { checkpoint_id: 's1', done_at: '2026-10-08', approved_at: '2026-10-08', approved_by: 'Coach' },
      { checkpoint_id: 's2', done_at: '2026-10-08' },
    ]);
    expect(progress).toMatchObject({ done: 2, approved: 1, total: 2, ratio: 1 });
    expect(progress.steps[0]).toMatchObject({ approved: true, approvedBy: 'Coach' });
  });

  test('the help queue is raised hands, oldest first', () => {
    const queue = helpQueue([
      { id: 'b', display_name: 'Sam', status: 'active', hand_raised_at: '2026-10-08T05:02:00Z' },
      { id: 'a', display_name: 'Riley', status: 'active', hand_raised_at: '2026-10-08T05:01:00Z' },
      { id: 'c', display_name: 'Lapsed', status: 'lapsed', hand_raised_at: '2026-10-08T05:00:00Z' },
      { id: 'd', display_name: 'Quiet', status: 'active', hand_raised_at: null },
    ]);
    expect(queue.map((item) => item.name)).toEqual(['Riley', 'Sam']);
  });

  test('thumbnails are window boxes only', () => {
    expect(thumbnailOf({ wins: [{ id: 'a', kind: 'doc', title: 'Brief', x: 1, y: 2, w: 3, h: 4, text: 'private body' }] }))
      .toEqual([{ id: 'a', kind: 'doc', title: 'Brief', x: 1, y: 2, w: 3, h: 4 }]);
  });

  test('cursor tap keeps only class students and forgets stale cursors', () => {
    __resetCursorTapForTests();
    noteCursor('board-1', { id: 'g1', label: 'Sam', classStudent: true }, 10, 20, 1000);
    noteCursor('board-1', { id: 'owner', label: 'Coach' }, 5, 5, 1000);
    expect(cursorsFor('board-1', 2000)).toEqual([{ id: 'g1', x: 10, y: 20, at: 1000, label: 'Sam', color: null }]);
    expect(cursorsFor('board-1', 60_000)).toEqual([]);
  });
});

describe('invite codes', () => {
  test('are easy to type and match however they are typed', () => {
    const code = createInviteCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeInviteCode(` ${code.toLowerCase().replace('-', ' ')} `)).toBe(code.replace('-', ''));
    expect(hashInviteCode(code.toLowerCase())).toBe(hashInviteCode(code));
  });
});
