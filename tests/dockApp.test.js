import { jest } from '@jest/globals';
import {
  CAST_TYPE, MAX_FRAME_CHARS, appName, bgraToRgba, bgraToRgbaKeepAlpha, dockSlotId, normalizeCast, pickerRows,
  presenceLine, readCapture, slotBox, slotKey, slotUsable,
} from '../src/lib/dock/wire.js';

const published = [];
jest.unstable_mockModule('../server/collaboration/workspaceHub.js', () => ({
  publishWorkspaceEvent: (workspaceId, event, options) => published.push({ workspaceId, event, options }),
}));
const { handleDockCastMessage, __resetDockCastRelayForTests } = await import('../server/ws/dockCastMessages.js');
const { dockTick } = await import('../src/lib/dock/nativeDock.js');

const FRAME = `data:image/jpeg;base64,${'A'.repeat(400)}`;

describe('dock app wire', () => {
  test('slot ids are safe for the shell', () => {
    expect(dockSlotId('win:12/ab')).toBe('win_12_ab');
    expect(dockSlotId('')).toBe('default');
    expect(dockSlotId('x'.repeat(200))).toHaveLength(80);
  });

  test('a slot too small or covered tucks the app away', () => {
    const box = slotBox({ left: 10.4, top: 20.6, width: 640, height: 360 });
    expect(box).toEqual({ x: 10, y: 21, width: 640, height: 360 });
    expect(slotUsable(box, true)).toBe(true);
    expect(slotUsable(box, false)).toBe(false);
    expect(slotUsable({ ...box, width: 200 }, true)).toBe(false);
    expect(slotKey(box, true)).not.toBe(slotKey(box, false));
  });

  test('friendly app names and the presence line', () => {
    expect(appName({ title: 'League of Legends', process: 'LeagueClientUx.exe' })).toBe('League client');
    expect(appName({ title: '  Teamfight   Tactics ', process: 'game.exe' })).toBe('Teamfight Tactics');
    expect(appName({ title: '', process: 'tool.exe' })).toBe('tool');
    expect(appName({ title: 'x'.repeat(60) })).toHaveLength(40);
    const dock = { target: '123', hostName: 'Alex', app: 'Discord' };
    expect(presenceLine(dock)).toBe('Alex is docking Discord');
    expect(presenceLine(dock, { self: true })).toBe('You are docking Discord');
    expect(presenceLine({ ...dock, target: null })).toBe('Alex docked Discord here');
    expect(presenceLine(null)).toBe('');
  });

  test('picker rows drop junk, sort and filter', () => {
    const rows = pickerRows([
      { id: '22', title: 'Untitled - Notepad', process: 'notepad.exe' },
      { id: '11', title: 'Friends', process: 'Discord.exe' },
      { id: 'abc', title: 'bad id', process: 'x.exe' },
      { id: '33', title: '   ', process: 'blank.exe' },
      null,
    ]);
    expect(rows.map((r) => r.id)).toEqual(['11', '22']);
    expect(rows[0].name).toBe('Discord');
    expect(pickerRows(rows, 'note').map((r) => r.id)).toEqual(['22']);
    expect(pickerRows(null)).toEqual([]);
  });

  test('capture bytes: header then BGRA, swapped to RGBA', () => {
    const bytes = new Uint8Array(8 + 2 * 1 * 4);
    new DataView(bytes.buffer).setUint32(0, 2, true);
    new DataView(bytes.buffer).setUint32(4, 1, true);
    bytes.set([1, 2, 3, 0, 4, 5, 6, 0], 8);
    const capture = readCapture(bytes.buffer);
    expect(capture).toMatchObject({ width: 2, height: 1 });
    expect([...bgraToRgba(capture.bgra)]).toEqual([3, 2, 1, 255, 6, 5, 4, 255]);
    expect(readCapture(new Uint8Array(9))).toBeNull();
    expect([...bgraToRgbaKeepAlpha(new Uint8Array([1, 2, 3, 0]))]).toEqual([3, 2, 1, 255]);
    expect([...bgraToRgbaKeepAlpha(new Uint8Array([1, 2, 3, 0, 1, 2, 3, 128]))]).toEqual([3, 2, 1, 0, 3, 2, 1, 128]);
  });

  test('cast messages are validated', () => {
    expect(normalizeCast({ type: CAST_TYPE, windowId: 'w1', frame: FRAME, width: 480, height: 270 }))
      .toEqual({ windowId: 'w1', frame: FRAME, width: 480, height: 270 });
    expect(normalizeCast({ type: CAST_TYPE, windowId: 'w1', frame: null })).toMatchObject({ frame: null });
    expect(normalizeCast({ type: CAST_TYPE, windowId: '../w', frame: null })).toBeNull();
    expect(normalizeCast({ type: CAST_TYPE, windowId: 'w1', frame: 'data:image/png;base64,AAAA', width: 1, height: 1 })).toBeNull();
    expect(normalizeCast({ type: CAST_TYPE, windowId: 'w1', frame: `${FRAME}"<x>`, width: 1, height: 1 })).toBeNull();
    expect(normalizeCast({ type: CAST_TYPE, windowId: 'w1', frame: `data:image/jpeg;base64,${'A'.repeat(MAX_FRAME_CHARS)}`, width: 1, height: 1 })).toBeNull();
    expect(normalizeCast({ type: CAST_TYPE, windowId: 'w1', frame: FRAME, width: 0, height: 5 })).toBeNull();
    expect(normalizeCast({ type: 'game.frame' })).toBeNull();
  });
});

describe('glue loop against a stub shell', () => {
  function stubShell(fail = {}) {
    const calls = [];
    const invoke = (cmd, args) => {
      calls.push([cmd, args]);
      return fail[cmd] ? Promise.reject(fail[cmd]) : Promise.resolve();
    };
    return { calls, invoke };
  }
  const freshState = () => ({ attachedTo: null, lastKey: '', visible: false, busy: false, gone: false, failed: false, error: null });
  const rect = { left: 100, top: 80, width: 800, height: 500 };

  test('attaches once, then only sends changes', async () => {
    const { calls, invoke } = stubShell();
    const state = freshState();
    await dockTick({ invoke, id: 'w1', target: '4242', rect, clear: true, state });
    expect(calls).toEqual([['dock_attach', { id: 'w1', target: '4242', x: 100, y: 80, width: 800, height: 500, visible: true }]]);
    expect(state.attachedTo).toBe('4242');
    expect(dockTick({ invoke, id: 'w1', target: '4242', rect, clear: true, state })).toBeNull();
    await dockTick({ invoke, id: 'w1', target: '4242', rect: { ...rect, left: 140 }, clear: true, state });
    await dockTick({ invoke, id: 'w1', target: '4242', rect: { ...rect, left: 140 }, clear: false, state });
    expect(calls.slice(1)).toEqual([
      ['dock_set_bounds', { id: 'w1', x: 140, y: 80, width: 800, height: 500, visible: true }],
      ['dock_set_bounds', { id: 'w1', x: 140, y: 80, width: 800, height: 500, visible: false }],
    ]);
    expect(state.visible).toBe(false);
  });

  test('a closed app is reported once and the loop stops', async () => {
    const { calls, invoke } = stubShell({ dock_set_bounds: 'gone' });
    const state = freshState();
    await dockTick({ invoke, id: 'w1', target: '7', rect, clear: true, state });
    await dockTick({ invoke, id: 'w1', target: '7', rect: { ...rect, top: 0 }, clear: true, state });
    expect(state.gone).toBe(true);
    expect(dockTick({ invoke, id: 'w1', target: '7', rect: { ...rect, top: 9 }, clear: true, state })).toBeNull();
    expect(calls).toHaveLength(2);
  });

  test('a refused attach is not retried every frame', async () => {
    const { calls, invoke } = stubShell({ dock_attach: 'that window cannot be docked' });
    const state = freshState();
    await dockTick({ invoke, id: 'w1', target: '7', rect, clear: true, state });
    expect(state).toMatchObject({ failed: true, error: 'that window cannot be docked' });
    expect(dockTick({ invoke, id: 'w1', target: '7', rect, clear: true, state })).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe('cast relay on the collaboration socket', () => {
  const errors = [];
  const sendJson = (_ws, payload) => errors.push(payload);
  const context = { ws: {}, workspaceId: 'ws1', clientId: 'host', actor: { type: 'human', label: 'Alex' }, spectator: false };
  beforeEach(() => { published.length = 0; errors.length = 0; __resetDockCastRelayForTests(); });

  test('pictures go to other members only, at most five a second', () => {
    const message = { type: CAST_TYPE, windowId: 'w1', frame: FRAME, width: 480, height: 270 };
    expect(handleDockCastMessage(message, context, sendJson, 1000)).toBe(true);
    expect(published).toHaveLength(1);
    const { event, options } = published[0];
    expect(event).toMatchObject({ type: CAST_TYPE, windowId: 'w1', clientId: 'host', width: 480 });
    expect(options.excludeClientId).toBe('host');
    expect(options.guests).toBeUndefined();
    expect(options.filter({ actor: { type: 'human' } })).toBe(true);
    expect(options.filter({ actor: { type: 'guest' } })).toBe(false);
    handleDockCastMessage(message, context, sendJson, 1100);
    expect(published).toHaveLength(1);
    handleDockCastMessage({ type: CAST_TYPE, windowId: 'w1', frame: null }, context, sendJson, 1101);
    expect(published).toHaveLength(2);
    handleDockCastMessage(message, context, sendJson, 1300);
    expect(published).toHaveLength(3);
  });

  test('bad pictures are refused; guests and spectators are ignored; other types pass', () => {
    handleDockCastMessage({ type: CAST_TYPE, windowId: 'w1', frame: 'nope', width: 1, height: 1 }, context, sendJson, 1000);
    expect(errors).toEqual([{ type: 'error', reason: 'invalid-dock-cast' }]);
    const message = { type: CAST_TYPE, windowId: 'w1', frame: FRAME, width: 4, height: 4 };
    expect(handleDockCastMessage(message, { ...context, actor: { type: 'guest' } }, sendJson, 2000)).toBe(true);
    expect(handleDockCastMessage(message, { ...context, spectator: true }, sendJson, 3000)).toBe(true);
    expect(published).toHaveLength(0);
    expect(handleDockCastMessage({ type: 'game.frame' }, context, sendJson)).toBe(false);
  });
});
