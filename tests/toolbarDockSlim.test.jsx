/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Toolbar } from '../src/app/Toolbar.jsx';
import { DOCK } from '../src/app/toolbar/dockMetrics.js';

function renderDock(activeTool = 'select') {
  render(
    <Toolbar
      activeTool={activeTool}
      onSelectTool={() => {}}
      penColor="var(--ink)"
      setPenColor={() => {}}
      penSize={4}
      setPenSize={() => {}}
      focusMode={false}
      onAiAgent={() => {}}
    />,
  );
  fireEvent.mouseEnter(document.getElementById('canvas-multitool-dock'));
}

describe('slim tool dock', () => {
  test('tool buttons are 30px circles with a 16px icon', () => {
    renderDock();
    const btn = screen.getByTitle('Select (V)');
    expect(btn.style.width).toBe(`${DOCK.button}px`);
    expect(btn.style.height).toBe(`${DOCK.button}px`);
    expect(btn.style.borderRadius).toBe('50%');
    const icon = btn.querySelector('svg');
    expect(icon.getAttribute('width')).toBe(String(DOCK.icon));
    expect(icon.getAttribute('height')).toBe(String(DOCK.icon));
    expect(icon.getAttribute('stroke-width')).toBe(String(DOCK.stroke));
  });

  test('the pill is about 36px tall: 3px padding, 4px gaps, 16px dividers', () => {
    renderDock();
    const nav = screen.getByRole('navigation', { name: 'Canvas tools' });
    expect(nav.style.padding).toBe(`${DOCK.padY}px ${DOCK.padX}px`);
    expect(nav.style.gap).toBe(`${DOCK.gap}px`);
    const divider = nav.querySelector('[data-dock-divider]');
    expect(divider.style.height).toBe(`${DOCK.divider}px`);
  });

  test('the chosen tool keeps the accent fill', () => {
    renderDock('pen');
    const brush = screen.getByTitle('Brush (P)');
    expect(brush.style.background).toContain('var(--accent-soft)');
    expect(brush.style.color).toBe('var(--accent-ink)');
  });

  test('the collapsed Tools capsule stays at least 30px tall, and the pen row stays tight', () => {
    renderDock('pen');
    const mini = screen.getByTestId('dock-capsule-mini');
    expect(mini.style.padding).toBe(`${DOCK.padY}px 12px`);
    expect(mini.style.minHeight).toBe(`${DOCK.button}px`);
    expect(mini.style.boxSizing).toBe('border-box');
    const pen = screen.getByTestId('dock-pen-options');
    expect(pen.style.padding).toBe(`${DOCK.padY}px 8px`);
    const swatch = screen.getByTitle('Pen color Ink');
    expect(swatch.style.width).toBe(`${DOCK.button}px`);
    expect(swatch.querySelector('[data-pen-swatch]').style.width).toBe('16px');
    expect(screen.getByTitle('Pen size 4').style.width).toBe(`${DOCK.button}px`);
  });
});
