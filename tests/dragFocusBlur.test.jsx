/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { WindowFrame } from '../src/components/Windows.jsx';
import { CanvasShell } from '../src/components/canvas/CanvasShell.jsx';
import { useCanvasPointer } from '../src/components/canvas/useCanvasPointer.js';
import { CanvasGroup } from '../src/components/canvas/CanvasGroup.jsx';

describe('Blur active input on canvas and window interactions', () => {
  test('WindowFrame: blurs input when window drag handle receives pointerdown', () => {
    const onUpdate = jest.fn();
    render(
      <WindowFrame
        win={{
          id: 'test-win',
          x: 10,
          y: 20,
          w: 300,
          h: 200,
        }}
        onUpdate={onUpdate}
        onClose={jest.fn()}
        onSelect={jest.fn()}
        isActive={true}
        allWins={[]}
      >
        <div>
          <input data-testid="test-input" />
        </div>
      </WindowFrame>
    );

    const input = screen.getByTestId('test-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    const dragHandle = screen.getByTitle(/Drag to move/);
    expect(dragHandle).toBeInTheDocument();

    fireEvent.pointerDown(dragHandle, { clientX: 100, clientY: 100, pointerId: 1 });

    expect(document.activeElement).not.toBe(input);
  });

  test('CanvasShell: blurs input when canvas background receives pointerdown', () => {
    const TestComponent = () => {
      const ref = React.useRef(null);
      const spaceRef = React.useRef(false);
      const { onPointerDown } = useCanvasPointer({
        ref,
        pan: { x: 0, y: 0 },
        zoom: 1,
        onPanZoom: jest.fn(),
        onSelect: jest.fn(),
        onSpawnGroup: jest.fn(),
        activeTool: 'select',
        penMode: false,
        penColor: '#000',
        penSize: 2,
        setPaths: jest.fn(),
        setRegion: jest.fn(),
        spaceRef,
      });

      return (
        <CanvasShell
          ref={ref}
          onPointerDown={onPointerDown}
          onPointerMove={jest.fn()}
          onPointerUp={jest.fn()}
          pan={{ x: 0, y: 0 }}
          zoom={1}
          activeTool="select"
          penMode={false}
          isPanning={false}
        >
          <div>
            <input data-testid="test-input" />
          </div>
        </CanvasShell>
      );
    };

    render(<TestComponent />);

    const input = screen.getByTestId('test-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    const canvasBg = screen.getByTestId('test-input').closest('[data-canvas-bg]');
    fireEvent.pointerDown(canvasBg, { clientX: 50, clientY: 50, pointerId: 1, button: 0 });

    expect(document.activeElement).not.toBe(input);
  });

  test('CanvasGroup: blurs input when group header receives pointerdown', () => {
    render(
      <div>
        <CanvasGroup
          group={{
            id: 'test-group',
            label: 'Test Group',
            x: 10,
            y: 10,
            w: 200,
            h: 200,
          }}
          zoom={1}
          onMove={jest.fn()}
          onSelect={jest.fn()}
          onRename={jest.fn()}
          onDelete={jest.fn()}
        />
        <input data-testid="test-input" />
      </div>
    );

    const input = screen.getByTestId('test-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    const header = screen.getByText('Test Group');
    expect(header).toBeInTheDocument();

    fireEvent.pointerDown(header, { clientX: 15, clientY: 15, pointerId: 1 });

    expect(document.activeElement).not.toBe(input);
  });
});
