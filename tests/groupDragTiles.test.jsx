/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';

// A group stays tiled after you drag it past a loose window (backlog 39), and
// a Shift-click on a tile with no real drag leaves it in its group.

const logToApp = jest.fn();
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logFailure: () => {}, logToApp, installBrowserLog: () => {}, flushAppLog: () => {}, pendingAppLog: () => [], formatArgs: (a) => a.join(' ') }));
const { groupDragMembers } = await import('../src/lib/layout/groupDragMembers.js');
const { tiledMembers } = await import('../src/lib/layout/dockZones.js');
await import('../src/lib/store.js'); // loads first, as in the app (store.js <-> storeCanvasActions.js)
const { createCanvasActions } = await import('../src/lib/storeCanvasActions.js');
const { useWindowFrameInteractions, DRAG_START_PX } = await import('../src/components/windows/useWindowFrameInteractions.js');

const root = { type: 'split', axis: 'vertical', ratio: 0.5, first: { type: 'leaf', windowId: 'a' }, second: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: 'b' }, second: { type: 'leaf', windowId: 'c' } } };
const group = { id: 'g1', label: 'Launch', x: 0, y: 0, w: 900, h: 600, root };
const tile = (id, x, y) => ({ id, kind: 'chat', groupId: 'g1', x, y, w: 440, h: 290 });
const sticky = { id: 's', kind: 'sticky', title: 'Sticky', x: 300, y: 200, w: 200, h: 160 };

function store(wins, groups) {
  let state = { wins, canvasGroups: groups };
  const set = (fn) => { state = { ...state, ...(typeof fn === 'function' ? fn(state) : fn) }; };
  const actions = createCanvasActions(set, () => state);
  return { actions, get: () => state };
}

beforeEach(() => logToApp.mockClear());

test('a tiled group carries only its tiles and leaves a loose window behind', () => {
  const wins = [tile('a', 0, 0), tile('b', 450, 0), tile('c', 450, 300), sticky];
  const { carry, leftBehind } = groupDragMembers(group, wins);
  expect(carry.map(w => w.id)).toEqual(['a', 'b', 'c']);
  expect(leftBehind.map(w => w.id)).toEqual(['s']);
});

test('dragging the group over a Sticky keeps it one tiled group and logs it', () => {
  const s = store([tile('a', 0, 0), tile('b', 450, 0), tile('c', 450, 300), { ...sticky, groupId: 'g1' }], [group]);
  s.actions.moveGroup('g1', 10, 10, true);
  s.actions.moveGroup('g1', 120, 40, false);
  const { wins, canvasGroups } = s.get();
  expect(wins.find(w => w.id === 's')).toMatchObject({ x: 300, y: 200, groupId: null });
  expect(wins.find(w => w.id === 'a')).toMatchObject({ x: 120, y: 40 });
  expect(tiledMembers(canvasGroups[0], wins).map(w => w.id)).toEqual(['a', 'b', 'c']);
  expect(logToApp).toHaveBeenCalledWith('info', expect.stringMatching(/"Launch" left Sticky behind/), expect.anything());
});

test('a group with no layout still picks up a window inside it, and says so', () => {
  const loose = { id: 'g2', label: 'Ideas', x: 0, y: 0, w: 900, h: 600 };
  const s = store([{ ...sticky }], [loose]);
  s.actions.moveGroup('g2', 5, 5, true);
  expect(s.get().wins[0]).toMatchObject({ x: 305, groupId: 'g2' });
  expect(logToApp).toHaveBeenCalledWith('info', expect.stringMatching(/"Ideas" picked up Sticky/), expect.anything());
});

test('a Shift-click with a little jitter is not a drag', () => {
  const onDragEnd = jest.fn();
  const onUpdate = jest.fn();
  const win = tile('a', 0, 0);
  const { result } = renderHook(() => useWindowFrameInteractions({
    win, onUpdate, onSelect: () => {}, onDragEnd, zoom: 1, theme: { gridSnapping: false }, allWins: [win],
    tileGroupId: 'g1', groupDrag: { move: jest.fn(), end: jest.fn() },
  }));
  const target = { setPointerCapture() {}, releasePointerCapture() {} };
  act(() => {
    result.current.startDrag({ clientX: 100, clientY: 100, shiftKey: true, pointerId: 1, stopPropagation() {}, currentTarget: target });
    result.current.onPointerMove({ clientX: 100 + DRAG_START_PX - 2, clientY: 101 });
    result.current.onPointerUp({ pointerId: 1, currentTarget: target });
  });
  expect(onUpdate).not.toHaveBeenCalled();
  expect(onDragEnd).toHaveBeenCalledWith('a', { x: 0, y: 0 }, expect.objectContaining({ moved: false }));
});

test('a real Shift-drag still pulls the tile out', () => {
  const onDragEnd = jest.fn();
  const win = tile('a', 0, 0);
  const { result } = renderHook(() => useWindowFrameInteractions({
    win, onUpdate: jest.fn(), onSelect: () => {}, onDragEnd, zoom: 1, theme: { gridSnapping: false }, allWins: [win],
    tileGroupId: 'g1', groupDrag: { move: jest.fn(), end: jest.fn() },
  }));
  const target = { setPointerCapture() {}, releasePointerCapture() {} };
  act(() => {
    result.current.startDrag({ clientX: 100, clientY: 100, shiftKey: true, pointerId: 1, stopPropagation() {}, currentTarget: target });
    result.current.onPointerMove({ clientX: 160, clientY: 140 });
    result.current.onPointerUp({ pointerId: 1, currentTarget: target });
  });
  expect(onDragEnd).toHaveBeenCalledWith('a', { x: 60, y: 40 }, expect.objectContaining({ moved: true }));
});
