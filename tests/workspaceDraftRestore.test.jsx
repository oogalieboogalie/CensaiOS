/** @jest-environment jsdom */
// Restore puts back what did not reach the server: a draft of settings alone
// leaves the board as everyone has it now, while a draft that kept board
// edits made away from the shared board puts those back too.
import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';

const clearWorkspaceDraft = jest.fn();
jest.unstable_mockModule('../src/lib/api/workspaceAuthority.js', () => ({ clearWorkspaceDraft }));
jest.unstable_mockModule('../src/lib/api.js', () => ({ api: { downloadWorkspaceSnapshot: jest.fn() } }));

const { useWorkspaceDraft } = await import('../src/app/hooks/useWorkspaceDraft.js');

const SETTERS = ['setWindowAllowList', 'setWins', 'setCanvasGroups', 'setPaths', 'setLinks', 'setPenColor', 'setPenSize',
  'setPenMode', 'setDockOffset', 'setDock', 'setGroups', 'setFocusMode', 'setExtraAgents', 'setSidebarFavorites'];

function offered(draft) {
  const setters = Object.fromEntries(SETTERS.map((name) => [name, jest.fn()]));
  const workspaceLoad = { status: 'draft_required', workspaceId: 'ws-1', draft };
  const { result } = renderHook(() => useWorkspaceDraft({ workspaceLoad, windowAllowList: { todos: true }, ...setters }));
  return { result, setters };
}

const value = {
  workspaceId: 'ws-1',
  wins: [{ id: 'old-window', kind: 'todos', x: 0, y: 0, w: 300, h: 300 }],
  dock: { visible: true, groupOverrides: {} },
  penColor: 'var(--canvas-pen-blue)',
};

describe('restoring an unsaved draft', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a draft of settings alone puts the settings back and leaves the board alone', () => {
    const { result, setters } = offered({ value, board: false });
    act(() => result.current.restoreDraft());
    expect(setters.setPenColor).toHaveBeenCalledWith('var(--canvas-pen-blue)');
    for (const name of ['setWins', 'setCanvasGroups', 'setPaths', 'setLinks', 'setDock']) expect(setters[name]).not.toHaveBeenCalled();
    expect(clearWorkspaceDraft).toHaveBeenCalledWith('ws-1');
    expect(result.current.pendingDraft).toBeNull();
  });

  test('a draft with board edits puts the board back as well', () => {
    const { result, setters } = offered({ value, board: true });
    act(() => result.current.restoreDraft());
    expect(setters.setWins).toHaveBeenCalledWith([expect.objectContaining({ id: 'old-window' })]);
    expect(setters.setDock).toHaveBeenCalledWith({ visible: true, groupOverrides: {} });
    expect(setters.setPenColor).toHaveBeenCalledWith('var(--canvas-pen-blue)');
  });
});
