/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { CanvasMinimap } from '../src/components/canvas/CanvasMinimap.jsx';
import { screenFurniture } from '../src/lib/screenFurniture.js';

// A 1440 by 900 screen at zoom 1: the full map sits in the bottom-left
// corner, from about x 14 to 234 and y 668 to 848.
const AWAY = { id: 'away', x: 440, y: 234, w: 560, h: 448 };
const UNDER = { id: 'under', x: 56, y: 218, w: 368, h: 480 };

function show(wins) {
  return <CanvasMinimap wins={wins} pan={{ x: 0, y: 0 }} zoom={1} onPanZoom={jest.fn()} onSelect={jest.fn()} onClose={jest.fn()} />;
}

beforeEach(() => {
  window.innerWidth = 1440;
  window.innerHeight = 900;
  window.localStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('the full map shows while nothing is under it, and new windows are told to keep clear of it', () => {
  const view = render(show([AWAY]));
  expect(screen.getByTestId('board-map')).toBeInTheDocument();
  const [spot] = screenFurniture();
  expect(spot.x).toBe(14);
  expect(spot.y + spot.h).toBe(848);
  view.unmount();
  expect(screenFurniture()).toEqual([]);
});

test('a window under the map tucks it into its tab, and it comes back once the window moves away', () => {
  jest.useFakeTimers();
  const view = render(show([AWAY, UNDER]));
  expect(screen.queryByTestId('board-map')).not.toBeInTheDocument();
  expect(screen.getByTestId('board-map-tab')).toHaveAttribute('data-tucked', 'true');
  view.rerender(show([AWAY, { ...UNDER, x: 1016 }]));
  expect(screen.getByTestId('board-map-tab')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(450); });
  expect(screen.getByTestId('board-map')).toBeInTheDocument();
});

test('the map stays open while the pointer is on it, even when a window slides under it', () => {
  const view = render(show([AWAY]));
  fireEvent.pointerEnter(screen.getByTestId('board-map'));
  view.rerender(show([AWAY, UNDER]));
  expect(screen.getByTestId('board-map')).toBeInTheDocument();
  fireEvent.pointerLeave(screen.getByTestId('board-map'));
  expect(screen.getByTestId('board-map-tab')).toHaveAttribute('data-tucked', 'true');
});

test('a click on the tab opens the map even with a window under it', () => {
  render(show([AWAY, UNDER]));
  fireEvent.click(screen.getByTestId('board-map-tab'));
  expect(screen.getByTestId('board-map')).toBeInTheDocument();
});

test('a window beside the picture but under the map\'s wider head still tucks it', () => {
  // A tall board makes the picture narrow (about 65px), while the head
  // ("Board map, 3 windows") keeps the whole map about 196px wide.
  const tall = { id: 'tall', x: 440, y: 3000, w: 560, h: 448 };
  const beside = { id: 'beside', x: 120, y: 600, w: 280, h: 100 };
  const real = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function rect() {
    if (this.dataset?.testid !== 'board-map') return real.call(this);
    return { x: 14, y: 668, left: 14, top: 668, width: 196, height: 180, right: 210, bottom: 848 };
  };
  try {
    render(show([AWAY, tall, beside]));
    expect(screen.getByTestId('board-map-tab')).toHaveAttribute('data-tucked', 'true');
  } finally {
    Element.prototype.getBoundingClientRect = real;
  }
});

test('a map the person minimized stays a tab, is not marked tucked, and takes no room', () => {
  window.localStorage.setItem('hb.boardMap.minimized', 'true');
  render(show([AWAY]));
  expect(screen.getByTestId('board-map-tab')).not.toHaveAttribute('data-tucked');
  expect(screenFurniture()).toEqual([]);
});
