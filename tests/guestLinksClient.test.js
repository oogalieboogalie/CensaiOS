import { jest } from '@jest/globals';
import { guestJoinToken, guestLinkUrl } from '../src/lib/workspace/shareLink.js';
import { followCamera } from '../src/lib/guest/guestIdentity.js';
import { isGuestAllowedRequest } from '../src/lib/guest/guestFetchGuard.js';
import { mergeComment, threadsOf } from '../src/lib/comments/commentStore.js';
import { __resetLiveGuestsForTests, trackGuestSocket } from '../server/shareLinks/liveGuests.js';

const TOKEN = 'A'.repeat(43);

test('join links carry only a well-formed token', () => {
  expect(guestJoinToken(`?join=${TOKEN}`)).toBe(TOKEN);
  expect(guestJoinToken('?join=../../etc')).toBeNull();
  expect(guestLinkUrl(TOKEN, { origin: 'https://censai.app', pathname: '/' })).toBe(`https://censai.app/?join=${TOKEN}`);
  expect(guestLinkUrl('bad', { origin: 'https://censai.app', pathname: '/' })).toBe('');
});

test('a spectator sees at least what the host sees, centered the same', () => {
  const host = { x: -200, y: 40, zoom: 1.4, width: 1440, height: 900 };
  const { pan, zoom } = followCamera(host, { width: 1100, height: 700 });
  const hostCenter = { x: (720 + 200) / 1.4, y: (450 - 40) / 1.4 };
  expect((550 - pan.x) / zoom).toBeCloseTo(hostCenter.x);
  expect((350 - pan.y) / zoom).toBeCloseTo(hostCenter.y);
  expect(zoom).toBeLessThan(1.4);
});

test('guest pages only call guest endpoints', () => {
  const origin = 'http://localhost:5173';
  expect(isGuestAllowedRequest('/api/guest/board', origin)).toBe(true);
  expect(isGuestAllowedRequest('/api/keys', origin)).toBe(false);
  expect(isGuestAllowedRequest('/api/operational-intelligence/todos/open', origin)).toBe(false);
  expect(isGuestAllowedRequest('/src/lib/store.js', origin)).toBe(true);
});

test('comments merge live and group into threads', () => {
  let list = [];
  list = mergeComment(list, { id: 'a', body: 'root', createdAt: '2026-10-07T01:00:00Z' });
  list = mergeComment(list, { id: 'b', threadId: 'a', body: 'reply', createdAt: '2026-10-07T01:01:00Z' });
  list = mergeComment(list, { id: 'a', resolvedAt: '2026-10-07T01:02:00Z' });
  const [thread] = threadsOf(list);
  expect(thread).toMatchObject({ id: 'a', body: 'root', resolvedAt: '2026-10-07T01:02:00Z' });
  expect(thread.replies.map((reply) => reply.id)).toEqual(['b']);
});

test('an expiring link closes its sockets when time runs out', () => {
  jest.useFakeTimers();
  try {
    const close = jest.fn();
    trackGuestSocket('link-x', close, { expiresAt: new Date(Date.now() + 5000) });
    jest.advanceTimersByTime(4999);
    expect(close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    expect(close).toHaveBeenCalledWith(4410, 'Share link expired');
  } finally {
    __resetLiveGuestsForTests();
    jest.useRealTimers();
  }
});
