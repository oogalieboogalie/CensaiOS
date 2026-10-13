import { jest } from '@jest/globals';
import { createLiveInkSender, decimate, encodeLiveInk, liveInkStroke, normalizeInkPreview, MAX_LIVE_POINTS } from '../src/lib/ink/live.js';

const published = [];
jest.unstable_mockModule('../server/collaboration/workspaceHub.js', () => ({
  publishWorkspaceEvent: (workspaceId, event, options) => published.push({ workspaceId, event, options }),
}));
const { handleInkPreviewMessage } = await import('../server/ws/inkPreviewMessages.js');

const points = (n) => Array.from({ length: n }, (_, i) => ({ x: i + 0.123, y: i * 2, p: 0.456 }));

describe('live ink previews', () => {
  test('encoding rounds, decimates long strokes and keeps the last point', () => {
    const msg = encodeLiveInk({ strokeId: 's1', points: points(1000), color: 'var(--ink)', size: 8 });
    expect(msg.pts).toHaveLength(MAX_LIVE_POINTS);
    expect(msg.pts[0]).toEqual([0.1, 0, 0.46]);
    expect(msg.pts.at(-1)[1]).toBe(999 * 2);
    expect(decimate([1, 2, 3], 10)).toEqual([1, 2, 3]);
    expect(JSON.stringify({ type: 'ink.preview', ...msg }).length).toBeLessThan(16 * 1024);
  });

  test('normalizing rejects bad ids, coordinates, sizes and colors', () => {
    const good = encodeLiveInk({ strokeId: 's1', points: points(3), color: 'var(--canvas-pen-blue)', size: 8 });
    expect(normalizeInkPreview(good)).toMatchObject({ strokeId: 's1', color: 'var(--canvas-pen-blue)', phase: 'move' });
    expect(normalizeInkPreview({ ...good, strokeId: 'bad id!' })).toBeNull();
    expect(normalizeInkPreview({ ...good, pts: [[Infinity, 0, 0.5]] })).toBeNull();
    expect(normalizeInkPreview({ ...good, size: 0 })).toBeNull();
    expect(normalizeInkPreview({ ...good, color: 'url(javascript:alert(1))";' }).color).toBe('');
    expect(liveInkStroke(normalizeInkPreview(good))).toMatchObject({ id: 'live-s1', ink: 1, size: 8 });
  });

  test('the sender throttles moves but always sends the end', () => {
    let t = 0;
    const sent = [];
    const send = createLiveInkSender((m) => sent.push(m), { interval: 40, now: () => t });
    const base = { strokeId: 's', points: points(2), size: 4 };
    send(base); t += 10; send(base); t += 10; send({ ...base, phase: 'end' });
    expect(sent.map((m) => m.phase)).toEqual(['move', 'end']);
  });

  test('the socket relays a valid preview to everyone else and refuses a bad one', () => {
    const errors = [];
    const context = { workspaceId: 'w', clientId: 'c1', actor: { type: 'user' }, ws: {} };
    const sendJson = (_ws, payload) => errors.push(payload);
    expect(handleInkPreviewMessage({ type: 'cursor.move' }, context, sendJson)).toBe(false);
    const msg = { type: 'ink.preview', ...encodeLiveInk({ strokeId: 's1', points: points(4), color: 'var(--ink)', size: 6 }) };
    expect(handleInkPreviewMessage(msg, context, sendJson)).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0].event).toMatchObject({ type: 'ink.preview', strokeId: 's1', clientId: 'c1' });
    expect(published[0].options).toMatchObject({ excludeClientId: 'c1', guests: true });
    handleInkPreviewMessage({ type: 'ink.preview', strokeId: 's2', pts: 'nope', size: 4 }, context, sendJson);
    expect(errors).toEqual([{ type: 'error', reason: 'invalid-ink-preview' }]);
    handleInkPreviewMessage(msg, { ...context, spectator: true }, sendJson);
    expect(published).toHaveLength(1);
  });
});
