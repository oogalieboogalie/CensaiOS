/**
 * @jest-environment jsdom
 */
// A chat with no key for its model asks for one right in the chat (awe and
// polish list, fix 1), instead of "try again shortly".
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/chat.js', () => ({
  sendMessageWithMeta: jest.fn(),
}));

const { Toolbar } = await import('../src/app/Toolbar.jsx');
const { sendMessageWithMeta } = await import('../src/lib/chat.js');
const { ChatRequestError } = await import('../src/lib/chatErrors.js');
const { KeyNeededCard } = await import('../src/components/chat/KeyNeededCard.jsx');
const { ChatBubble } = await import('../src/components/chat/ChatBubble.jsx');
const { keyChoicesFor, needsKey } = await import('../src/lib/chat/keyNeeded.js');

const keyError = (keyProvider, message) => new ChatRequestError(message, {
  status: 400, code: 'MODEL_KEY_MISSING', details: { code: 'MODEL_KEY_MISSING', keyProvider },
});

beforeEach(() => {
  window.localStorage.clear();
  sendMessageWithMeta.mockReset();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
});

describe('which errors ask for a key', () => {
  test('missing, turned down and required keys ask; other errors do not', () => {
    expect(needsKey({ code: 'MODEL_KEY_MISSING' })).toBe(true);
    expect(needsKey({ code: 'MODEL_KEY_REJECTED' })).toBe(true);
    expect(needsKey({ code: 'MODEL_ACCESS_PERSONAL_KEY_REQUIRED' })).toBe(true);
    expect(needsKey({ code: 'CHAT_REQUEST_FAILED' })).toBe(false);
    expect(needsKey(null)).toBe(false);
  });

  test('a known provider is offered alone; no provider offers Claude, OpenAI and OpenRouter', () => {
    expect(keyChoicesFor('openai').map(c => c.id)).toEqual(['openai']);
    expect(keyChoicesFor(null).map(c => c.short)).toEqual(['Claude', 'OpenAI', 'OpenRouter']);
  });
});

describe('the key card', () => {
  test('saves the pasted key for the picked provider, then sends again', async () => {
    const onSaved = jest.fn();
    render(<KeyNeededCard agentName="Censai" message="No AI is set up for this chat yet." onSaved={onSaved} />);
    expect(screen.getByText('Add a key to talk to Censai')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }));
    fireEvent.change(screen.getByLabelText('OpenAI key'), { target: { value: '  sk-test  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and send' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('openai'));
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/keys');
    expect(JSON.parse(init.body)).toMatchObject({ provider: 'openai', apiKey: 'sk-test' });
  });

  test('a save that fails says so and keeps the card', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: 'Unauthorized' }) }));
    const onSaved = jest.fn();
    render(<KeyNeededCard keyProvider="anthropic" message="m" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Anthropic (Claude) key'), { target: { value: 'sk-ant-x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The key was not saved: Unauthorized');
    expect(onSaved).not.toHaveBeenCalled();
  });

  test('a chat reply with a key error shows the card, and saving retries that message', async () => {
    const onRetry = jest.fn();
    const message = { from: 'censai', text: 'This chat runs on OpenAI, and no OpenAI key is saved yet.', error: { code: 'MODEL_KEY_MISSING', keyProvider: 'openai' } };
    render(<ChatBubble message={message} index={1} isLast agent={{ id: 'censai', name: 'Censai' }} onRetry={onRetry} />);
    expect(screen.getByTestId('chat-key-needed')).toHaveTextContent('This chat runs on OpenAI');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('OpenAI key'), { target: { value: 'sk-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and send' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledWith(1));
  });

  test('older key errors further up the chat stay plain text', () => {
    const message = { from: 'censai', text: 'No AI is set up for this chat yet.', error: { code: 'MODEL_KEY_MISSING' } };
    render(<ChatBubble message={message} index={1} isLast={false} agent={{ id: 'censai', name: 'Censai' }} />);
    expect(screen.queryByTestId('chat-key-needed')).not.toBeInTheDocument();
    expect(screen.getByText('No AI is set up for this chat yet.')).toBeInTheDocument();
  });
});

describe('the dock messenger', () => {
  test('asks for the key, then sends the same message again once it is saved', async () => {
    sendMessageWithMeta
      .mockRejectedValueOnce(keyError(null, 'No AI is set up for this chat yet.'))
      .mockResolvedValueOnce({ text: 'Hello from Atlas' });
    render(<Toolbar activeTool="select" onSelectTool={jest.fn()} penColor="#EF4444" setPenColor={jest.fn()} penSize={4} setPenSize={jest.fn()} focusMode={false} onAiAgent={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Chat (C)'));
    fireEvent.click(screen.getByRole('button', { name: 'Chat with Atlas' }));
    fireEvent.change(screen.getByLabelText('Message Atlas'), { target: { value: 'hello?' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    expect(await screen.findByTestId('chat-key-needed')).toHaveTextContent('No AI is set up for this chat yet.');
    fireEvent.change(screen.getByLabelText('Anthropic (Claude) key'), { target: { value: 'sk-ant-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and send' }));
    expect(await screen.findByText('Hello from Atlas')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-key-needed')).not.toBeInTheDocument();
    expect(sendMessageWithMeta).toHaveBeenCalledTimes(2);
    expect(sendMessageWithMeta.mock.calls[1][1].map(m => m.text)).toEqual(['hello?']);
  });
});
