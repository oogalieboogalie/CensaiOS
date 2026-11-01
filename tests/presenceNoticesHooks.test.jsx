/** @jest-environment jsdom */
// Where the "joined" pop-ups get their people from: the shared doc reports
// who it sees while it has synced on its connection and nothing while it is
// disconnected, the socket reports its lists and nothing while it is closed,
// and the pop-ups hook turns the two into one notice per person.
import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';

const providers = [];
class StandinProvider {
  constructor(config) {
    this.config = config;
    this.awareness = { on() {}, off() {}, getStates: () => new Map() };
    providers.push(this);
  }

  get hasUnsyncedChanges() { return false; }

  destroy() {}
}
jest.unstable_mockModule('@hocuspocus/provider', () => ({ HocuspocusProvider: StandinProvider }));
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logToApp: () => {}, logFailure: () => {} }));

const { useYjsCanvas } = await import('../src/app/hooks/useYjsCanvas.js');
const { useAwarenessPresence } = await import('../src/app/hooks/useAwarenessPresence.js');
const { useWorkspaceCollaboration } = await import('../src/app/hooks/useWorkspaceCollaboration.js');
const { usePresenceNotices } = await import('../src/app/hooks/usePresenceNotices.js');
const { LEAVE_GRACE_MS } = await import('../src/lib/collaboration/presenceNotices.js');
const { createStore } = await import('zustand/vanilla');

const PAT = { id: '1', name: 'Pat Example' };
const human = (id, name, clientId) => ({ clientId, actor: { type: 'human', id, label: name } });

/** A stand-in for the doc's awareness: states by client id, and its change listeners. */
function standinAwareness(selfClientId = 1) {
  const listeners = new Set();
  const states = new Map([[selfClientId, { user: { id: PAT.id, name: PAT.name } }]]);
  return {
    clientID: selfClientId,
    states,
    getStates: () => states,
    on: (_event, fn) => listeners.add(fn),
    off: (_event, fn) => listeners.delete(fn),
    setLocalStateField() {},
    getLocalState: () => states.get(selfClientId),
    change(origin) { for (const fn of [...listeners]) fn({ added: [], updated: [], removed: [] }, origin); },
  };
}

describe('the shared doc says who is here only while it has synced', () => {
  beforeEach(() => { providers.length = 0; });

  test('presence stays put across a disconnect, and is complete only after each sync', () => {
    const store = createStore(() => ({ wins: [], canvasGroups: [], paths: [], links: [], dock: {} }));
    const hook = renderHook(() => useYjsCanvas({ enabled: true, workspaceId: 'ws-1', store }));
    const provider = providers.at(-1);
    expect(hook.result.current).toMatchObject({ awareness: null, presenceLive: false });
    act(() => provider.config.onSynced());
    expect(hook.result.current).toMatchObject({ awareness: provider.awareness, presenceLive: true });
    // Offline: this tab keeps its own presence (typing and drags still clear),
    // but the list of others is not complete any more.
    act(() => provider.config.onDisconnect());
    expect(hook.result.current).toMatchObject({ awareness: provider.awareness, presenceLive: false });
    act(() => provider.config.onConnect());
    expect(hook.result.current.presenceLive).toBe(false);
    act(() => provider.config.onSynced());
    expect(hook.result.current.presenceLive).toBe(true);
    hook.unmount();
  });

  test('the doc presence reports the others while live, and null while it is not', () => {
    const awareness = standinAwareness();
    const onPeople = jest.fn();
    const { rerender } = renderHook(({ live }) => useAwarenessPresence({ awareness, live, user: PAT, selectedIds: [], onPeople }), {
      initialProps: { live: true },
    });
    expect(onPeople).toHaveBeenLastCalledWith([]);
    awareness.states.set(2, { user: { id: '2', name: 'Sam Example' } });
    act(() => awareness.change());
    const samOnly = [expect.objectContaining({ actor: expect.objectContaining({ id: '2', label: 'Sam Example' }) })];
    expect(onPeople).toHaveBeenLastCalledWith(samOnly);
    rerender({ live: false });
    expect(onPeople).toHaveBeenLastCalledWith(null);
    // Changes while offline are not reported; the next sync reports the whole list.
    onPeople.mockClear();
    awareness.states.set(3, { user: { id: '3', name: 'Lee Example' } });
    act(() => awareness.change());
    expect(onPeople).not.toHaveBeenCalled();
    rerender({ live: true });
    expect(onPeople).toHaveBeenLastCalledWith([expect.anything(), expect.anything()]);
  });

  test('the provider dropping everyone as its connection closes is not reported as people leaving', () => {
    const awareness = standinAwareness();
    const onPeople = jest.fn();
    renderHook(() => useAwarenessPresence({ awareness, live: true, user: PAT, selectedIds: [], onPeople }));
    awareness.states.set(2, { user: { id: '2', name: 'Sam Example' } });
    act(() => awareness.change({ synced: true }));
    expect(onPeople).toHaveBeenLastCalledWith([expect.anything()]);
    onPeople.mockClear();
    // The provider marks itself not synced, then removes everyone else.
    awareness.states.delete(2);
    act(() => awareness.change({ synced: false }));
    expect(onPeople).not.toHaveBeenCalled();
    // Someone timing out while connected is a real departure.
    awareness.states.set(2, { user: { id: '2', name: 'Sam Example' } });
    act(() => awareness.change({ synced: true }));
    awareness.states.delete(2);
    act(() => awareness.change('timeout'));
    expect(onPeople).toHaveBeenLastCalledWith([]);
  });
});

describe('the socket says who is here only while it is connected', () => {
  class MockSocket {
    static instances = [];
    constructor() { this.handlers = {}; MockSocket.instances.push(this); }
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
    emit(type, event) { (this.handlers[type] || []).forEach((fn) => fn(event)); }
    message(body) { this.emit('message', { data: JSON.stringify(body) }); }
    send() {}
    close() { this.emit('close', {}); }
  }

  beforeEach(() => { MockSocket.instances = []; global.WebSocket = MockSocket; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); delete global.WebSocket; });

  test('ready and every snapshot report the list; a close and leaving the board report null', () => {
    const onPeople = jest.fn();
    const props = { enabled: true, workspaceId: 'ws-1', wins: [], revision: 0, onAuthoritativeCommit: () => {}, activeId: null, onPeople };
    const hook = renderHook(() => useWorkspaceCollaboration(props));
    const socket = MockSocket.instances.at(-1);
    const pat = human('1', 'Pat Example', 'c1');
    const sam = human('2', 'Sam Example', 'c2');
    act(() => socket.message({ type: 'collaboration.ready', participants: [pat], actor: pat.actor }));
    expect(onPeople).toHaveBeenLastCalledWith([pat]);
    act(() => socket.message({ type: 'presence.snapshot', participants: [pat, sam] }));
    expect(onPeople).toHaveBeenLastCalledWith([pat, sam]);
    act(() => socket.emit('close', {}));
    expect(onPeople).toHaveBeenLastCalledWith(null);
    expect(hook.result.current.notices).toEqual([]);
    onPeople.mockClear();
    hook.unmount();
    expect(onPeople).toHaveBeenCalledWith(null);
  });
});

describe('the pop-ups hook', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('one "joined" for Sam seen on both channels, and one "left" after the grace time', () => {
    const { result } = renderHook(() => usePresenceNotices('1'));
    const pat = human('1', 'Pat Example', 'c1');
    const sam = human('2', 'Sam Example', 'c2');
    act(() => { result.current.seeSocket([pat]); result.current.seeDoc([]); });
    act(() => { result.current.seeSocket([pat, sam]); result.current.seeDoc([sam]); });
    expect(result.current.notices.map((n) => n.text)).toEqual(['Sam Example joined the canvas']);

    act(() => { result.current.seeSocket([pat]); result.current.seeDoc([]); });
    act(() => { jest.advanceTimersByTime(LEAVE_GRACE_MS - 1); });
    expect(result.current.notices).toHaveLength(1);
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.notices.map((n) => n.text)).toEqual(['Sam Example joined the canvas', 'Sam Example left']);
  });
});
