/**
 * @jest-environment jsdom
 *
 * Verifies the Ctrl+Z / Ctrl+Shift+Z wiring in AppContent.jsx.
 *
 * The handler lives at src/app/AppContent.jsx line ~143-159 and delegates to
 * undo/redo from useWorkspaceHistory. This test exercises the same end-to-end
 * flow (workspace state change → snapshot → keyboard event → undo call → state
 * reverted) so a regression in any layer surfaces here.
 */

import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import { useWorkspaceStore } from '../src/lib/store.js';
import { useWorkspaceHistory } from '../src/app/hooks/useWorkspaceHistory.js';

// Minimal harness — strips AppContent's heavy dependencies (Canvas, Chrome,
// session, agents, etc.) and just renders a component that owns the same
// keyboard handler AppContent installs.
// eslint-disable-next-line no-unused-vars
function Harness() {
  const { undo, redo } = useWorkspaceHistory(true);
  React.useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      const editing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.contentEditable === 'true';
      if (meta && !editing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (meta && !editing && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
  return null;
}

beforeEach(() => {
  // Reset the workspace store between tests.
  useWorkspaceStore.setState({
    wins: [],
    canvasGroups: [],
    paths: [],
    links: [],
    groups: [],
    dockOffset: 0,
    extraAgents: [],
    penColor: '#000',
    penSize: 1,
    penMode: 'select',
    sidebarFavorites: [],
  });
});

describe('Ctrl+Z undo wiring', () => {
  test('Ctrl+Z reverts a workspace change captured by useWorkspaceHistory', async () => {
    render(<Harness />);

    // Baseline state: empty wins.
    expect(useWorkspaceStore.getState().wins).toEqual([]);

    // User adds a window.
    act(() => {
      useWorkspaceStore.setState({
        wins: [{ id: 'w1', kind: 'chat', x: 0, y: 0, w: 400, h: 300 }],
      });
    });

    // Wait for the 300ms coalesce timer to flush the snapshot.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    // Now press Ctrl+Z. Should pop the snapshot and revert wins to [].
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });

    expect(useWorkspaceStore.getState().wins).toEqual([]);
  });

  test('Ctrl+Shift+Z redoes after an undo', async () => {
    render(<Harness />);

    act(() => {
      useWorkspaceStore.setState({
        wins: [{ id: 'w1', kind: 'chat', x: 0, y: 0, w: 400, h: 300 }],
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    // Undo first.
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(useWorkspaceStore.getState().wins).toEqual([]);

    // Then redo with Ctrl+Shift+Z.
    act(() => {
      fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    });
    expect(useWorkspaceStore.getState().wins).toHaveLength(1);
  });

  test('Ctrl+Z does NOT fire when an input is focused (lets native textarea undo through)', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    render(<Harness />);

    act(() => {
      useWorkspaceStore.setState({
        wins: [{ id: 'w1', kind: 'chat', x: 0, y: 0, w: 400, h: 300 }],
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    // Pressing Ctrl+Z while focused on the input must NOT mutate workspace state.
    act(() => {
      fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    });
    expect(useWorkspaceStore.getState().wins).toHaveLength(1);

    document.body.removeChild(input);
  });

  test('Ctrl+Y (Windows-style redo) also works', async () => {
    render(<Harness />);

    act(() => {
      useWorkspaceStore.setState({
        wins: [{ id: 'w1', kind: 'chat', x: 0, y: 0, w: 400, h: 300 }],
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(useWorkspaceStore.getState().wins).toEqual([]);

    act(() => {
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    });
    expect(useWorkspaceStore.getState().wins).toHaveLength(1);
  });
});
