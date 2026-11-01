/** @jest-environment jsdom */
// The browser's draft of a board is a copy of what the server does not have
// yet, so a draft found on the next load always means real unsaved work and
// a plain reload never offers one.
import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import { createBoardSaves } from '../src/lib/collaboration/boardSaves.js';

const persistWorkspaceWithPrewarm = jest.fn();
const writeWorkspaceDraft = jest.fn();
const clearWorkspaceDraft = jest.fn();
const saveWorkspace = jest.fn();

jest.unstable_mockModule('../src/lib/projectPrewarm.js', () => ({
  persistWorkspaceWithPrewarm,
  deriveCanvasProjectMemberships: ({ wins = [] } = {}) => wins.filter((w) => w.agentId).map((w) => w.agentId),
}));
jest.unstable_mockModule('../src/lib/api/workspaceAuthority.js', () => ({
  clearWorkspaceDraft, writeWorkspaceDraft,
}));
jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { downloadWorkspaceSnapshot: jest.fn(), fetchWorkspaceRevision: jest.fn(), saveWorkspace },
}));

const { useWorkspacePersistence } = await import('../src/app/hooks/useWorkspacePersistence.js');

const board = (wins, penColor = 'red') => ({ workspaceId: 'ws-1', penColor, wins });
const chat = { id: 'chat-1', kind: 'chat', agentId: 'agent-1' };

function sharedBoard(initial, { boardSaves = createBoardSaves(), holdDraft = false } = {}) {
  const onRevision = jest.fn();
  const hook = renderHook(
    ({ workspace, canvasLive, hold }) => useWorkspacePersistence({
      enabled: true, workspace, revision: 1, onRevision,
      canvasSource: 'yjs', canvasLive, boardSaves, holdDraft: hold,
    }),
    { initialProps: { workspace: initial, canvasLive: false, hold: holdDraft } },
  );
  return { ...hook, boardSaves };
}

const settle = () => act(async () => { jest.advanceTimersByTime(1500); await Promise.resolve(); await Promise.resolve(); });

describe('the unsaved-changes draft of a shared board', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    writeWorkspaceDraft.mockReturnValue(true);
    persistWorkspaceWithPrewarm.mockResolvedValue({ revision: 2 });
    saveWorkspace.mockResolvedValue({ revision: 2 });
  });
  afterEach(() => jest.useRealTimers());

  test('the board arriving from the shared doc while it connects is not drafted (a plain reload)', async () => {
    const { rerender } = sharedBoard(board([]));
    rerender({ workspace: board([{ id: 'from-the-server' }]), canvasLive: false, hold: false });
    rerender({ workspace: board([{ id: 'from-the-server' }]), canvasLive: true, hold: false });
    await settle();
    expect(writeWorkspaceDraft).not.toHaveBeenCalled();
    expect(persistWorkspaceWithPrewarm).not.toHaveBeenCalled();
  });

  test('board edits made while the shared doc is away are drafted, and the draft goes once the doc has them', async () => {
    const { rerender, boardSaves } = sharedBoard(board([]));
    boardSaves.edited();
    rerender({ workspace: board([{ id: 'made-offline' }]), canvasLive: false, hold: false });
    expect(writeWorkspaceDraft).toHaveBeenCalledWith(board([{ id: 'made-offline' }]), 1, { board: true });

    // Back online: the doc sends them; the draft stays until the server confirms.
    rerender({ workspace: board([{ id: 'made-offline' }]), canvasLive: true, hold: false });
    await settle();
    expect(clearWorkspaceDraft).not.toHaveBeenCalled();
    act(() => boardSaves.saved());
    expect(clearWorkspaceDraft).toHaveBeenCalledWith('ws-1');
  });

  test('a settings change is drafted and its draft goes after the save, but not while board edits are unconfirmed', async () => {
    const { rerender, boardSaves } = sharedBoard(board([]));
    rerender({ workspace: board([]), canvasLive: true, hold: false });
    boardSaves.edited();
    rerender({ workspace: board([], 'blue'), canvasLive: true, hold: false });
    // Only the settings are unsaved: the live board edit is already on its way.
    expect(writeWorkspaceDraft).toHaveBeenCalledTimes(1);
    expect(writeWorkspaceDraft).toHaveBeenCalledWith(board([], 'blue'), 1, { board: false });
    await settle();
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(1);
    expect(clearWorkspaceDraft).not.toHaveBeenCalled();
    act(() => boardSaves.saved());
    expect(clearWorkspaceDraft).toHaveBeenCalledWith('ws-1');
  });

  test('a settings change whose save fails keeps its draft', async () => {
    persistWorkspaceWithPrewarm.mockRejectedValue(new Error('offline'));
    const { rerender, boardSaves } = sharedBoard(board([]));
    rerender({ workspace: board([], 'blue'), canvasLive: true, hold: false });
    await settle();
    act(() => { boardSaves.edited(); boardSaves.saved(); });
    expect(writeWorkspaceDraft).toHaveBeenCalledTimes(1);
    expect(clearWorkspaceDraft).not.toHaveBeenCalled();
  });

  test('opening or closing a window with an agent is saved for the project but never drafted: the doc has the board', async () => {
    const { rerender, boardSaves } = sharedBoard(board([]));
    rerender({ workspace: board([]), canvasLive: true, hold: false });
    boardSaves.edited();
    rerender({ workspace: board([chat]), canvasLive: true, hold: false });
    await settle();
    act(() => boardSaves.saved());
    boardSaves.edited();
    rerender({ workspace: board([]), canvasLive: true, hold: false });
    await settle();
    act(() => boardSaves.saved());
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(2);
    expect(writeWorkspaceDraft).not.toHaveBeenCalled();
  });

  test('the draft stays a board draft until the edits made while the doc was away are confirmed', async () => {
    const { rerender, boardSaves } = sharedBoard(board([]));
    boardSaves.edited();
    rerender({ workspace: board([{ id: 'made-offline' }]), canvasLive: false, hold: false });
    rerender({ workspace: board([{ id: 'made-offline' }], 'blue'), canvasLive: true, hold: false });
    expect(writeWorkspaceDraft).toHaveBeenLastCalledWith(board([{ id: 'made-offline' }], 'blue'), 1, { board: true });
    act(() => boardSaves.saved());
    rerender({ workspace: board([{ id: 'made-offline' }], 'green'), canvasLive: true, hold: false });
    expect(writeWorkspaceDraft).toHaveBeenLastCalledWith(board([{ id: 'made-offline' }], 'green'), 1, { board: false });
  });

  test('leaving the page before a settings change was sent sends it with the page, and nothing once it is saved', async () => {
    const { rerender } = sharedBoard(board([]));
    rerender({ workspace: board([], 'blue'), canvasLive: true, hold: false });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(saveWorkspace).toHaveBeenCalledWith(board([], 'blue'), 1, { canvasSource: 'yjs', keepalive: true });
    await settle();
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
  });

  test('leaving the page while the doc is away sends nothing: the draft keeps it', () => {
    const { rerender, boardSaves } = sharedBoard(board([]));
    boardSaves.edited();
    rerender({ workspace: board([{ id: 'made-offline' }], 'blue'), canvasLive: false, hold: false });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(saveWorkspace).not.toHaveBeenCalled();
    expect(writeWorkspaceDraft).toHaveBeenCalledTimes(1);
  });

  test('while a draft from an earlier visit is offered back, it is neither replaced nor cleared', async () => {
    const { rerender, boardSaves } = sharedBoard(board([]), { holdDraft: true });
    boardSaves.edited();
    rerender({ workspace: board([{ id: 'new' }], 'blue'), canvasLive: false, hold: true });
    rerender({ workspace: board([{ id: 'new' }], 'blue'), canvasLive: true, hold: true });
    await settle();
    act(() => boardSaves.saved());
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(1);
    expect(writeWorkspaceDraft).not.toHaveBeenCalled();
    expect(clearWorkspaceDraft).not.toHaveBeenCalled();
  });
});

describe('the shared doc tells the draft when the server has every board edit', () => {
  test('saved() tells the listeners once per round of edits, and not when nothing was edited', () => {
    const saves = createBoardSaves();
    const listener = jest.fn();
    const stop = saves.onSaved(listener);
    saves.saved();
    expect(listener).not.toHaveBeenCalled();
    saves.edited();
    expect(saves.unsaved).toBe(true);
    saves.saved();
    saves.saved();
    expect(saves.unsaved).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    saves.edited();
    saves.saved();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
