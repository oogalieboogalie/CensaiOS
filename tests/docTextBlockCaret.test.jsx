/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { DocTextBlock } from '../src/components/office/docs/DocTextBlock.jsx';

const editor = { bindFocused: jest.fn(), setText: jest.fn(), onKeyDown: jest.fn(), onPaste: jest.fn(), focus: jest.fn() };

test('a teammate typing earlier in the paragraph keeps your caret where you were typing', () => {
  const text = 'Made-up plan for the bake sale';
  const block = (t) => ({ type: 'p', text: t });
  const { rerender } = render(<DocTextBlock id="b1" block={block(text)} focused editor={editor} />);
  const box = screen.getByRole('textbox');
  box.focus();
  const at = text.indexOf('bake') + 4;
  box.setSelectionRange(at, at);
  rerender(<DocTextBlock id="b1" block={block(`Sam: ${text}`)} focused editor={editor} />);
  const moved = screen.getByRole('textbox');
  expect(moved.value).toBe(`Sam: ${text}`);
  expect(moved.value.slice(0, moved.selectionStart)).toMatch(/bake$/);
});
