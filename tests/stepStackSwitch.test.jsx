/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { StepStack } from '../src/components/windows/stepCards/StepStack.jsx';

const step = (id, title, done = false) => ({ id, title, text: '', done, checks: [{ id: `${id}-c`, kind: 'ask', words: `${title} is done`, state: done ? 'passed' : 'open', line: '' }] });
const card = (id, steps) => ({ id, title: id, steps });
const sc = { busy: null, send: jest.fn(), check: jest.fn(), setReport: jest.fn() };

afterEach(() => jest.useRealTimers());

test('opening another card right after a step finishes shows that card\'s open step', () => {
  jest.useFakeTimers();
  const paint = (firstDone) => card('paint', [step('p1', 'Made-up buy the paint', firstDone), step('p2', 'Made-up paint the sign')]);
  const shelf = card('shelf', [step('s1', 'Made-up find the screws'), step('s2', 'Made-up fix the shelf')]);
  const { rerender } = render(<StepStack card={paint(false)} sc={sc} />);
  rerender(<StepStack card={paint(true)} sc={sc} />);
  rerender(<StepStack card={shelf} sc={sc} />);
  expect(screen.getByRole('heading', { name: 'Made-up find the screws' })).toBeTruthy();
  expect(screen.queryByText('Made-up buy the paint')).toBeNull();
  act(() => { jest.advanceTimersByTime(2000); });
  expect(screen.getByRole('button', { name: 'Check this step' })).toBeTruthy();
});
