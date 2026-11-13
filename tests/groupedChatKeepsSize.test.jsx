/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useWorkspaceStore } from '../src/lib/store.js';
import { canvasObjectToLegacyWindow } from '../src/lib/canvasObjectTypes.js';
import { useWindowSelection } from '../src/app/hooks/useWindowSelection.js';
import { useGroupHotkeys } from '../src/app/hooks/useGroupHotkeys.js';
import { canvasWorkspaceSnapshot } from '../src/lib/workspace/canvasWorkspaceSnapshot.js';
import { applyAllowListToInitial, migrateWorkspace } from '../src/lib/workspace/allowList.js';
import { withoutUnsupportedWindows } from '../src/lib/appUtils.js';

// Crew 157: a chat inside a window group keeps its grouped size through
// everything a person does to it. One run walks the whole day: click it,
// type, drag the group, reload the board, Alt+1, F1 and Escape. After every
// step the chat is still the grouped size and still in the group.
const chat = (id, x, y) => canvasObjectToLegacyWindow({
  id, kind: 'chat', x, y, w: 380, h: 520, width: 380, height: 520,
});

const press = (init) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => { window.dispatchEvent(event); });
  return event;
};

const chatA = () => useWorkspaceStore.getState().wins.find((w) => w.id === 'a');
const sizeOf = (win) => ({ w: win.w, h: win.h, width: win.width, height: win.height });

// The same steps the app takes on a reload: save the board as text, read it
// back, migrate it, and put it on the board through the allow-list.
function reloadBoard() {
  const saved = JSON.stringify(canvasWorkspaceSnapshot(useWorkspaceStore.getState()));
  useWorkspaceStore.setState({ wins: [], canvasGroups: [], activeId: null, selectedIds: [] });
  const migrated = migrateWorkspace(JSON.parse(saved));
  const { wins } = applyAllowListToInitial(migrated, {});
  const s = useWorkspaceStore.getState();
  s.setWins(withoutUnsupportedWindows(wins));
  s.setCanvasGroups(migrated.canvasGroups || []);
}

describe('a chat in a group keeps its grouped size', () => {
  let groupId;
  let grouped;

  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({
      wins: [chat('a', 100, 100), chat('b', 600, 100)],
      canvasGroups: [],
      selectedIds: [],
      activeId: null,
      pan: { x: 0, y: 0 },
      zoom: 1,
      groupFocus: null,
    });
    groupId = useWorkspaceStore.getState().spawnGroup({ x: 0, y: 0 }, { w: 1200, h: 800 });
    useWorkspaceStore.getState().autoArrangeGroup(groupId, 'SPLIT_LR');
    grouped = sizeOf(chatA());
  });

  const expectStillGrouped = (step) => {
    const win = chatA();
    expect({ step, ...sizeOf(win) }).toEqual({ step, ...grouped });
    expect({ step, groupId: win.groupId }).toEqual({ step, groupId });
  };

  test('the arranged size is the group tile, not the old full size', () => {
    expect(grouped.w).toBe(grouped.width);
    expect(grouped.h).toBe(grouped.height);
    expect([grouped.w, grouped.h]).not.toEqual([380, 520]);
  });

  test('click, type, drag, reload, Alt+1, F1 and Escape never undo the grouped size', () => {
    const { result: selection } = renderHook(() => useWindowSelection());
    const { result: hotkeys } = renderHook(() => useGroupHotkeys({ workspaceId: 'ws-157' }));

    act(() => { selection.current.onSelect('a', {}); });
    expect(useWorkspaceStore.getState().activeId).toBe('a');
    expectStillGrouped('click');

    act(() => { useWorkspaceStore.getState().onUpdate('a', { msgs: [{ from: 'me', text: 'hi' }] }); });
    act(() => { useWorkspaceStore.getState().onUpdate('a', { msgs: [{ from: 'me', text: 'hi' }, { from: 'ai', text: 'hello' }] }); });
    expectStillGrouped('type');

    const before = chatA();
    act(() => {
      useWorkspaceStore.getState().moveGroup(groupId, 20, 10, true);
      useWorkspaceStore.getState().moveGroup(groupId, 140, 90, false);
    });
    expect([chatA().x, chatA().y]).toEqual([before.x + 140, before.y + 90]);
    expectStillGrouped('drag');

    act(() => { reloadBoard(); });
    expectStillGrouped('reload');

    act(() => { selection.current.onSelect('a', {}); });
    expectStillGrouped('click after reload');

    const bind = press({ code: 'Digit1', key: '1', altKey: true });
    expect(bind.defaultPrevented).toBe(true);
    expect(hotkeys.current.bindings).toEqual({ 1: groupId });
    expectStillGrouped('Alt+1');

    const jump = press({ code: 'F1', key: 'F1' });
    expect(jump.defaultPrevented).toBe(true);
    expect(useWorkspaceStore.getState().groupFocus).toMatchObject({ groupId });
    expectStillGrouped('F1');

    act(() => { useWorkspaceStore.getState().onUpdate('a', { msgs: [{ from: 'me', text: 'while focused' }] }); });
    expectStillGrouped('type while focused');

    const leave = press({ key: 'Escape', code: 'Escape' });
    expect(leave.defaultPrevented).toBe(true);
    expect(useWorkspaceStore.getState().groupFocus).toBeNull();
    expectStillGrouped('Escape');

    act(() => { selection.current.onSelect('a', {}); });
    act(() => { useWorkspaceStore.getState().onUpdate('a', { fontScale: 1.1 }); });
    expectStillGrouped('click and type after Escape');
  });
});
