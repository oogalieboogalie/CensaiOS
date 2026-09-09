/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { Toolbar } from '../src/app/Toolbar.jsx';

function renderDock(overrides = {}) {
  const props = {
    activeTool: 'select',
    onSelectTool: jest.fn(),
    penColor: '#EF4444',
    setPenColor: jest.fn(),
    penSize: 4,
    setPenSize: jest.fn(),
    focusMode: false,
    onAiAgent: jest.fn(),
    ...overrides,
  };
  render(<Toolbar {...props} />);
  return props;
}

describe('multitool dock', () => {
  test('renders the capsule with all seven tools', () => {
    renderDock();
    expect(document.getElementById('canvas-multitool-dock')).toBeInTheDocument();
    for (const title of ['Select (V)', 'Pan (H)', 'Brush (P)', 'Erase (E)', 'Rectangle (R)', 'Text (T)', 'AI Copilot (A)']) {
      expect(screen.getByTitle(title)).toBeInTheDocument();
    }
  });

  test('clicking a tool selects it and broadcasts canvas:tool-change', () => {
    const seen = [];
    const listener = (e) => seen.push(e.detail.tool);
    window.addEventListener('canvas:tool-change', listener);
    try {
      const props = renderDock();
      fireEvent.click(screen.getByTitle('Brush (P)'));
      expect(props.onSelectTool).toHaveBeenCalledWith('pen');
      expect(seen).toEqual(['pen']);
    } finally {
      window.removeEventListener('canvas:tool-change', listener);
    }
  });

  test('AI button fires the action without changing the active tool', () => {
    const seen = [];
    const listener = (e) => seen.push(e.detail.tool);
    window.addEventListener('canvas:tool-change', listener);
    try {
      const props = renderDock();
      fireEvent.click(screen.getByTitle('AI Copilot (A)'));
      expect(props.onAiAgent).toHaveBeenCalledTimes(1);
      expect(props.onSelectTool).not.toHaveBeenCalled();
      expect(seen).toEqual(['ai-agent']);
    } finally {
      window.removeEventListener('canvas:tool-change', listener);
    }
  });

  test('keyboard shortcuts switch tools', () => {
    const props = renderDock();
    fireEvent.keyDown(document, { key: 'r' });
    expect(props.onSelectTool).toHaveBeenCalledWith('rect');
    fireEvent.keyDown(document, { key: 'h' });
    expect(props.onSelectTool).toHaveBeenCalledWith('pan');
    fireEvent.keyDown(document, { key: 'b' });
    expect(props.onSelectTool).toHaveBeenCalledWith('pen');
  });

  test('hovering a tool highlights it and shows the hint', () => {
    renderDock();
    const btn = screen.getByTitle('Pan (H)');
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toBe('var(--surface-2)');
    expect(btn.style.color).toBe('var(--accent-ink)');
    expect(document.getElementById('tool-tooltip').textContent).toBe('Pan (H)');
    fireEvent.mouseLeave(btn);
    expect(btn.style.background).toBe('transparent');
  });

  test('bar pops out of the pill top on hover, pill stays put', () => {
    renderDock({ activeTool: 'pen' });
    const mini = screen.getByTestId('dock-capsule-mini');
    const full = screen.getByTestId('dock-capsule-full');
    expect(mini.style.opacity).toBeFalsy();
    expect(full.style.gridTemplateRows).toBe('0fr');
    // Hidden bar stays out of tab order.
    expect(screen.getByTitle('Pan (H)').tabIndex).toBe(-1);

    fireEvent.mouseEnter(document.getElementById('canvas-multitool-dock'));
    expect(full.style.gridTemplateRows).toBe('1fr');
    expect(screen.getByTitle('Pan (H)').tabIndex).toBe(0);

    fireEvent.mouseLeave(document.getElementById('canvas-multitool-dock'));
    expect(full.style.gridTemplateRows).toBe('0fr');
  });

  test('shortcuts are ignored while typing', () => {
    const props = renderDock();
    render(<input aria-label="typing-box" />);
    fireEvent.keyDown(screen.getByLabelText('typing-box'), { key: 'r' });
    expect(props.onSelectTool).not.toHaveBeenCalled();
  });

  test('pen options popover shows for brush and rect only, once expanded', () => {
    const { unmount } = render(
      <Toolbar
        activeTool="pen" onSelectTool={jest.fn()}
        penColor="#EF4444" setPenColor={jest.fn()}
        penSize={4} setPenSize={jest.fn()} focusMode={false} onAiAgent={jest.fn()}
      />,
    );
    expect(screen.getByTitle('Pen color #EF4444')).toBeInTheDocument();
    // Folded away with the bar until hover (0fr row, not unmounted, so it
    // can unfold with the animation).
    expect(screen.getByTestId('dock-capsule-full').style.gridTemplateRows).toBe('0fr');
    fireEvent.mouseEnter(document.getElementById('canvas-multitool-dock'));
    expect(screen.getByTestId('dock-capsule-full').style.gridTemplateRows).toBe('1fr');
    expect(screen.getByTitle('Pen size 4')).toBeInTheDocument();
    unmount();

    renderDock({ activeTool: 'select' });
    expect(screen.queryByTitle('Pen color #EF4444')).not.toBeInTheDocument();
  });
});
