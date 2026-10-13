/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useGroupHotkeys } from '../src/app/hooks/useGroupHotkeys.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { loadGroupHotkeys } from '../src/lib/groupHotkeys.js';

// Key-handling contract for AoE-style control groups: Ctrl/Alt+<n> binds the
// active window's group, F<n> jumps to it — and a key that did nothing is
// never swallowed (an unbound F5 must still refresh the page).
const press = (init) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => { window.dispatchEvent(event); });
  return event;
};

describe('useGroupHotkeys', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({
      wins: [
        { id: 'w1', groupId: 'g1', x: 100, y: 100, w: 200, h: 200 },
        { id: 'loose', groupId: null, x: 5000, y: 5000, w: 100, h: 100 },
      ],
      canvasGroups: [{ id: 'g1', x: 0, y: 0, w: 800, h: 600 }],
      activeId: 'w1',
      selectedIds: [],
      pan: { x: 0, y: 0 },
      zoom: 1,
      groupFocus: null,
    });
  });

  test('Alt+digit binds the active window group and persists it per workspace', () => {
    const { result } = renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    const event = press({ code: 'Digit3', key: '3', altKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.bindings).toEqual({ 3: 'g1' });
    expect(loadGroupHotkeys('ws-1')).toEqual({ 3: 'g1' });
    expect(loadGroupHotkeys('ws-other')).toEqual({});
  });

  test('assigning with no grouped active window does nothing and leaves the key alone', () => {
    useWorkspaceStore.setState({ activeId: 'loose' });
    const { result } = renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    const event = press({ code: 'Digit2', key: '2', ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.bindings).toEqual({});
  });

  test('F-key on a bound slot moves the viewport to the group and hands it the keyboard', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    useWorkspaceStore.setState({ activeId: 'loose', pan: { x: -9999, y: -9999 }, zoom: 0.3 });

    const event = press({ code: 'F1', key: 'F1' });
    expect(event.defaultPrevented).toBe(true);
    const state = useWorkspaceStore.getState();
    expect(state.selectedIds).toEqual([]);
    expect(state.activeId).toBe('w1');
    expect(state.pan).not.toEqual({ x: -9999, y: -9999 });
    // Group centre (400, 300) lands on the viewport centre (shifted down by
    // half the room left for the group tab) at the fill-the-screen zoom.
    expect(state.pan.x + 400 * state.zoom).toBeCloseTo(window.innerWidth / 2);
    expect(state.pan.y + 300 * state.zoom).toBeCloseTo((window.innerHeight + 40) / 2);
    expect(state.groupFocus).toMatchObject({ groupId: 'g1', prevPan: { x: -9999, y: -9999 }, prevZoom: 0.3 });
  });

  test('Escape leaves the focused group and restores the previous view', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    useWorkspaceStore.setState({ pan: { x: 12, y: 34 }, zoom: 0.5 });
    press({ code: 'F1', key: 'F1' });
    expect(useWorkspaceStore.getState().groupFocus).not.toBeNull();

    const esc = press({ key: 'Escape', code: 'Escape' });
    expect(esc.defaultPrevented).toBe(true);
    const state = useWorkspaceStore.getState();
    expect(state.groupFocus).toBeNull();
    expect(state.pan).toEqual({ x: 12, y: 34 });
    expect(state.zoom).toBe(0.5);
    // A second Escape has nothing to leave and stays unhandled.
    expect(press({ key: 'Escape', code: 'Escape' }).defaultPrevented).toBe(false);
  });

  test('the same F-key toggles focus off; another F-key switches but keeps the original view', () => {
    useWorkspaceStore.setState({
      wins: [
        { id: 'w1', groupId: 'g1', x: 100, y: 100, w: 200, h: 200 },
        { id: 'w2', groupId: 'g2', x: 3100, y: 100, w: 200, h: 200 },
      ],
      canvasGroups: [{ id: 'g1', x: 0, y: 0, w: 800, h: 600 }, { id: 'g2', x: 3000, y: 0, w: 800, h: 600 }],
      activeId: 'w1',
    });
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    useWorkspaceStore.setState({ activeId: 'w2' });
    press({ code: 'Digit2', key: '2', altKey: true });
    useWorkspaceStore.setState({ pan: { x: 1, y: 2 }, zoom: 0.4 });

    press({ code: 'F1', key: 'F1' });
    press({ code: 'F2', key: 'F2' });
    expect(useWorkspaceStore.getState().groupFocus.groupId).toBe('g2');
    press({ code: 'F2', key: 'F2' });
    const state = useWorkspaceStore.getState();
    expect(state.groupFocus).toBeNull();
    expect(state.pan).toEqual({ x: 1, y: 2 });
    expect(state.zoom).toBe(0.4);
  });

  test('Ctrl+digit on a selection of loose windows creates a group and binds it', () => {
    useWorkspaceStore.setState({
      wins: [
        { id: 'a', x: 0, y: 0, w: 400, h: 300 },
        { id: 'b', x: 450, y: 0, w: 400, h: 300 },
      ],
      canvasGroups: [],
      activeId: 'b',
      selectedIds: ['a', 'b'],
    });
    const { result } = renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    const event = press({ code: 'Digit5', key: '5', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    const { canvasGroups, wins } = useWorkspaceStore.getState();
    expect(canvasGroups).toHaveLength(1);
    expect(result.current.bindings).toEqual({ 5: canvasGroups[0].id });
    expect(wins.every((w) => w.groupId === canvasGroups[0].id)).toBe(true);
  });

  test('deleting the focused group leaves focus', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    useWorkspaceStore.setState({ pan: { x: 7, y: 8 }, zoom: 0.6 });
    press({ code: 'F1', key: 'F1' });
    act(() => { useWorkspaceStore.getState().onCloseGroup('g1'); });
    const state = useWorkspaceStore.getState();
    expect(state.groupFocus).toBeNull();
    expect(state.pan).toEqual({ x: 7, y: 8 });
  });

  test('an unbound F-key is not swallowed, so F5 still refreshes', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    const before = useWorkspaceStore.getState().pan;
    const event = press({ code: 'F5', key: 'F5' });
    expect(event.defaultPrevented).toBe(false);
    expect(useWorkspaceStore.getState().pan).toBe(before);
  });

  test('a binding to a deleted group is pruned instead of jumping nowhere', () => {
    const { result } = renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit4', key: '4', altKey: true });
    useWorkspaceStore.setState({ canvasGroups: [] });
    const event = press({ code: 'F4', key: 'F4' });
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.bindings).toEqual({});
    expect(loadGroupHotkeys('ws-1')).toEqual({});
  });

  test('typing in an input never triggers a hotkey', () => {
    const { result } = renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Digit1', key: '1', altKey: true });
    act(() => { input.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.bindings).toEqual({});
    input.remove();
  });

  const pressIn = (target, init) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    act(() => { target.dispatchEvent(event); });
    return event;
  };

  test('F-keys work from inside a chat box; plain Esc stays the box\'s, Shift+Esc always leaves', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    useWorkspaceStore.setState({ pan: { x: 3, y: 4 }, zoom: 0.7 });
    const box = document.createElement('textarea');
    document.body.appendChild(box);

    expect(pressIn(box, { code: 'F1', key: 'F1' }).defaultPrevented).toBe(true);
    expect(useWorkspaceStore.getState().groupFocus).toMatchObject({ groupId: 'g1', slot: '1' });

    expect(pressIn(box, { code: 'Escape', key: 'Escape' }).defaultPrevented).toBe(false);
    expect(useWorkspaceStore.getState().groupFocus).not.toBeNull();

    expect(pressIn(box, { code: 'Escape', key: 'Escape', shiftKey: true }).defaultPrevented).toBe(true);
    const state = useWorkspaceStore.getState();
    expect(state.groupFocus).toBeNull();
    expect(state.pan).toEqual({ x: 3, y: 4 });
    box.remove();
  });

  test('F-keys inside a terminal stay with the terminal', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    const term = document.createElement('div');
    term.className = 'xterm';
    document.body.appendChild(term);
    expect(pressIn(term, { code: 'F1', key: 'F1' }).defaultPrevented).toBe(false);
    expect(useWorkspaceStore.getState().groupFocus).toBeNull();
    term.remove();
  });

  test('binding a group to a new slot moves it off its old slot', () => {
    const { result } = renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    press({ code: 'Digit6', key: '6', altKey: true });
    expect(result.current.bindings).toEqual({ 6: 'g1' });
    expect(loadGroupHotkeys('ws-1')).toEqual({ 6: 'g1' });
  });

  test('the focused group refits when the browser window is resized', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    useWorkspaceStore.setState({ pan: { x: 9, y: 9 }, zoom: 0.2 });
    press({ code: 'F1', key: 'F1' });
    const before = useWorkspaceStore.getState().zoom;
    const prev = { w: window.innerWidth, h: window.innerHeight };
    window.innerWidth = prev.w * 2;
    window.innerHeight = prev.h * 2;
    act(() => { window.dispatchEvent(new Event('resize')); });
    const state = useWorkspaceStore.getState();
    expect(state.zoom).not.toBe(before);
    expect(state.groupFocus).toMatchObject({ groupId: 'g1', slot: '1', prevPan: { x: 9, y: 9 }, prevZoom: 0.2 });
    window.innerWidth = prev.w;
    window.innerHeight = prev.h;
  });
});
