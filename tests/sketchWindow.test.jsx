/**
 * @jest-environment jsdom
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { jest } from '@jest/globals';
import * as Y from 'yjs';
// eslint-disable-next-line no-unused-vars
import { ExcalidrawWindow } from '../src/components/ExcalidrawWindow.jsx';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';

// This jsdom builds pointer events without clientX, so a press stored NaN.
window.PointerEvent = class PointerEvent extends MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
};

function canvasSvg(container) {
  const svg = container.querySelector('#whiteboard-grid')?.ownerSVGElement;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
  return svg;
}

function drawStroke(container, x0, y0, x1, y1) {
  const svg = canvasSvg(container);
  const at = (clientX, clientY) => ({ button: 0, pointerId: 1, clientX, clientY, pointerType: 'mouse' });
  fireEvent.pointerDown(svg, at(x0, y0));
  fireEvent.pointerMove(svg, at(x1, y1));
  fireEvent.pointerUp(svg, at(x1, y1));
}

describe('Custom Whiteboard (ExcalidrawWindow) Component', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
    if (!global.crypto) global.crypto = {};
    let n = 0;
    global.crypto.randomUUID = () => `shape-${n += 1}`;
  });

  afterEach(() => {
    cleanup();
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

  test.each([
    ['Pencil Tool', 'pencil'],
    ['Rectangle Tool', 'rect'],
    ['Circle Tool', 'circle'],
    ['Arrow Tool', 'arrow'],
    ['Text Tool', 'text'],
  ])('%s draws a shape on the first press, move and lift', (title, type) => {
    const onUpdate = jest.fn();
    const { container } = render(<ExcalidrawWindow win={{ id: `sketch-${type}`, title: 'Sketchpad', state: {} }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle(title));
    drawStroke(container, 40, 36, 160, 120);
    if (type === 'text') {
      const input = container.querySelector('input');
      expect(input).toBeTruthy();
      fireEvent.change(input, { target: { value: 'Note' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    act(() => { jest.advanceTimersByTime(300); });
    const saved = onUpdate.mock.calls.at(-1)[0].state.excalidraw.elements;
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe(type);
    if (type === 'pencil') expect(saved[0].pts.length).toBeGreaterThan(1);
    if (type === 'rect' || type === 'circle') expect(saved[0].w).toBeGreaterThan(0);
    if (type === 'arrow') expect(saved[0].pts[1]).toMatchObject({ x: 160, y: 120 });
    if (type === 'text') expect(saved[0].text).toBe('Note');
    expect(screen.getByText(/1 object/)).toBeInTheDocument();
  });

  test('a line arriving while this person is still drawing is kept with theirs', () => {
    const onUpdate = jest.fn();
    const win = { id: 'sketch-both', title: 'Sketchpad', state: { excalidraw: { elements: [] } } };
    const pat = { id: 'line-pat', type: 'pencil', x: 70, y: 40, pts: [{ x: 70, y: 40, p: 0.5 }, { x: 110, y: 80, p: 0.5 }], color: 'var(--accent)', strokeWidth: 3 };
    const { container, rerender } = render(<ExcalidrawWindow win={win} onUpdate={onUpdate} />);
    const svg = canvasSvg(container);
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 16, clientY: 20, pointerType: 'mouse' });
    rerender(<ExcalidrawWindow win={{ ...win, state: { excalidraw: { elements: [pat] } } }} onUpdate={onUpdate} />);
    fireEvent.pointerMove(svg, { button: 0, pointerId: 1, clientX: 90, clientY: 70, pointerType: 'mouse' });
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1, clientX: 90, clientY: 70, pointerType: 'mouse' });
    act(() => { jest.advanceTimersByTime(300); });
    const saved = onUpdate.mock.calls.at(-1)[0].state.excalidraw.elements;
    expect(saved.map((el) => el.id).sort()).toEqual(['line-pat', 'shape-1']);
  });
});

const LOCAL = 'local';
const line = (id, x, y) => ({
  id, type: 'pencil', x, y,
  pts: [{ x, y, p: 0.5 }, { x: x + 36, y: y + 18, p: 0.5 }],
  color: 'var(--accent)', strokeWidth: 3,
});
const board = (elements) => ({
  wins: [{ id: 'sk1', kind: 'sketchpad', x: 0, y: 0, w: 800, h: 600, state: { excalidraw: { elements } } }],
});
function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}
const elementsOf = (doc, base) => readDocState(doc, base).wins[0].state.excalidraw.elements;

describe('Sketchpad shapes merge one shape at a time', () => {
  test('Sam and Pat drawing at the same moment both keep both lines, including after a reload', () => {
    const { a, b, sync } = offlinePair();
    const base = board([]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, board([line('line-sam', 12, 18)]), LOCAL);
    writeStateToDoc(b, base, board([line('line-pat', 70, 40)]), LOCAL);
    sync();
    for (const doc of [a, b]) {
      expect(elementsOf(doc, base).map((el) => el.id).sort()).toEqual(['line-pat', 'line-sam']);
    }
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(a));
    expect(elementsOf(reloaded, base).map((el) => el.id).sort()).toEqual(['line-pat', 'line-sam']);
  });

  test('a save that keeps the other person\'s line logs one count and no drawing', () => {
    const { a, b, sync } = offlinePair();
    const base = board([]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(b, base, board([line('line-pat', 70, 40)]), LOCAL);
    sync();
    writeStateToDoc(a, base, board([line('line-sam', 12, 18)]), LOCAL);
    const logged = pendingAppLog().filter((entry) => entry.message.startsWith('sketchpad: merged shapes'));
    expect(logged).toEqual([{
      level: 'info',
      message: 'sketchpad: merged shapes, kept 1 drawn by someone else at the same moment',
      detail: '',
      where: 'sketchpad',
      time: expect.any(String),
    }]);
    expect(elementsOf(a, base).map((el) => el.id).sort()).toEqual(['line-pat', 'line-sam']);
  });
});
