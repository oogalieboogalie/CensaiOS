/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { SlideNotes } from '../src/components/office/slides/SlideNotes.jsx';

test('a teammate typing earlier in the speaker notes keeps your caret where you were typing', () => {
  const notes = 'Made-up point one. Made-up point two.';
  const { rerender } = render(<SlideNotes notes={notes} onChange={jest.fn()} />);
  const box = screen.getByLabelText('Speaker notes');
  box.focus();
  const at = notes.indexOf('two') + 3;
  box.setSelectionRange(at, at);
  // Sam Example adds words at the very start; Pat's caret must still sit after "two".
  rerender(<SlideNotes notes={`Sam: smile. ${notes}`} onChange={jest.fn()} />);
  const moved = screen.getByLabelText('Speaker notes');
  expect(moved.value.slice(0, moved.selectionStart)).toMatch(/point two$/);
});

test('typing in the notes reports the new words', () => {
  const onChange = jest.fn();
  render(<SlideNotes notes="" onChange={onChange} />);
  const box = screen.getByLabelText('Speaker notes');
  fireEvent.change(box, { target: { value: 'Made-up note' } });
  expect(onChange).toHaveBeenCalledWith('Made-up note');
});
