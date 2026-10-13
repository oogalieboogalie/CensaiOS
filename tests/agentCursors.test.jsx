/**
 * @jest-environment jsdom
 */
// Agent cursors, browser side: the board reads the agents from awareness,
// draws each one at its window with its name and what it is doing, outlines
// the window it is working in, and types only the new characters.
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  agentCursorPoint, agentOutlines, agentStatus, readAgentPresence, stepTyping, typedText,
} from '../src/lib/collaboration/agentPresence.js';
import { applyAwarenessPresence, readAwarenessPresence } from '../src/lib/collaboration/awarenessPresence.js';
import { AgentCursors } from '../src/components/canvas/AgentCursors.jsx';

const serverState = {
  agents: [
    { id: 'r1', agentId: 'atlas', name: 'Atlas', color: 'oklch(0.74 0.13 220)', home: 'chat-1', at: 'doc-1', phase: 'reading', label: 'Reading Notes', tail: '', total: 0 },
    { id: 'r2', agentId: 'nexus', name: 'Nexus', color: 'red; background: url(x)', home: 'chat-2', at: 'chat-2', phase: 'typing', tail: 'Hello', total: 5 },
    { id: 'bad id!', home: 'chat-3' },
  ],
};

describe('reading agents from awareness', () => {
  test('agents come from the server state, never as people', () => {
    const states = new Map([[7, serverState], [8, { user: { id: 'u1', name: 'Sam' }, cursor: { x: 1, y: 2 } }]]);
    const presence = readAwarenessPresence(states, 99);
    expect(presence.participants.map((p) => p.actor.label)).toEqual(['Sam']);
    expect(Object.values(presence.agents).map((a) => a.name)).toEqual(['Atlas', 'Nexus']);
    expect(Object.values(presence.agents)[1].color).toBe('#E5A83A');
  });

  test('the window an agent works in gets its outline, unless a person selected it', () => {
    const agents = readAgentPresence(new Map([[7, serverState]]));
    expect(agentOutlines(agents)['doc-1']).toMatchObject({ type: 'agent', label: 'Atlas' });
    const wins = [{ id: 'doc-1' }, { id: 'chat-2' }];
    const merged = applyAwarenessPresence(wins, { agents, selections: { 'chat-2': { label: 'Sam', color: 'blue' } } });
    expect(merged[0].selectionActor).toMatchObject({ label: 'Atlas', outline: true });
    expect(merged[1].selectionActor).toMatchObject({ label: 'Sam' });
  });

  test('status words and cursor spots', () => {
    const agents = Object.values(readAgentPresence(new Map([[7, serverState]])));
    expect(agentStatus(agents[0])).toBe('Reading Notes');
    expect(agentStatus(agents[1])).toBe('typing');
    const win = { x: 100, y: 100, w: 400, h: 300 };
    expect(agentCursorPoint(agents[1], win)).toEqual({ x: 140, y: 342 });
    expect(agentCursorPoint(agents[0], win)).toEqual({ x: 300, y: 156 });
  });
});

describe('typing', () => {
  test('steps toward the total and catches up faster when far behind', () => {
    expect(stepTyping(0, 5, 5)).toBe(1);
    expect(stepTyping(0, 2000, 240)).toBe(1760 + 10);
    expect(stepTyping(5, 5, 5)).toBe(5);
  });

  test('shows only what has been typed', () => {
    expect(typedText('Hello there', 11, 5)).toBe('Hello');
    expect(typedText('Hello there', 11, 11)).toBe('Hello there');
    expect(typedText('there', 2000, 10)).toBe('');
  });
});

describe('AgentCursors', () => {
  test('draws a named cursor for each agent at its window', () => {
    const agents = readAgentPresence(new Map([[7, serverState]]));
    const wins = [{ id: 'doc-1', x: 0, y: 0, w: 300, h: 200 }, { id: 'chat-2', x: 500, y: 0, w: 300, h: 200 }];
    render(<AgentCursors agents={agents} wins={wins} zoom={1} />);
    const cursors = screen.getAllByTestId('agent-cursor');
    expect(cursors.map((c) => c.getAttribute('data-agent'))).toEqual(['atlas', 'nexus']);
    expect(screen.getByText('Atlas')).toBeTruthy();
    expect(screen.getByText('Reading Notes')).toBeTruthy();
    expect(screen.getAllByTestId('agent-cursor-typed')).toHaveLength(1);
  });

  test('draws nothing when the agent window is not on this board', () => {
    const agents = readAgentPresence(new Map([[7, serverState]]));
    const { container } = render(<AgentCursors agents={agents} wins={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('latest words', () => {
  test('long answers show their newest words', async () => {
    const { latestWords } = await import('../src/lib/collaboration/agentPresence.js');
    expect(latestWords('short')).toBe('short');
    const long = latestWords('one two three four five six seven eight nine ten', 20);
    expect(long.startsWith('…')).toBe(true);
    expect(long.endsWith('nine ten')).toBe(true);
  });
});
