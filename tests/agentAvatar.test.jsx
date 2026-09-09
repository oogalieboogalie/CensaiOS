/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { AgentAvatar } from '../src/components/Agents.jsx';

const ATLAS = { id: 'atlas', name: 'Atlas', role: 'Backend', glyph: 'A', hue: 220 };

describe('AgentAvatar', () => {
  test('renders nothing without an agent', () => {
    const { container } = render(<AgentAvatar agent={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('uses theme vars, never per-agent hue colors', () => {
    const { container } = render(<AgentAvatar agent={ATLAS} size={32} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/oklch\([^)]*220/);
    expect(html).toContain('var(--accent-soft)');
    expect(html).toContain('var(--accent-ink)');
  });

  test('large avatars render the glyph badge without crashing', () => {
    render(<AgentAvatar agent={ATLAS} size={48} />);
    expect(screen.getByTitle('Atlas — Backend')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
  });

  test('badge falls back to A without a glyph', () => {
    const { id, name, role } = ATLAS;
    render(<AgentAvatar agent={{ id, name, role }} size={48} />);
    expect(screen.getByText('A')).toBeTruthy();
  });

  test('small avatars skip the badge', () => {
    const { container } = render(<AgentAvatar agent={ATLAS} size={20} />);
    expect(container.textContent).not.toContain('A');
  });
});
