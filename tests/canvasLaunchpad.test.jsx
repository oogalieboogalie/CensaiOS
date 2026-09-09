/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmptyState } from '../src/components/canvas/CanvasEmptyState.jsx';
import { buildOutcomePrompt } from '../src/components/canvas/CanvasOutcomeCommand.jsx';
import { LAUNCHER_MANIFESTS } from '../src/lib/windowManifest.js';

const starters = LAUNCHER_MANIFESTS
  .filter(manifest => manifest.launcher.startHere)
  .sort((a, b) => a.launcher.startHereOrder - b.launcher.startHereOrder);

test('manifest owns exactly the four expected beta starting points', () => {
  // The manifest data (startHere entries) must stay stable regardless of
  // how the launchpad UI renders them.
  expect(starters.map(m => m.kind)).toEqual([
    'agentDesigner', 'groupChat', 'scheduler', 'marketplace',
  ]);
});

test('launchpad renders the outcome command form and key chrome', () => {
  render(<EmptyState onSpawn={jest.fn()} />);

  // The launchpad container must be present.
  expect(screen.getByTestId('canvas-launchpad')).toBeInTheDocument();

  // Heading is always shown.
  expect(screen.getByRole('heading')).toBeInTheDocument();

  // The outcome input is shown and labelled.
  expect(screen.getByRole('textbox', { name: /what would you like to do/i })).toBeInTheDocument();

  // The submit button ("Start with Censai") is present.
  expect(screen.getByRole('button', { name: /Start with Censai/i })).toBeInTheDocument();

  // Footer hint text is present.
  expect(screen.getByText(/Open a project from the top bar/)).toBeInTheDocument();
});

test('outcome form submit spawns a chat window with the typed prompt', () => {
  const onSpawn = jest.fn();
  render(<EmptyState onSpawn={onSpawn} />);

  const input = screen.getByRole('textbox', { name: /what would you like to do/i });
  const submitBtn = screen.getByRole('button', { name: /Start with Censai/i });

  // Button is disabled while the input is empty.
  expect(submitBtn).toBeDisabled();

  // Type a prompt — button should become enabled.
  fireEvent.change(input, { target: { value: 'help me plan my week' } });
  expect(submitBtn).not.toBeDisabled();

  // Submit — should call onSpawn with the chat window kind and the prompt.
  fireEvent.click(submitBtn);
  expect(onSpawn).toHaveBeenCalledTimes(1);
  const [kind, props] = onSpawn.mock.calls[0];
  expect(kind).toBe('chat');
  expect(props.agentId).toBe('censai');
  expect(props.msgs[0].text).toBe(buildOutcomePrompt('help me plan my week'));
});

test('without a spawn callback the submit button is visibly inert', () => {
  render(<EmptyState />);
  expect(screen.getByRole('button', { name: /Start with Censai/i })).toBeDisabled();
});
