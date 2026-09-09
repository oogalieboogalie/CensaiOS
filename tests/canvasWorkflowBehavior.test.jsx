/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useWorkspaceHistory } from '../src/app/hooks/useWorkspaceHistory.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { shouldStartCanvasPan } from '../src/components/canvas/useCanvasPointer.js';

function HistoryHarness() {
  const wins = useWorkspaceStore((state) => state.wins);
  const { undo, redo } = useWorkspaceHistory(true);
  return (
    <div>
      <span data-testid="count">{wins.length}</span>
      <button onClick={() => useWorkspaceStore.setState({ wins: [{ id: 'one' }] })}>Add</button>
      <button onClick={undo}>Undo</button>
      <button onClick={redo}>Redo</button>
    </div>
  );
}

describe('canvas workflow behavior', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ wins: [], links: [], selectedIds: [], activeId: null });
  });

  test('coalesces a workspace change into Ctrl+Z-style undo and redo steps', () => {
    jest.useFakeTimers();
    render(<HistoryHarness />);

    fireEvent.click(screen.getByText('Add'));
    act(() => jest.advanceTimersByTime(350));
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    fireEvent.click(screen.getByText('Undo'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    fireEvent.click(screen.getByText('Redo'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    jest.useRealTimers();
  });

  test('deletes a multi-selection and its links as one store action', () => {
    useWorkspaceStore.setState({
      wins: [{ id: 'one' }, { id: 'two' }, { id: 'three' }],
      links: [{ id: 'link', fromId: 'one', toId: 'three' }],
      selectedIds: ['one', 'two'],
      activeId: 'two',
    });

    useWorkspaceStore.getState().deleteWindows(['one', 'two']);

    expect(useWorkspaceStore.getState()).toMatchObject({
      wins: [{ id: 'three' }],
      links: [],
      selectedIds: [],
      activeId: null,
    });
  });

  test('respects a Space-only pan preference for middle mouse input', () => {
    expect(shouldStartCanvasPan(1, false, 'space')).toBe(false);
    expect(shouldStartCanvasPan(1, false, 'both')).toBe(true);
    expect(shouldStartCanvasPan(0, true, 'space')).toBe(true);
    expect(shouldStartCanvasPan(0, true, 'alt')).toBe(true);
  });
});
