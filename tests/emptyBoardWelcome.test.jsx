/** @jest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { EmptyState, showsWelcome } from '../src/components/canvas/CanvasEmptyState.jsx';
import { panHint } from '../src/components/canvas/CanvasLaunchpad.jsx';

const EMPTY = { wins: [], groups: [], paths: [] };

test('the welcome shows only on a board with nothing on it', () => {
  expect(showsWelcome(EMPTY)).toBe(true);
  expect(showsWelcome({ ...EMPTY, wins: [{ id: 'w1' }] })).toBe(false);
  expect(showsWelcome({ ...EMPTY, groups: [{ id: 'g1' }] })).toBe(false);
  // A drawing on the board is not covered by the welcome.
  expect(showsWelcome({ ...EMPTY, paths: [{ id: 'p1', pts: [] }] })).toBe(false);
  // Nor is a selection being drawn, or the menu for the picked area.
  expect(showsWelcome({ ...EMPTY, busy: true })).toBe(false);
  expect(showsWelcome({ ...EMPTY, suppress: true })).toBe(false);
});

test('the welcome steps aside while a drawing tool is picked', () => {
  for (const tool of ['pen', 'eraser', 'rect', 'text', 'lasso']) {
    expect(showsWelcome({ ...EMPTY, activeTool: tool })).toBe(false);
  }
  expect(showsWelcome({ ...EMPTY, activeTool: 'select' })).toBe(true);
  expect(showsWelcome({ ...EMPTY, activeTool: 'pan' })).toBe(true);
});

test('the welcome sits on the screen between the top bar and the tools, not at a spot on the board', () => {
  render(<EmptyState onSpawn={jest.fn()} />);
  const box = screen.getByTestId('empty-board');
  expect(box.style.top).toBe('106px');
  expect(box.style.bottom).toBe('96px');
  expect(box.style.alignItems).toBe('center');
  expect(box.style.justifyContent).toBe('center');
  // It used to be placed at a fixed spot on the board (-280, -270), so it
  // slid off the screen whenever the board was moved or zoomed.
  const pad = screen.getByTestId('canvas-launchpad');
  expect(pad.style.position).toBe('');
  expect(pad.style.left).toBe('');
});

test('only the welcome\'s buttons take clicks; the rest lets board gestures through', () => {
  render(<EmptyState onSpawn={jest.fn()} onTour={jest.fn()} />);
  expect(screen.getByTestId('empty-board').style.pointerEvents).toBe('none');
  const pad = screen.getByTestId('canvas-launchpad');
  expect(pad.style.pointerEvents).toBe('none');
  const buttons = within(pad).getAllByRole('button');
  expect(buttons.length).toBeGreaterThan(8);
  for (const button of buttons) expect(button.style.pointerEvents).toBe('auto');
});

describe('on a window too small for it', () => {
  const sizes = { box: { w: 1248, h: 398 }, pad: { w: 560, h: 389 } };
  const real = {};
  const layout = (name, part) => function size() {
    if (this.dataset?.testid === 'empty-board') return sizes.box[part];
    if (this.firstElementChild?.dataset?.testid === 'canvas-launchpad') return sizes.pad[part];
    return real[name].get.call(this);
  };
  beforeAll(() => {
    for (const [name, part] of [['clientWidth', 'w'], ['clientHeight', 'h'], ['offsetWidth', 'w'], ['offsetHeight', 'h']]) {
      real[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name) || Object.getOwnPropertyDescriptor(Element.prototype, name);
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: layout(name, part) });
    }
  });
  afterAll(() => {
    for (const name of Object.keys(real)) Object.defineProperty(HTMLElement.prototype, name, real[name]);
  });

  test('the welcome keeps its normal size when there is room', () => {
    sizes.box = { w: 1408, h: 772 };
    render(<EmptyState onSpawn={jest.fn()} />);
    expect(screen.getByTestId('canvas-launchpad').parentElement.style.transform).toBe('');
  });

  test('the welcome shrinks to fit instead of running under the top bar or the tools', () => {
    sizes.box = { w: 1248, h: 300 };
    render(<EmptyState onSpawn={jest.fn()} />);
    // 300 of room for a welcome 389 tall: 77% of its size.
    expect(screen.getByTestId('canvas-launchpad').parentElement.style.transform).toBe('scale(0.77)');
  });
});

test('the moving tip names what really moves the board for each pan setting', () => {
  expect(panHint(undefined)).toBe('scroll or Space + drag — move around');
  expect(panHint('both')).toBe('scroll or Space + drag — move around');
  expect(panHint('space')).toBe('scroll or Space + drag — move around');
  expect(panHint('middle')).toBe('scroll or middle-click + drag — move around');
  expect(panHint('alt')).toBe('scroll or Alt + drag — move around');
  render(<EmptyState onSpawn={jest.fn()} panMode="alt" />);
  const tips = screen.getByTestId('launchpad-tips');
  expect(tips).toHaveTextContent('scroll or Alt + drag — move around');
  expect(tips).toHaveTextContent('Ctrl + scroll — zoom in & out');
  // A plain click and drag draws a selection box, so no tip promises it moves the board.
  expect(screen.queryByText(/click \+ drag|drag to pan/i)).not.toBeInTheDocument();
});
