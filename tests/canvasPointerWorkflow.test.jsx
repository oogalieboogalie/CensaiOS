/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CanvasShell } from '../src/components/canvas/CanvasShell.jsx';
import { useCanvasPointer } from '../src/components/canvas/useCanvasPointer.js';
import { RegionMenu } from '../src/components/canvas/CanvasRegionMenu.jsx';

beforeAll(() => {
  window.PointerEvent = MouseEvent;
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

function PointerHarness({ wins, onSelection, onRegion, onSpawnGroup, onSuppression }) {
  const ref = React.useRef(null);
  const spaceRef = React.useRef(false);
  const pointer = useCanvasPointer({
    ref,
    pan: { x: 0, y: 0 },
    zoom: 1,
    onPanZoom: jest.fn(),
    onSelect: jest.fn(),
    onSpawnGroup,
    wins,
    onSelection,
    activeTool: 'select',
    penMode: false,
    penColor: '#000',
    penSize: 2,
    setPaths: jest.fn(),
    setRegion: onRegion,
    spaceRef,
  });

  return (
    <CanvasShell
      ref={ref}
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onCanvasContextMenu={() => onSuppression?.(pointer.consumeContextMenuSuppression())}
      pan={{ x: 0, y: 0 }}
      zoom={1}
      activeTool="select"
      penMode={false}
      isPanning={false}
    />
  );
}

describe('canvas pointer workflow', () => {
  test('normal left-drag selects enclosed windows and still opens region tools', () => {
    const onSelection = jest.fn();
    const onRegion = jest.fn();
    const { container } = render(
      <PointerHarness
        wins={[
          { id: 'one', x: 20, y: 20, w: 40, h: 40 },
          { id: 'two', x: 100, y: 100, w: 40, h: 40 },
        ]}
        onSelection={onSelection}
        onRegion={onRegion}
        onSpawnGroup={jest.fn()}
      />,
    );
    const canvas = container.querySelector('[data-canvas-bg]');

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 180, clientY: 180 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 180, clientY: 180 });

    expect(onSelection).toHaveBeenLastCalledWith(['one', 'two']);
    expect(onRegion).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 180, h: 180, mode: 'selection', isGroup: false, isSelection: true });
  });

  test('right-drag grouping clears stale selection and suppresses its context menu', () => {
    const onSelection = jest.fn();
    const onSpawnGroup = jest.fn();
    const onSuppression = jest.fn();
    const { container } = render(
      <PointerHarness
        wins={[]}
        onSelection={onSelection}
        onRegion={jest.fn()}
        onSpawnGroup={onSpawnGroup}
        onSuppression={onSuppression}
      />,
    );
    const canvas = container.querySelector('[data-canvas-bg]');

    fireEvent.pointerDown(canvas, { button: 2, pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { buttons: 2, pointerId: 2, clientX: 120, clientY: 120 });
    fireEvent.pointerUp(canvas, { button: 2, pointerId: 2, clientX: 120, clientY: 120 });
    fireEvent.contextMenu(canvas, { clientX: 120, clientY: 120 });

    expect(onSelection).toHaveBeenCalledWith([]);
    expect(onSpawnGroup).toHaveBeenCalledWith({ x: 10, y: 10 }, { w: 110, h: 110 });
    expect(onSuppression).toHaveBeenCalledWith(true);
  });

  test('region toolbar backdrop remains a valid right-click selection surface', () => {
    const { container } = render(
      <RegionMenu rect={{ x: 0, y: 0, w: 200, h: 200 }} zoom={1} onCancel={jest.fn()} />,
    );

    expect(container.querySelector('[data-canvas-context-surface]')).toBeInTheDocument();
  });
});
