/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CanvasShell } from '../src/components/canvas/CanvasShell.jsx';

describe('CanvasShell layering', () => {
  test('renders canvas overlays after fixed windows so region menus stay on top', () => {
    render(
      React.createElement(
        CanvasShell,
        {
          pan: { x: 10, y: 20 },
          zoom: 1.5,
          fixedChildren: React.createElement('div', { 'data-testid': 'fixed-windows' }, 'windows'),
          overlayChildren: React.createElement('div', { 'data-testid': 'quick-select' }, 'quick select'),
        },
        React.createElement('div', { 'data-testid': 'canvas-content' }, 'canvas')
      )
    );

    const fixedWindows = screen.getByTestId('fixed-windows');
    const overlay = screen.getByTestId('quick-select').closest('[data-canvas-overlay]');

    expect(fixedWindows.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overlay).toHaveStyle({ zIndex: '120' });
    expect(overlay).toHaveStyle({ transform: 'translate(10px, 20px) scale(1.5)' });
  });
});
