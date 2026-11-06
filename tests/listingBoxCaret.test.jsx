/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ListingBox } from '../src/components/realEstate/ListingBox.jsx';

const noop = () => {};

test('a teammate typing earlier in the features keeps your cursor where you were typing', () => {
  const text = 'Fenced yard, new roof';
  const { rerender } = render(<ListingBox multiline aria-label="Features" value={text} onChange={noop} />);
  const box = screen.getByLabelText('Features');
  box.focus();
  const at = text.indexOf('yard') + 4;
  box.setSelectionRange(at, at);
  rerender(<ListingBox multiline aria-label="Features" value={`Sunny porch. ${text}`} onChange={noop} />);
  expect(box.value).toBe(`Sunny porch. ${text}`);
  expect(box.value.slice(0, box.selectionStart)).toMatch(/yard$/);
});

test('a one-line box keeps your cursor too, and shows a number saved by an older board', () => {
  const { rerender } = render(<ListingBox aria-label="Price" value="400,000" onChange={noop} />);
  const box = screen.getByLabelText('Price');
  box.focus();
  box.setSelectionRange(3, 3);
  rerender(<ListingBox aria-label="Price" value="$400,000" onChange={noop} />);
  expect(box.value.slice(0, box.selectionStart)).toBe('$400');
  rerender(<ListingBox aria-label="Price" value={0} onChange={noop} />);
  expect(box.value).toBe('0');
});
