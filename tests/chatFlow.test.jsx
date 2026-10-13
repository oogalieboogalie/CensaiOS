/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';

function renderBubble(message) {
  return render(
    React.createElement(ChatBubble, { message, index: 0, copied: false, onCopy: jest.fn() })
  );
}

describe('chat flow layout', () => {
  test('user messages sit in a right-aligned bubble', () => {
    const { container } = renderBubble({ from: 'me', text: 'hello there' });
    const row = container.firstChild;
    expect(row).toHaveClass('hb-msg');
    expect(row.dataset.from).toBe('me');
    expect(row.firstChild).toHaveClass('hb-msg-bubble');
    expect(screen.getByText('hello there')).toBeInTheDocument();
  });

  test('agent messages flow with no bubble, held to a reading width', () => {
    const { container } = renderBubble({ from: 'agent', text: 'plain response' });
    const row = container.firstChild;
    expect(row.dataset.from).toBe('agent');
    expect(row.querySelector('.hb-msg-bubble')).toBeNull();
    expect(row.querySelector('.hb-msg-body')).not.toBeNull();
    expect(screen.getByText('plain response')).toBeInTheDocument();
  });

  test('the chat stylesheet keeps agent text at about 72 characters and breaks long words', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/chat.css'), 'utf8');
    const body = /\.hb-msg-body \{([^}]*)\}/.exec(css)[1];
    expect(body).toMatch(/max-width:\s*72ch/);
    expect(body).toMatch(/overflow-wrap:\s*break-word/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  test('hidden messages render as a centered note', () => {
    const { container } = renderBubble({ hidden: true, text: 'system note' });
    expect(container.firstChild).toHaveClass('hb-msg-note');
    expect(screen.getByText('system note')).toBeInTheDocument();
  });

  test('every message gets hover actions; agent replies add retry, branch and send to canvas when wired', () => {
    const onRetry = jest.fn();
    const onBranch = jest.fn();
    const onSend = jest.fn();
    render(React.createElement(ChatBubble, {
      message: { from: 'atlas', text: 'An answer' }, index: 4, copied: false, onCopy: jest.fn(), onRetry, onBranch, onSend,
    }));
    fireEvent.click(screen.getByLabelText('Retry'));
    fireEvent.click(screen.getByLabelText('Branch into a new chat'));
    fireEvent.click(screen.getByLabelText('Send to canvas'));
    expect(onRetry).toHaveBeenCalledWith(4);
    expect(onBranch).toHaveBeenCalledWith(4);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'text', text: 'An answer' }));
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });

  test('fenced code renders a lang header with a working copy button', () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = renderBubble({ from: 'agent', text: '```js\nconst a = 1;\n```' });
    expect(screen.getByText('js')).toBeInTheDocument();
    expect(screen.getByText('const a = 1;')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Copy code'));
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(screen.getByTitle('Copied')).toBeInTheDocument();
    // The block itself is guarded against stretching flex ancestors.
    const block = container.querySelector('pre').parentElement;
    expect(block.style.maxWidth).toBe('100%');
    expect(block.style.minWidth).toBe('0');
  });
});
