/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useGroupHotkeys } from '../src/app/hooks/useGroupHotkeys.js';
import { usePresentKeys } from '../src/app/present/usePresentKeys.js';
import { usePresentStore } from '../src/lib/presentStore.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { saveGroupHotkeys } from '../src/lib/groupHotkeys.js';

// Present mode keys: F-keys start or jump, arrows move, Escape puts the board
// back exactly as it was, and keys with no scene stay with the old handlers.
const press = (init, target = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(event); });
  return event;
};

describe('Present mode', () => {
  beforeEach(() => {
    localStorage.clear();
    saveGroupHotkeys('ws-1', { 1: 'g1', 2: 'g2', 7: 'g7' });
    useWorkspaceStore.setState({
      wins: [
        { id: 'a', groupId: 'g1', x: 10, y: 10, w: 100, h: 100 },
        { id: 'b', groupId: 'g2', x: 2010, y: 10, w: 100, h: 100 },
        { id: 'loose', groupId: null, x: 9000, y: 9000, w: 100, h: 100 },
      ],
      canvasGroups: [
        { id: 'g1', label: 'Look', x: 0, y: 0, w: 800, h: 600 },
        { id: 'g2', label: 'LeadHound', x: 2000, y: 0, w: 800, h: 600 },
        { id: 'g7', label: 'Seven', x: 4000, y: 0, w: 800, h: 600 },
      ],
      activeId: 'loose',
      selectedIds: ['loose'],
      pan: { x: -123, y: -45 },
      zoom: 0.7,
      groupFocus: null,
    });
    usePresentStore.setState({ presenting: false, sceneId: null, snapshot: null, editorOpen: false, emptyNotice: false, notesOpen: false });
    renderHook(() => { usePresentKeys('ws-1'); useGroupHotkeys({ workspaceId: 'ws-1' }); });
  });

  afterEach(() => act(() => { usePresentStore.getState().stop(); }));

  test('F2 starts presenting at that scene and hides the rest of the board', () => {
    const event = press({ key: 'F2', code: 'F2' });
    expect(event.defaultPrevented).toBe(true);
    const present = usePresentStore.getState();
    expect(present.presenting).toBe(true);
    expect(present.scenes.find((s) => s.id === present.sceneId).key).toBe('2');
    const ws = useWorkspaceStore.getState();
    expect(ws.groupFocus.groupId).toBe('g2');
    expect(ws.activeId).toBe('b');
    expect(ws.selectedIds).toEqual([]);
  });

  test('arrows walk only the scenes that show something, then Escape restores the board', () => {
    act(() => { usePresentStore.getState().start(); });
    expect(useWorkspaceStore.getState().groupFocus.groupId).toBe('g1');
    press({ key: 'ArrowRight' });
    expect(useWorkspaceStore.getState().groupFocus.groupId).toBe('g2');
    press({ key: 'ArrowRight' }); // F3..F6 have nothing bound: the run ends at F2
    expect(useWorkspaceStore.getState().groupFocus.groupId).toBe('g2');
    press({ key: 'PageUp' });
    expect(useWorkspaceStore.getState().groupFocus.groupId).toBe('g1');

    const esc = press({ key: 'Escape' });
    expect(esc.defaultPrevented).toBe(true);
    const ws = useWorkspaceStore.getState();
    expect(usePresentStore.getState().presenting).toBe(false);
    expect(ws.groupFocus).toBeNull();
    expect(ws.pan).toEqual({ x: -123, y: -45 });
    expect(ws.zoom).toBe(0.7);
    expect(ws.activeId).toBe('loose');
    expect(ws.selectedIds).toEqual(['loose']);
  });

  test('the same F-key again ends the run', () => {
    press({ key: 'F1' });
    expect(usePresentStore.getState().presenting).toBe(true);
    press({ key: 'F1' });
    expect(usePresentStore.getState().presenting).toBe(false);
    expect(useWorkspaceStore.getState().pan).toEqual({ x: -123, y: -45 });
  });

  test('an F-key with no scene keeps the plain group view', () => {
    press({ key: 'F7' });
    expect(usePresentStore.getState().presenting).toBe(false);
    expect(useWorkspaceStore.getState().groupFocus.groupId).toBe('g7');
  });

  test('arrow keys inside a text box stay with the text box', () => {
    press({ key: 'F1' });
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = press({ key: 'ArrowRight' }, input);
    expect(event.defaultPrevented).toBe(false);
    expect(useWorkspaceStore.getState().groupFocus.groupId).toBe('g1');
    input.remove();
  });

  test('a picked board area is shown with the whole board, and Present with nothing set says so', () => {
    act(() => {
      usePresentStore.getState().setScenes([{ id: 'x', key: '4', name: 'Wide', notes: '', area: { x: 0, y: 0, w: 4000, h: 1000 } }]);
    });
    press({ key: 'F4' });
    expect(usePresentStore.getState().presenting).toBe(true);
    expect(useWorkspaceStore.getState().groupFocus).toBeNull();
    act(() => { usePresentStore.getState().stop(); usePresentStore.getState().setScenes([]); });
    act(() => { usePresentStore.getState().start(); });
    expect(usePresentStore.getState().presenting).toBe(false);
    expect(usePresentStore.getState().emptyNotice).toBe(true);
  });

  test('an F-key pressed while typing leaves the box, so N opens the notes next', () => {
    const box = document.createElement('textarea');
    document.body.appendChild(box);
    box.focus();
    press({ key: 'F2', code: 'F2' }, box);
    expect(document.activeElement).not.toBe(box);
    press({ key: 'n' });
    expect(usePresentStore.getState().notesOpen).toBe(true);
    box.remove();
  });
});
