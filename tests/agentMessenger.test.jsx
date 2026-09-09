/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentMessenger } from '../src/components/messenger/AgentMessenger.jsx';
import { getAgents } from '../src/lib/agentStore.js';

const STORAGE_KEY = 'homebase.messenger.v1';

describe('AgentMessenger', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  test('renders a floating button that opens the family roster', () => {
    render(React.createElement(AgentMessenger));
    const fab = screen.getByTitle('Message the family');
    expect(fab).toBeInTheDocument();
    expect(screen.queryByText('Family')).not.toBeInTheDocument();

    fireEvent.click(fab);
    expect(screen.getByText('Family')).toBeInTheDocument();
    const agents = getAgents();
    expect(agents.length).toBeGreaterThan(0);
    expect(screen.getByTitle(agents[0].name)).toBeInTheDocument();
  });

  test('selecting an agent opens a thread with a draft box', () => {
    render(React.createElement(AgentMessenger));
    fireEvent.click(screen.getByTitle('Message the family'));
    const agents = getAgents();
    fireEvent.click(screen.getByTitle(agents[0].name));
    expect(screen.getByPlaceholderText(`Message ${agents[0].name}…`)).toBeInTheDocument();
  });

  test('persists threads to localStorage', () => {
    render(React.createElement(AgentMessenger));
    // Mount persists the (initially empty) thread map right away.
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({});
    fireEvent.click(screen.getByTitle('Message the family'));
    expect(() => JSON.parse(window.localStorage.getItem(STORAGE_KEY))).not.toThrow();
  });
});
