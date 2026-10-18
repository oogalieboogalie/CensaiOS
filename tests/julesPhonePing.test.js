import { jest } from '@jest/globals';
import { phonePingUrl, phonePingMessage, sendPhonePing } from '../server/jules-task-sync/phonePing.js';

// Phone ping when Jules gets stuck (diagram 01): off until the owner sets
// their own https push address; never throws.

const entry = { title: 'Fix the invoice total', code: 'review_still_failing', detail: 'Round 3 review: totals still off.', prNumber: 88, blockedAt: '2026-10-16T22:50:00Z' };

describe('phone ping', () => {
  test('is off unless an https address is set', () => {
    expect(phonePingUrl({})).toBe('');
    expect(phonePingUrl({ JULES_PHONE_PING_URL: 'http://ntfy.sh/x' })).toBe('');
    expect(phonePingUrl({ JULES_PHONE_PING_URL: 'not a url' })).toBe('');
    expect(phonePingUrl({ JULES_PHONE_PING_URL: ' https://ntfy.sh/jordan-test ' })).toBe('https://ntfy.sh/jordan-test');
  });

  test('says which task is stuck and why, like the Inbox', () => {
    const { title, body } = phonePingMessage(entry, 'acme/shop');
    expect(title).toBe('Jules is stuck: Fix the invoice total');
    expect(body).toMatch(/review still says no after 3 fix rounds/);
    expect(body).toMatch(/#88/);
  });

  test('posts one plain-text message to the address', async () => {
    const post = jest.fn(async () => ({ ok: true, status: 200 }));
    expect(await sendPhonePing(entry, { env: { JULES_PHONE_PING_URL: 'https://ntfy.sh/jordan-test' }, post })).toBe('sent');
    const [url, init] = post.mock.calls[0];
    expect(url).toBe('https://ntfy.sh/jordan-test');
    expect(init.method).toBe('POST');
    expect(init.headers.Title).toBe('Jules is stuck: Fix the invoice total');
  });

  test('does nothing when off, and never throws when the service fails', async () => {
    const post = jest.fn(async () => { throw new Error('offline'); });
    expect(await sendPhonePing(entry, { env: {}, post })).toBe('off');
    expect(post).not.toHaveBeenCalled();
    expect(await sendPhonePing(entry, { env: { JULES_PHONE_PING_URL: 'https://ntfy.sh/x' }, post })).toBe('failed: offline');
    const bad = jest.fn(async () => ({ ok: false, status: 503 }));
    expect(await sendPhonePing(entry, { env: { JULES_PHONE_PING_URL: 'https://ntfy.sh/x' }, post: bad })).toBe('failed: the push service answered 503');
  });
});
