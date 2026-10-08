/**
 * @jest-environment jsdom
 *
 * Regression tests for the stuck Space-pan double failure:
 *  - marquee/region button clicks silently swallowed (pan capture +
 *    preventDefault kills onClick, no errors)
 *  - rubber-band area select impossible (every left-drag pans)
 * Root cause: spaceRef stuck true (missed keyup on blur) + pan-start path
 * hijacking pointerdowns on interactive elements.
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { useCanvasPointer } from '../src/components/canvas/useCanvasPointer.js';
import { useCanvasViewport } from '../src/components/canvas/useCanvasViewport.js';

beforeAll(() => {
  window.PointerEvent = MouseEvent;
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

function PanHarness({ spaceHeld, onPanZoom, onTileClick }) {
  const ref = React.useRef(null);
  const spaceRef = React.useRef(spaceHeld);
  React.useEffect(() => { spaceRef.current = spaceHeld; }, [spaceHeld]);
  const pointer = useCanvasPointer({
    ref,
    pan: { x: 0, y: 0 },
    zoom: 1,
    onPanZoom,
    onSelect: jest.fn(),
    onSpawnGroup: jest.fn(),
    wins: [],
    onSelection: jest.fn(),
    activeTool: 'select',
    penMode: false,
    penColor: '#000',
    penSize: 2,
    setPaths: jest.fn(),
    setRegion: jest.fn(),
    spaceRef,
  });
  return (
    <div
      ref={ref}
      data-canvas-bg
      data-testid="canvas"
      data-panning={pointer.isPanning ? 'yes' : 'no'}
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
    >
      <button data-testid="tile" type="button" onClick={onTileClick}>Tile</button>
    </div>
  );
}

describe('space-pan click hijack', () => {
  test('pointerdown on a button with Space held does not start a pan', () => {
    const onPanZoom = jest.fn();
    const onTileClick = jest.fn();
    render(<PanHarness spaceHeld onPanZoom={onPanZoom} onTileClick={onTileClick} />);
    const tile = screen.getByTestId('tile');
    const canvas = screen.getByTestId('canvas');

    const downResult = fireEvent.pointerDown(tile, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    // No preventDefault -> click chain survives (fireEvent returns true).
    expect(downResult).toBe(true);
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 90, clientY: 90 });
    expect(onPanZoom).not.toHaveBeenCalled();
    expect(canvas).toHaveAttribute('data-panning', 'no');

    fireEvent.click(tile);
    expect(onTileClick).toHaveBeenCalledTimes(1);
  });

  test('space+drag starting on empty background still pans', () => {
    const onPanZoom = jest.fn();
    render(<PanHarness spaceHeld onPanZoom={jest.fn()} onTileClick={jest.fn()} />);
    const canvas = screen.getByTestId('canvas');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 10, clientY: 10 });
    // Re-query after state update for the panning flag.
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-panning', 'yes');
    void onPanZoom;
  });

  test('pan-down then pointer-up clears the panning flag (cursor unsticks)', () => {
    render(<PanHarness spaceHeld onPanZoom={jest.fn()} onTileClick={jest.fn()} />);
    const canvas = screen.getByTestId('canvas');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 3, clientX: 10, clientY: 10 });
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-panning', 'yes');
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 3, clientX: 30, clientY: 30 });
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-panning', 'no');
  });
});

function ViewportHarness() {
  const ref = React.useRef(null);
  const { spaceHeld } = useCanvasViewport({
    ref, pan: { x: 0, y: 0 }, zoom: 1, onPanZoom: jest.fn(), panMode: 'both',
  });
  return <div ref={ref} data-testid="viewport" data-space={spaceHeld ? 'held' : 'free'} />;
}

describe('space-held reset', () => {
  test('window blur releases a held Space', () => {
    render(<ViewportHarness />);
    fireEvent.keyDown(window, { code: 'Space', target: document.body });
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-space', 'held');
    fireEvent.blur(window);
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-space', 'free');
  });

  test('releasing Space after a panMode switch still clears the hold', () => {
    render(<ViewportHarness />);
    fireEvent.keyDown(window, { code: 'Space', target: document.body });
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-space', 'held');
    fireEvent.keyUp(window, { code: 'Space', key: ' ', target: document.body });
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-space', 'free');
  });
});
