/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';

function renderBubble(message) {
  return render(
    React.createElement(ChatBubble, { message, index: 0, copied: false, onCopy: jest.fn() })
  );
}

describe('chat flow layout', () => {
  test('user messages sit in a right-aligned padded box', () => {
    const { container } = renderBubble({ from: 'me', text: 'hello there' });
    const row = container.firstChild;
    expect(row.style.justifyContent).toBe('flex-end');
    const box = row.firstChild;
    expect(box.style.background).toBe('var(--surface-2)');
    expect(box.style.borderRadius).toBe('12px');
    expect(box.style.maxWidth).toBe('80%');
    expect(screen.getByText('hello there')).toBeInTheDocument();
  });

  test('agent messages flow with no bubble', () => {
    const { container } = renderBubble({ from: 'agent', text: 'plain response' });
    const row = container.firstChild;
    expect(row.style.justifyContent).toBe('flex-start');
    const body = row.firstChild;
    expect(body.style.background).toBe('transparent');
    // jsdom does not reflect the `border: 'none'` shorthand; assert the
    // bubble tokens are gone via background + full-bleed width instead.
    expect(body.style.border).toBe('');
    expect(body.style.width).toBe('100%');
    expect(body.style.minWidth).toBe('0');
    expect(screen.getByText('plain response')).toBeInTheDocument();
  });

  test('agent text wrapper breaks long words instead of stretching', () => {
    const { container } = renderBubble({ from: 'agent', text: 'ok' });
    const body = container.firstChild.firstChild;
    const textWrap = body.children[1];
    expect(textWrap.style.minWidth).toBe('0');
    expect(textWrap.style.overflowWrap).toBe('break-word');
  });

  test('hidden messages keep the centered pill', () => {
    const { container } = renderBubble({ hidden: true, text: 'system note' });
    const row = container.firstChild;
    expect(row.style.justifyContent).toBe('center');
    expect(row.firstChild.style.borderRadius).toBe('999px');
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
