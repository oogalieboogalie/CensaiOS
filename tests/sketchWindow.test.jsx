/**
 * @jest-environment jsdom
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { jest } from '@jest/globals';
// eslint-disable-next-line no-unused-vars
import { ExcalidrawWindow } from '../src/components/ExcalidrawWindow.jsx';

describe('Custom Whiteboard (ExcalidrawWindow) Component', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
    // Mock crypto.randomUUID
    if (!global.crypto) {
      global.crypto = {};
    }
    global.crypto.randomUUID = () => Math.random().toString(36).substring(2);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders the custom whiteboard layout and toolbar buttons', () => {
    const win = { id: 'sketch-1', title: 'Sketchpad', state: {} };
    render(
      <ExcalidrawWindow win={win} onUpdate={jest.fn()} />
    );

    // Verify title and subtitle (Blank canvas) are rendered
    expect(screen.getByText('Sketchpad')).toBeInTheDocument();
    expect(screen.getByText(/Blank canvas/)).toBeInTheDocument();

    // Verify presence of tools (buttons with titles)
    expect(screen.getByTitle('Pencil Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Rectangle Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Circle Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Arrow Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Text Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Select & Move Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Clear everything')).toBeInTheDocument();
  });

  test('clearing board triggers parent onUpdate with empty array', async () => {
    const onUpdateMock = jest.fn();
    const win = { 
      id: 'sketch-2', 
      title: 'My Board', 
      state: { 
        excalidraw: { 
          elements: [{ id: 'el-1', type: 'rect', x: 10, y: 10, w: 50, h: 50, color: 'var(--accent)', strokeWidth: 3 }] 
        } 
      } 
    };

    render(
      <ExcalidrawWindow win={win} onUpdate={onUpdateMock} />
    );

    // Elements count subtitle should show 1 object
    expect(screen.getByText(/1 object/)).toBeInTheDocument();

    // Trigger clear
    const clearBtn = screen.getByText('Clear Board');
    fireEvent.click(clearBtn);

    // Expect subtitle to update to Blank canvas
    expect(screen.getByText(/Blank canvas/)).toBeInTheDocument();

    // Fast-forward save debounce timer
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        excalidraw: { elements: [] }
      })
    }));
  });
});
