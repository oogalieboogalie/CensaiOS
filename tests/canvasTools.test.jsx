/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CanvasShell } from '../src/components/canvas/CanvasShell.jsx';
import { useCanvasPointer } from '../src/components/canvas/useCanvasPointer.js';

beforeAll(() => {
  window.PointerEvent = MouseEvent;
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

function ToolHarness({ activeTool, onPanZoom, onSpawn, setPaths, onSelection }) {
  const ref = React.useRef(null);
  const spaceRef = React.useRef(false);
  const pointer = useCanvasPointer({
    ref,
    pan: { x: 0, y: 0 },
    zoom: 1,
    onPanZoom: onPanZoom || jest.fn(),
    onSelect: jest.fn(),
    onSpawnGroup: jest.fn(),
    wins: [],
    onSelection: onSelection || jest.fn(),
    activeTool,
    penMode: false,
    penColor: '#EF4444',
    penSize: 4,
    setPaths: setPaths || jest.fn(),
    setRegion: jest.fn(),
    onSpawn,
    spaceRef,
  });

  return (
    <CanvasShell
      ref={ref}
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      pan={{ x: 0, y: 0 }}
      zoom={1}
      activeTool={activeTool}
      penMode={false}
      isPanning={false}
    />
  );
}

function drag(canvas, x0, y0, x1, y1) {
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: x0, clientY: y0 });
  fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: x1, clientY: y1 });
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x1, clientY: y1 });
}

describe('canvas tools (pan / rect / text)', () => {
  test('pan tool left-drags the viewport', () => {
    const onPanZoom = jest.fn();
    const { container } = render(<ToolHarness activeTool="pan" onPanZoom={onPanZoom} />);
    drag(container.querySelector('[data-canvas-bg]'), 10, 10, 60, 40);
    expect(onPanZoom).toHaveBeenLastCalledWith({ panX: 50, panY: 30, zoom: 1 });
  });

  test('rect tool commits a closed stroke in pen color/size', () => {
    const setPaths = jest.fn();
    const { container } = render(<ToolHarness activeTool="rect" setPaths={setPaths} />);
    drag(container.querySelector('[data-canvas-bg]'), 10, 10, 110, 60);
    expect(setPaths).toHaveBeenCalledTimes(1);
    const [next] = setPaths.mock.calls[0][0]([]);
    expect(next.color).toBe('#EF4444');
    expect(next.size).toBe(4);
    expect(next.pts).toEqual([
      { x: 10, y: 10, p: 1 },
      { x: 110, y: 10, p: 1 },
      { x: 110, y: 60, p: 1 },
      { x: 10, y: 60, p: 1 },
      { x: 10, y: 10, p: 1 },
    ]);
  });

  test('rect tool ignores tiny drags', () => {
    const setPaths = jest.fn();
    const { container } = render(<ToolHarness activeTool="rect" setPaths={setPaths} />);
    drag(container.querySelector('[data-canvas-bg]'), 10, 10, 12, 12);
    expect(setPaths).not.toHaveBeenCalled();
  });

  test('text tool click drops a note at the click point', () => {
    const onSpawn = jest.fn();
    const { container } = render(<ToolHarness activeTool="text" onSpawn={onSpawn} />);
    const canvas = container.querySelector('[data-canvas-bg]');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 30, clientY: 40 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 30, clientY: 40 });
    expect(onSpawn).toHaveBeenCalledWith('doc', { fileName: 'Canvas note.md', text: '' }, { x: 30, y: 40 });
  });

  test('text tool drag spawns nothing', () => {
    const onSpawn = jest.fn();
    const { container } = render(<ToolHarness activeTool="text" onSpawn={onSpawn} />);
    drag(container.querySelector('[data-canvas-bg]'), 0, 0, 100, 100);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  test('shell shows a grab cursor for the pan tool', () => {
    const { container } = render(<ToolHarness activeTool="pan" />);
    expect(container.querySelector('[data-canvas-bg]').style.cursor).toBe('grab');
  });

  test('line tool commits the two ends of the drag', () => {
    const setPaths = jest.fn();
    const { container } = render(<ToolHarness activeTool="line" setPaths={setPaths} />);
    drag(container.querySelector('[data-canvas-bg]'), 10, 20, 80, 50);
    const [next] = setPaths.mock.calls[0][0]([]);
    expect(next.pts).toEqual([{ x: 10, y: 20, p: 1 }, { x: 80, y: 50, p: 1 }]);
    expect(next.color).toBe('#EF4444');
  });

  test('ellipse tool commits a closed outline of the drag box', () => {
    const setPaths = jest.fn();
    const { container } = render(<ToolHarness activeTool="ellipse" setPaths={setPaths} />);
    drag(container.querySelector('[data-canvas-bg]'), 10, 10, 110, 60);
    const [next] = setPaths.mock.calls[0][0]([]);
    expect(next.pts.length).toBeGreaterThan(8);
    expect(next.pts.at(-1).x).toBeCloseTo(next.pts[0].x);
    expect(next.pts.at(-1).y).toBeCloseTo(next.pts[0].y);
    expect(next.size).toBe(4);
  });

  test('arrow tool commits a stroke that finishes on the drag tip', () => {
    const setPaths = jest.fn();
    const { container } = render(<ToolHarness activeTool="arrow" setPaths={setPaths} />);
    drag(container.querySelector('[data-canvas-bg]'), 10, 40, 90, 40);
    const [next] = setPaths.mock.calls[0][0]([]);
    expect(next.pts[0]).toEqual({ x: 10, y: 40, p: 1 });
    expect(next.pts.at(-1)).toEqual({ x: 90, y: 40, p: 1 });
  });

  test('highlight tool lays down a wide washed-out stroke in the pen colour', () => {
    const setPaths = jest.fn();
    const { container } = render(<ToolHarness activeTool="highlight" setPaths={setPaths} />);
    drag(container.querySelector('[data-canvas-bg]'), 10, 10, 80, 10);
    const [next] = setPaths.mock.calls[0][0]([]);
    expect(next.ink).toBe(1);
    expect(next.color).toBe('color-mix(in oklab, #EF4444 45%, transparent)');
    expect(next.size).toBeGreaterThan(4);
  });
});
