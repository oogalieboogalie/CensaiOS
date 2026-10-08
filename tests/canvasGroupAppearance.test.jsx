/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CanvasGroup, CanvasGroupCard } from '../src/components/canvas/CanvasGroup.jsx';
import { getGroupInnerBounds, makeGroupBoundsForWindows } from '../src/lib/layoutAlgo.js';
import { splitAt, leaf } from '../src/lib/layout/tree.js';

// jsdom has no PointerEvent; without it fireEvent drops clientX.
if (!window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId; }
  };
}

describe('Canvas group appearance', () => {
  const group = {
    id: 'test-group', label: 'Test Group', hue: 220,
    x: 0, y: 0, w: 1002, h: 400,
  };

  test('a group hugs its windows: no frame, no padding', () => {
    const win = { x: 96, y: 192, w: 320, h: 240 };
    const bounds = makeGroupBoundsForWindows([win]);
    expect(bounds).toEqual({ x: 96, y: 192, w: 320, h: 240 });
    expect(getGroupInnerBounds(bounds)).toEqual(bounds);
  });

  test('draws no border or background; the label only shows when asked', () => {
    const { container, rerender } = render(<CanvasGroup group={group} zoom={1} allWins={[]} visible={false} onUpdate={jest.fn()} onMove={jest.fn()} />);
    const el = container.querySelector('[data-group-id="test-group"]');
    expect(el.style.border).toBe('');
    expect(el.style.background).toBe('');
    const label = container.querySelector('[data-group-label]');
    expect(label).toHaveStyle({ opacity: '0' });
    rerender(<CanvasGroup group={group} zoom={1} allWins={[]} visible onUpdate={jest.fn()} onMove={jest.fn()} hotkeySlot={3} />);
    expect(container.querySelector('[data-group-label]')).toHaveStyle({ opacity: '1' });
    expect(screen.getByText('F3')).toBeInTheDocument();
  });

  test('the shadow card sits under the tiles at the group rect', () => {
    const { container } = render(<CanvasGroupCard group={group} />);
    expect(container.querySelector('[data-group-card="test-group"]')).toHaveStyle({ left: '0px', width: '1002px' });
  });

  test('tiled groups get one draggable seam per split', () => {
    const tiled = { ...group, root: splitAt(leaf('a'), 'a', 'b', 'right') };
    const wins = [
      { id: 'a', x: 0, y: 0, w: 500, h: 400, groupId: 'test-group' },
      { id: 'b', x: 502, y: 0, w: 500, h: 400, groupId: 'test-group' },
    ];
    const onSetSeam = jest.fn();
    const { container } = render(<CanvasGroup group={tiled} tiled zoom={1} allWins={wins} onSetSeam={onSetSeam} onMove={jest.fn()} />);
    const seam = container.querySelector('[data-group-seam]');
    expect(seam).toHaveAttribute('aria-orientation', 'vertical');
    fireEvent.pointerDown(seam, { clientX: 500, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerMove(seam, { clientX: 600, clientY: 50, pointerId: 1 });
    expect(onSetSeam).toHaveBeenCalled();
    const [path, ratio] = onSetSeam.mock.calls.at(-1);
    expect(path).toBe('');
    expect(ratio).toBeGreaterThan(0.5);
  });

  test('layout preset popover toggles off and closes with Escape', () => {
    render(<CanvasGroup group={group} zoom={1} allWins={[]} onUpdate={jest.fn()} onMove={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Layout presets' });

    fireEvent.click(trigger);
    expect(screen.getByText(/Layout presets ·/)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByText(/Layout presets ·/)).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/Layout presets ·/)).toBeNull();
  });
});
