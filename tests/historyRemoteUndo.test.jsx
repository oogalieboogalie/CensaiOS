/**
 * @jest-environment jsdom
 *
 * Multiplayer-safe undo: entries captured before a remote commit must merge
 * around it instead of resurrecting stale remote objects (which would also
 * 409 the next autosave against the advanced revision).
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useWorkspaceStore } from '../src/lib/store.js';
import { useWorkspaceHistory } from '../src/app/hooks/useWorkspaceHistory.js';
import { notifyRemoteHistory } from '../src/lib/workspace/historyMerge.js';

function Harness({ controls }) {
  const { undo, redo } = useWorkspaceHistory(true);
  controls.undo = undo;
  controls.redo = redo;
  return null;
}

const BASE = {
  wins: [],
  canvasGroups: [],
  paths: [],
  links: [],
  groups: [],
  dockOffset: 0,
  extraAgents: [],
  penColor: '#000',
  penSize: 1,
  penMode: false,
  sidebarFavorites: [],
};

const snap = (overrides = {}) => ({ ...BASE, ...overrides });
const win = (id, x = 0) => ({ id, kind: 'chat', x, y: 0, w: 400, h: 300 });

beforeEach(() => {
  useWorkspaceStore.setState({ ...BASE });
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

// Mirror onAuthoritativeCommit: apply the remote snapshot, then tell history
// it is the new baseline — not an undo step.
function applyRemote(snapshot) {
  act(() => {
    useWorkspaceStore.setState({ ...snapshot });
    notifyRemoteHistory(snapshot);
  });
}

function setup() {
  const controls = {};
  render(<Harness controls={controls} />);
  return controls;
}

describe('multiplayer-safe undo', () => {
  test('undo drops my window but keeps the remotely added one', async () => {
    const controls = setup();
    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A')] })); });
    await flush();

    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A'), win('B')] })); });
    await flush();

    applyRemote(snap({ wins: [win('A'), win('C')], penColor: '#fff' }));

    act(() => { expect(controls.undo()).toBe(true); });
    expect(useWorkspaceStore.getState().wins.map((w) => w.id)).toEqual(['A', 'C']);
    // Untouched-by-me scalar keeps the remote value too.
    expect(useWorkspaceStore.getState().penColor).toBe('#fff');
  });

  test('a remotely edited object keeps the remote version on undo', async () => {
    const controls = setup();
    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A')] })); });
    await flush();

    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A', 10)] })); });
    await flush();

    applyRemote(snap({ wins: [win('A', 99)] }));

    act(() => { controls.undo(); });
    expect(useWorkspaceStore.getState().wins).toEqual([win('A', 99)]);
  });

  test('my delete of an untouched object restores while remote edits hold', async () => {
    const controls = setup();
    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A'), win('B')] })); });
    await flush();

    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A')] })); });
    await flush();

    applyRemote(snap({ wins: [win('A', 50), win('B')] }));

    act(() => { controls.undo(); });
    const wins = useWorkspaceStore.getState().wins;
    expect(wins.map((w) => w.id).sort()).toEqual(['A', 'B']);
    expect(wins.find((w) => w.id === 'A').x).toBe(50);
  });

  test('redo still works after a merged undo', async () => {
    const controls = setup();
    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A')] })); });
    await flush();

    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A'), win('B')] })); });
    await flush();

    applyRemote(snap({ wins: [win('A'), win('C')] }));

    act(() => { controls.undo(); });
    expect(useWorkspaceStore.getState().wins.map((w) => w.id)).toEqual(['A', 'C']);
    act(() => { expect(controls.redo()).toBe(true); });
    expect(useWorkspaceStore.getState().wins.map((w) => w.id)).toEqual(['A', 'C']);
  });

  test('objects the remote snapshot vouches for survive undo (ties go remote)', async () => {
    const controls = setup();
    act(() => { useWorkspaceStore.setState(snap({ wins: [win('A')] })); });
    await flush();

    applyRemote(snap({ wins: [win('A'), win('C')] }));

    // Undoing the local add of A would drop it, but the remote snapshot
    // contains A too — indistinguishable from a remote add, so it stays.
    act(() => { controls.undo(); });
    expect(useWorkspaceStore.getState().wins.map((w) => w.id)).toEqual(['A', 'C']);
  });
});
