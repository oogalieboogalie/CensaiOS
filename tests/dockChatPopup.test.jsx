/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/chat.js', () => ({
  sendMessageWithMeta: jest.fn(),
}));

const { Toolbar } = await import('../src/app/Toolbar.jsx');
const { sendMessageWithMeta } = await import('../src/lib/chat.js');

const THREADS_KEY = 'homebase.messenger.v1';

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

function openPopup() {
  renderDock();
  fireEvent.click(screen.getByTitle('Chat (C)'));
  return screen.getByTestId('dock-chat-popup');
}

beforeEach(() => {
  window.localStorage.removeItem(THREADS_KEY);
  sendMessageWithMeta.mockReset();
});

describe('dock messenger popup', () => {
  test('chat button opens a pick-agent popup with the family roster', () => {
    const popup = openPopup();
    expect(popup).toBeInTheDocument();
    expect(popup).toHaveTextContent('Pick an agent above to start chatting.');
    for (const name of ['Atlas', 'Censai', 'Genesis', 'Echo']) {
      expect(screen.getByRole('button', { name: `Chat with ${name}` })).toBeInTheDocument();
    }
  });

  test('picking an agent shows its thread box', () => {
    openPopup();
    fireEvent.click(screen.getByRole('button', { name: 'Chat with Atlas' }));
    expect(screen.getByLabelText('Message Atlas')).toBeInTheDocument();
    expect(screen.getByLabelText('Send message')).toBeInTheDocument();
  });

  test('sending appends both messages and persists the thread', async () => {
    sendMessageWithMeta.mockResolvedValue({ text: 'Hi, Alex!' });
    openPopup();
    fireEvent.click(screen.getByRole('button', { name: 'Chat with Atlas' }));
    fireEvent.change(screen.getByLabelText('Message Atlas'), { target: { value: 'hello there' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    expect(await screen.findByText('hello there')).toBeInTheDocument();
    expect(await screen.findByText('Hi, Alex!')).toBeInTheDocument();
    expect(sendMessageWithMeta).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(window.localStorage.getItem(THREADS_KEY));
    expect(stored.atlas).toHaveLength(2);
  });

  test('send failures surface an inline error instead of crashing', async () => {
    sendMessageWithMeta.mockRejectedValue(new Error('offline'));
    openPopup();
    fireEvent.click(screen.getByRole('button', { name: 'Chat with Atlas' }));
    fireEvent.change(screen.getByLabelText('Message Atlas'), { target: { value: 'hello?' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  test('close button dismisses the popup', () => {
    openPopup();
    fireEvent.click(screen.getByLabelText('Close chat'));
    expect(screen.queryByTestId('dock-chat-popup')).not.toBeInTheDocument();
  });
});
