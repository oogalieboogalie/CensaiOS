/** @jest-environment jsdom */
// The shared board says when the server has every board edit this tab made:
// the board arriving from the server is not an edit, an edit made before the
// first sync waits for it, and the server confirming every update (no
// unsynced changes left) means saved.
import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { createStore } from 'zustand/vanilla';
import { writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const providers = [];
class StandinProvider {
  constructor(config) {
    this.config = config;
    this.unsyncedChanges = 0;
    this.awareness = { on() {}, off() {}, getStates: () => new Map() };
    providers.push(this);
  }

  get hasUnsyncedChanges() { return this.unsyncedChanges > 0; }

  // The server confirming updates, down to `left` still waiting.
  confirm(left) {
    this.unsyncedChanges = left;
    this.config.onUnsyncedChanges?.({ number: left });
  }

  destroy() {}
}
jest.unstable_mockModule('@hocuspocus/provider', () => ({ HocuspocusProvider: StandinProvider }));
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logToApp: () => {}, logFailure: () => {} }));

const { useYjsCanvas } = await import('../src/app/hooks/useYjsCanvas.js');

const win = (id) => ({ id, kind: 'chat', title: id, x: 0, y: 0, w: 320, h: 240 });
const emptyBoard = () => createStore(() => ({ wins: [], canvasGroups: [], paths: [], links: [], dock: {} }));

function openBoard(store) {
  const hook = renderHook(() => useYjsCanvas({ enabled: true, workspaceId: 'ws-1', store }));
  const provider = providers.at(-1);
  return { hook, provider, doc: provider.config.document, saves: () => hook.result.current.boardSaves };
}

// What the server already holds, arriving on the first sync.
function serverHas(doc, wins) {
  const server = new Y.Doc();
  writeStateToDoc(server, null, { wins, canvasGroups: [], paths: [], links: [], dock: {} }, 'server');
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(server), 'server');
}

describe('useYjsCanvas board saves', () => {
  beforeEach(() => { providers.length = 0; });

  test('the board arriving from the server on the first sync is not an unsaved edit', () => {
    const store = emptyBoard();
    const { provider, doc, saves } = openBoard(store);
    serverHas(doc, [win('from-server')]);
    act(() => provider.config.onSynced());
    expect(store.getState().wins.map((w) => w.id)).toEqual(['from-server']);
    expect(saves().unsaved).toBe(false);
  });

  test('an edit on the live board is unsaved until the server confirms it', () => {
    const store = emptyBoard();
    const { provider, doc, saves } = openBoard(store);
    serverHas(doc, [win('from-server')]);
    act(() => provider.config.onSynced());
    const saved = jest.fn();
    saves().onSaved(saved);

    act(() => store.setState({ wins: [...store.getState().wins, win('mine')] }));
    expect(saves().unsaved).toBe(true);
    provider.confirm(1);
    expect(saves().unsaved).toBe(true);
    provider.confirm(0);
    expect(saves().unsaved).toBe(false);
    expect(saved).toHaveBeenCalledTimes(1);
  });

  test('an edit made before the first sync stays unsaved until the sync sends it and the server confirms', () => {
    const store = emptyBoard();
    const { provider, doc, saves } = openBoard(store);
    act(() => store.setState({ wins: [win('made-early')] }));
    expect(saves().unsaved).toBe(true);
    // The server confirming its own handshake before the first sync does not count.
    provider.confirm(0);
    expect(saves().unsaved).toBe(true);

    serverHas(doc, [win('from-server')]);
    provider.unsyncedChanges = 1;
    act(() => provider.config.onSynced());
    expect(store.getState().wins.map((w) => w.id).sort()).toEqual(['from-server', 'made-early']);
    expect(saves().unsaved).toBe(true);
    provider.confirm(0);
    expect(saves().unsaved).toBe(false);
  });

  test('with nothing left unconfirmed at the first sync, the board counts as saved at once', () => {
    const store = emptyBoard();
    const { provider, saves } = openBoard(store);
    act(() => store.setState({ wins: [win('made-early')] }));
    act(() => store.setState({ wins: [] }));
    act(() => provider.config.onSynced());
    expect(saves().unsaved).toBe(false);
  });
});
