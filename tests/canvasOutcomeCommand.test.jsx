/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { CanvasOutcomeCommand, buildOutcomePrompt } from '../src/components/canvas/CanvasOutcomeCommand.jsx';

test('the outcome command submits the built prompt plus the raw text', () => {
  const onSubmit = jest.fn();
  render(<CanvasOutcomeCommand onSubmit={onSubmit} />);
  fireEvent.change(screen.getByPlaceholderText('Tell CensaiOS what you want done…'), {
    target: { value: 'Ship the beta onboarding flow' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start with Censai' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith(
    expect.stringContaining('Ship the beta onboarding flow'),
    'Ship the beta onboarding flow',
  );
});

test('the submit button stays disabled while the input is empty', () => {
  render(<CanvasOutcomeCommand onSubmit={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Start with Censai' })).toBeDisabled();
});

test('buildOutcomePrompt returns empty for blank input', () => {
  expect(buildOutcomePrompt('   ')).toBe('');
  expect(buildOutcomePrompt('Ship it')).toContain('Ship it');
});
