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

  test('F-key on a bound slot moves the viewport to the group and selects its members', () => {
    renderHook(() => useGroupHotkeys({ workspaceId: 'ws-1' }));
    press({ code: 'Digit1', key: '1', altKey: true });
    useWorkspaceStore.setState({ activeId: 'loose', pan: { x: -9999, y: -9999 }, zoom: 0.3 });

    const event = press({ code: 'F1', key: 'F1' });
    expect(event.defaultPrevented).toBe(true);
    const state = useWorkspaceStore.getState();
    expect(state.selectedIds).toEqual(['w1']);
    expect(state.activeId).toBe('w1');
    expect(state.pan).not.toEqual({ x: -9999, y: -9999 });
    // Group centre (400, 300) lands on the viewport centre at the fitted zoom.
    expect(state.pan.x + 400 * state.zoom).toBeCloseTo(window.innerWidth / 2);
    expect(state.pan.y + 300 * state.zoom).toBeCloseTo(window.innerHeight / 2);
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
});
