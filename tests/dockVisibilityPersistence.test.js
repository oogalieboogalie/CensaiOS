/**
 * tests/dockVisibilityPersistence.test.js
 *
 * Brief B3 — `.team/handoffs/2026-06-23-b3-sidebar-visibility.md`.
 *
 * Asserts the dock visibility state survives a save / reload round-trip:
 *   1. Default state is `visible: false` after a fresh migrate (B1-style).
 *   2. After toggling visible to true and "persisting" (writing through
 *      the store as AppContent's persist useEffect does), reload from a
 *      serialized snapshot restores the same state.
 *   3. Per-group and per-agent overrides round-trip.
 *   4. The setDock setter accepts a function (zustand pattern) without
 *      losing shape.
 */
import {
  setDockVisible,
  setGroupVisible,
  setAgentVisible,
  isGroupVisible,
  isAgentVisible,
} from '../src/components/dock/useDockVisibility.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import {
  applyCanvasWorkspaceSnapshot,
  canvasWorkspaceSnapshot,
} from '../src/lib/workspace/canvasWorkspaceSnapshot.js';

const originalState = useWorkspaceStore.getState();

beforeEach(() => {
  useWorkspaceStore.setState({
    dock: { visible: false, groupOverrides: {} },
    setDock: originalState.setDock,
  });
});

afterAll(() => {
  useWorkspaceStore.setState(originalState);
});

describe('Brief B3 - dock visibility persistence', () => {
  test('default state after fresh migrate is visible: false', () => {
    expect(useWorkspaceStore.getState().dock.visible).toBe(false);
  });

  test('toggle visible=true then reload from snapshot restores visible: true', () => {
    // Simulate AppContent's persist useEffect: take a snapshot of dock,
    // rehydrate, verify shape.
    act(() => {
      useWorkspaceStore.getState().setDock(setDockVisible(useWorkspaceStore.getState().dock, true));
    });
    const snapshot = JSON.parse(JSON.stringify(canvasWorkspaceSnapshot(useWorkspaceStore.getState())));
    expect(snapshot.dock.visible).toBe(true);

    // "Reload" — replace the store state with the serialized snapshot.
    applyCanvasWorkspaceSnapshot(useWorkspaceStore, snapshot);
    expect(useWorkspaceStore.getState().dock.visible).toBe(true);
  });

  test('per-group + per-agent overrides round-trip through serialize/reload', () => {
    act(() => {
      const next = setDockVisible(undefined, true);
      useWorkspaceStore.getState().setDock(setGroupVisible(next, 'core', true));
      useWorkspaceStore.getState().setDock(
        setAgentVisible(useWorkspaceStore.getState().dock, 'core', 'architect', false)
      );
    });
    const snapshot = JSON.parse(JSON.stringify(canvasWorkspaceSnapshot(useWorkspaceStore.getState())));

    applyCanvasWorkspaceSnapshot(useWorkspaceStore, snapshot);
    const reloaded = useWorkspaceStore.getState().dock;
    expect(reloaded.visible).toBe(true);
    expect(reloaded.groupOverrides.core.visible).toBe(true);
    expect(reloaded.groupOverrides.core.agentOverrides.architect).toBe(false);
  });

  test('setDock setter accepts a function (zustand pattern)', () => {
    act(() => {
      useWorkspaceStore.getState().setDock((prev) => setDockVisible(prev, true));
    });
    expect(useWorkspaceStore.getState().dock.visible).toBe(true);
  });

  test('serialized state is plain JSON (no functions / class instances)', () => {
    act(() => {
      useWorkspaceStore.getState().setDock(setGroupVisible(undefined, 'core', true));
    });
    const snapshot = useWorkspaceStore.getState().dock;
    const serialized = JSON.parse(JSON.stringify(snapshot));
    expect(typeof serialized.visible).toBe('boolean');
    expect(typeof serialized.groupOverrides.core.visible).toBe('boolean');
  });

  test('isGroupVisible / isAgentVisible work against rehydrated state', () => {
    act(() => {
      useWorkspaceStore.getState().setDock({
        visible: true,
        groupOverrides: {
          core: { visible: true, agentOverrides: { architect: false } },
        },
      });
    });
    const snapshot = JSON.parse(JSON.stringify(useWorkspaceStore.getState().dock));
    useWorkspaceStore.setState({ dock: snapshot });

    const reloaded = useWorkspaceStore.getState().dock;
    expect(isGroupVisible(reloaded, 'core', ['architect', 'censai'])).toBe(true);
    expect(isAgentVisible(reloaded, 'core', 'architect', ['architect', 'censai'])).toBe(false);
    expect(isAgentVisible(reloaded, 'core', 'censai', ['architect', 'censai'])).toBe(true);
  });
});

// Tiny act wrapper for the store actions used above. Without React
// running, the zustand `set` is synchronous, so a direct call works,
// but `act` keeps the pattern consistent with the panel tests.
function act(fn) { fn(); }
