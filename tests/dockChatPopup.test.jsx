/**
 * @jest-environment jsdom
 */
// The dock's chat button now opens Censai's pinned chat (the old pick-an-
// agent popup grew into it). Same threads key, same send pipe.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/chat.js', () => ({
  sendMessageWithMeta: jest.fn(),
}));
jest.unstable_mockModule('../src/lib/api/agentActivity.js', () => ({
  getMailActivity: jest.fn(),
  getAgentActivity: jest.fn(),
}));

const { CensaiPinnedChat } = await import('../src/components/censai/CensaiPinnedChat.jsx');
const { toggleCensaiChat } = await import('../src/components/censai/usePinnedChat.js');
const { sendMessageWithMeta } = await import('../src/lib/chat.js');
const { getMailActivity } = await import('../src/lib/api/agentActivity.js');

const THREADS_KEY = 'homebase.messenger.v1';
const PINNED_KEY = 'homebase.censai.pinned.v1';

function openChat() {
  render(<CensaiPinnedChat workspaceId="ws-1" />);
  fireEvent.click(screen.getByLabelText('Open chat with Censai'));
  return screen.getByTestId('censai-pinned-chat');
}

beforeEach(() => {
  window.localStorage.removeItem(THREADS_KEY);
  window.localStorage.removeItem(PINNED_KEY);
  sendMessageWithMeta.mockReset();
  getMailActivity.mockReset();
  getMailActivity.mockResolvedValue([]);
});

describe('Censai pinned chat', () => {
  test('starts as Censai\'s bubble and opens on Censai\'s own thread', () => {
    render(<CensaiPinnedChat workspaceId="ws-1" />);
    expect(screen.queryByTestId('censai-pinned-chat')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Open chat with Censai'));
    expect(screen.getByTestId('censai-pinned-chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Message Censai')).toBeInTheDocument();
    expect(screen.getByText(/hand the specialist work to the family/)).toBeInTheDocument();
  });

  test('the whole family is one tap away', () => {
    openChat();
    for (const name of ['Atlas', 'Genesis', 'Echo', 'Nexus', 'Foundation']) {
      expect(screen.getByRole('button', { name: `Chat with ${name}` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Chat with Atlas' }));
    expect(screen.getByLabelText('Message Atlas')).toBeInTheDocument();
  });

  test('a reply that handed work on says who got it, and the thread persists', async () => {
    sendMessageWithMeta.mockResolvedValue({
      text: 'On it.',
      tools: [{ tool: 'message_to', ok: true, summary: { target: 'nexus' } }],
    });
    openChat();
    fireEvent.change(screen.getByLabelText('Message Censai'), { target: { value: 'set up the leads table' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    expect(await screen.findByText('set up the leads table')).toBeInTheDocument();
    expect(await screen.findByText('Handed to Nexus')).toBeInTheDocument();
    expect(sendMessageWithMeta.mock.calls[0][0]).toBe('censai');
    const stored = JSON.parse(window.localStorage.getItem(THREADS_KEY));
    expect(stored.censai).toHaveLength(2);
    expect(stored.censai[1].handoffs).toEqual([{ agentId: 'nexus', name: 'Nexus' }]);
  });

  test('send failures surface an inline error instead of crashing', async () => {
    sendMessageWithMeta.mockRejectedValue(new Error('offline'));
    openChat();
    fireEvent.change(screen.getByLabelText('Message Censai'), { target: { value: 'hello?' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  test('shrinks back to the bubble and remembers it', () => {
    openChat();
    expect(window.localStorage.getItem(PINNED_KEY)).toBe('open');
    fireEvent.click(screen.getByLabelText('Shrink chat'));
    expect(screen.queryByTestId('censai-pinned-chat')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PINNED_KEY)).toBe('bubble');
  });

  test('the dock toggle event opens and shrinks it', () => {
    render(<CensaiPinnedChat workspaceId="ws-1" />);
    act(() => toggleCensaiChat());
    expect(screen.getByTestId('censai-pinned-chat')).toBeInTheDocument();
    act(() => toggleCensaiChat());
    expect(screen.queryByTestId('censai-pinned-chat')).not.toBeInTheDocument();
  });

  test('Show me around walks through the board one step at a time', () => {
    openChat();
    fireEvent.click(screen.getByRole('button', { name: 'Show me around' }));
    expect(screen.getByTestId('censai-tour')).toHaveAttribute('data-tour-step', 'board');
    const opened = jest.fn();
    window.addEventListener('censai:open-add-palette', opened);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the Add menu' }));
    window.removeEventListener('censai:open-add-palette', opened);
    expect(opened).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('censai-tour')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message Censai')).toBeInTheDocument();
  });

  test('the Family desk shows who Censai handed what and what came back', async () => {
    getMailActivity.mockResolvedValue([
      { id: 2, from_agent: 'nexus', to_agent: 'censai', content: 'Leads table is ready.', created_at: '2026-10-17T10:05:00Z' },
      { id: 1, from_agent: 'censai', to_agent: 'nexus', content: 'Please add a leads table.', created_at: '2026-10-17T10:00:00Z' },
      { id: 0, from_agent: 'atlas', to_agent: 'genesis', content: 'Not about Censai.', created_at: '2026-10-17T09:00:00Z' },
    ]);
    openChat();
    fireEvent.click(screen.getByRole('button', { name: 'Family desk' }));
    expect(await screen.findByText('Leads table is ready.')).toBeInTheDocument();
    expect(screen.getByText('Please add a leads table.')).toBeInTheDocument();
    expect(screen.getByText('Censai to Nexus')).toBeInTheDocument();
    expect(screen.queryByText('Not about Censai.')).not.toBeInTheDocument();
    expect(getMailActivity).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
  });
});
