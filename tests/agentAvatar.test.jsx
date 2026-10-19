/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { AgentAvatar } from '../src/components/Agents.jsx';

const ATLAS = { id: 'atlas', name: 'Atlas', role: 'Backend', glyph: 'A', hue: 220 };
// An agent whose person picked an icon keeps the icon tile.
const PICKED = { ...ATLAS, iconRef: 'stock:circle' };

describe('AgentAvatar', () => {
  test('renders nothing without an agent', () => {
    const { container } = render(<AgentAvatar agent={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('family agents wear the censaiOS mark in their own colour token', () => {
    const { container } = render(<AgentAvatar agent={ATLAS} size={28} />);
    const face = container.firstChild;
    expect(face.className).toBe('hb-agent-mark');
    expect(face.getAttribute('data-family-mark')).toBe('atlas');
    expect(container.querySelectorAll('circle')).toHaveLength(8);
    expect(container.innerHTML).toContain('var(--mark)');
    expect(container.innerHTML).not.toMatch(/oklch\(/);
  });

  test('Censai keeps Ultem; every family agent has its own colour token', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/agent-marks.css'), 'utf8');
    expect(css).toContain('[data-family-mark="censai"] { --mark: var(--brand-ultem); }');
    for (const id of ['architect', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'phoenix']) {
      expect(css).toContain(`[data-family-mark="${id}"] { --mark: var(--family-${id}); }`);
    }
  });

  test('agents people made wear the mark in their own hue', () => {
    const { container } = render(<AgentAvatar agent={{ id: 'custom-1', name: 'Scout', role: 'Leads', hue: 140 }} size={28} />);
    const face = container.firstChild;
    expect(face.getAttribute('data-family-mark')).toBeNull();
    expect(face.style.getPropertyValue('--agent-h')).toBe('140');
  });

  test('uses theme vars, never raw per-agent hue colors', () => {
    const { container } = render(<AgentAvatar agent={PICKED} size={32} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/oklch\([^)]*220/);
    // Spec 3: the agent's hue only feeds the theme's agent tokens, which keep
    // the look's accent lightness and chroma (src/styles/tokens.css).
    expect(html).toContain('var(--agent-soft)');
    expect(html).toContain('var(--agent-ink)');
    expect(container.firstChild.style.getPropertyValue('--agent-h')).toBe('220');
  });

  test('agent tokens derive from the look accent, so every preset stays calm', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(css).toMatch(/--agent: oklch\(var\(--accent-l\) var\(--accent-c\) var\(--agent-h, var\(--accent-h\)\)\);/);
  });

  test('large avatars render the glyph badge without crashing', () => {
    render(<AgentAvatar agent={PICKED} size={48} />);
    expect(screen.getByTitle('Atlas — Backend')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
  });

  test('badge falls back to A without a glyph', () => {
    const { id, name, role, iconRef } = PICKED;
    render(<AgentAvatar agent={{ id, name, role, iconRef }} size={48} />);
    expect(screen.getByText('A')).toBeTruthy();
  });

  test('small avatars skip the badge', () => {
    const { container } = render(<AgentAvatar agent={PICKED} size={20} />);
    expect(container.textContent).not.toContain('A');
  });
});
