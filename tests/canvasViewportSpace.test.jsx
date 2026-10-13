/**
 * @jest-environment jsdom
 *
 * Regression test: the canvas Space-to-pan shortcut must not eat Space typed
 * in the VS Code-like code editor (CodeMirror 6 renders a contenteditable
 * div, not a textarea).
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { useCanvasViewport } from '../src/components/canvas/useCanvasViewport.js';

function Harness() {
  const ref = React.useRef(null);
  useCanvasViewport({ ref, pan: { x: 0, y: 0 }, zoom: 1, onPanZoom: () => {} });
  return React.createElement(
    'div',
    { ref },
    React.createElement('div', { 'data-testid': 'plain' }, 'canvas'),
    React.createElement('div', { 'data-testid': 'editable', contentEditable: 'true', suppressContentEditableWarning: true }),
  );
}

function spaceKeydown(target) {
  let prevented = false;
  act(() => {
    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    prevented = event.defaultPrevented;
  });
  return prevented;
}

describe('useCanvasViewport space-pan guard', () => {
  test('Space on a plain canvas surface still starts pan (prevented)', () => {
    const { getByTestId } = render(React.createElement(Harness));
    expect(spaceKeydown(getByTestId('plain'))).toBe(true);
  });
  test('Space inside a contenteditable editor is NOT stolen', () => {
    const { getByTestId } = render(React.createElement(Harness));
    expect(spaceKeydown(getByTestId('editable'))).toBe(false);
  });
  test('Space inside a textarea is NOT stolen (legacy pane)', () => {
    const { getByTestId, container } = render(React.createElement(Harness));
    const area = document.createElement('textarea');
    container.appendChild(area);
    expect(spaceKeydown(area)).toBe(false);
    expect(getByTestId('plain')).toBeInTheDocument();
  });
});
