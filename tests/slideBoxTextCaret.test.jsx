/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { SlideBoxText } from '../src/components/office/slides/SlideBoxText.jsx';

test('a teammate typing earlier in the box keeps your caret where you were typing', () => {
  const text = 'Made-up launch plan';
  const { rerender } = render(<SlideBoxText text={text} onType={jest.fn()} onDone={jest.fn()} />);
  const box = screen.getByLabelText('Slide text');
  box.focus();
  const at = text.indexOf('launch') + 6;
  box.setSelectionRange(at, at);
  rerender(<SlideBoxText text={`Sam: ${text}`} onType={jest.fn()} onDone={jest.fn()} />);
  const moved = screen.getByLabelText('Slide text');
  expect(moved.value.slice(0, moved.selectionStart)).toMatch(/launch$/);
});

test('each key is saved as you type, and leaving the box ends editing', () => {
  const onType = jest.fn();
  const onDone = jest.fn();
  render(<SlideBoxText text="" onType={onType} onDone={onDone} />);
  const box = screen.getByLabelText('Slide text');
  fireEvent.change(box, { target: { value: 'Made-up words' } });
  expect(onType).toHaveBeenCalledWith('Made-up words');
  fireEvent.blur(box);
  expect(onDone).toHaveBeenCalled();
});
