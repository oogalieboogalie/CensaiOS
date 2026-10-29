/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { GitDiffWindow } from '../src/components/windows/gitDiff/index.jsx';

function Harness() {
  const [win, setWin] = React.useState({ id: 'gd1' });
  return <GitDiffWindow win={win} onUpdate={(p) => setWin((w) => ({ ...w, ...p }))} />;
}

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [] }) }));
});

test('typing the old version keeps the editor open until Compare', async () => {
  render(<Harness />);
  await act(async () => {});
  fireEvent.change(screen.getByTestId('gdv-before'), { target: { value: 'M' } });
  expect(screen.getByTestId('gdv-after')).toBeTruthy();
  fireEvent.change(screen.getByTestId('gdv-after'), { target: { value: 'Made-up new line' } });
  fireEvent.click(screen.getByTestId('gdv-compare'));
  expect(screen.queryByTestId('gdv-before')).toBeNull();
  expect(screen.getAllByText(/Made-up new line/).length).toBeGreaterThan(0);
});
