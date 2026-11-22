/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { LOOK_STEPS } from '../src/lib/appUpdate/trayFlow.js';

// The row of steps in the tray's Update panel, and the panel showing it while
// a look runs, when an update is ready, and while one is put in.
const flow = {
  open: true, phase: 'checking', status: null, inFlight: null, error: '', updaterDown: false, waitFor: null,
  looking: null, since: 0, away: false,
  bringUpdaterUp: jest.fn(), close: jest.fn(), restart: jest.fn(), wait: jest.fn(), stopWaiting: jest.fn(),
};
jest.unstable_mockModule('../src/lib/appUpdate/useTrayUpdate.js', () => ({ useTrayUpdate: () => flow }));

const { UpdateSteps, UPDATE_MOTION } = await import('../src/components/UpdateSteps.jsx');
const { TrayUpdatePanel } = await import('../src/components/TrayUpdatePanel.jsx');

// The lines between steps are list items too; only the named steps carry a state.
const states = () => screen.getAllByRole('listitem').filter((li) => li.dataset.state).map((li) => `${li.textContent}:${li.dataset.state}`);
const panel = (over) => {
  Object.assign(flow, { phase: 'checking', status: null, inFlight: null, error: '', updaterDown: false, waitFor: null, looking: null, since: 0, away: false }, over);
  return render(<TrayUpdatePanel />);
};

afterEach(() => { jest.useRealTimers(); });

describe('the row of update steps', () => {
  test('steps before the current one are done, the current one is marked, the rest are to come', () => {
    render(<UpdateSteps steps={LOOK_STEPS} at={2} />);
    expect(states()).toEqual(['Look:done', 'Download:done', 'Build:now', 'Ready:next']);
    expect(screen.getByText('Build').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('update-steps')).toHaveAttribute('data-step', 'building');
    expect(screen.getByText(/This is the long part/)).toBeInTheDocument();
  });

  test('past the last step everything is done and nothing is still moving', () => {
    render(<UpdateSteps steps={LOOK_STEPS} at={LOOK_STEPS.length} />);
    expect(states()).toEqual(['Look:done', 'Download:done', 'Build:done', 'Ready:done']);
    expect(screen.getByTestId('update-steps')).toHaveAttribute('data-step', 'done');
    expect(screen.queryByText(/Looking for/)).not.toBeInTheDocument();
  });

  test('says how long the step has been going once it has been a while, and keeps counting', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    render(<UpdateSteps steps={LOOK_STEPS} at={2} since={Date.now()} />);
    expect(screen.queryByTestId('update-steps-clock')).not.toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(65_000); });
    expect(screen.getByTestId('update-steps-clock')).toHaveTextContent('1 min 05 s so far.');
  });

  test('someone who asked for less motion gets the same row standing still', () => {
    expect(UPDATE_MOTION).toMatch(/prefers-reduced-motion: reduce\) \{ \[data-update-motion\] \{ animation: none !important/);
  });
});

describe('the update panel shows the steps', () => {
  test('while it looks, on the first step until the updater names one', () => {
    panel({ phase: 'checking' });
    expect(states()).toEqual(['Look:now', 'Download:next', 'Build:next', 'Ready:next']);
    expect(screen.getByText('Looking for a newer censaiOS…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('while it looks, on the step the updater names', () => {
    panel({ phase: 'checking', looking: { step: 'building' } });
    expect(states()).toEqual(['Look:done', 'Download:done', 'Build:now', 'Ready:next']);
  });

  test('when an update is ready, every step is done and Update now is offered', () => {
    panel({ phase: 'shown', status: { ready: { commit: 'b'.repeat(40), changes: ['One fix'] }, watching: true }, inFlight: { changes: [], agents: [] } });
    expect(states()).toEqual(['Look:done', 'Download:done', 'Build:done', 'Ready:done']);
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
  });

  test('while the update goes in: putting it in, then waiting for censaiOS to come back', () => {
    const { unmount } = panel({ phase: 'restarting', status: { ready: { commit: 'b'.repeat(40), changes: [] } } });
    expect(states()).toEqual(['Put it in:now', 'Come back:next']);
    unmount();
    panel({ phase: 'restarting', status: { ready: { commit: 'b'.repeat(40), changes: [] } }, away: true });
    expect(states()).toEqual(['Put it in:done', 'Come back:now']);
    expect(screen.getByText(/The board reloads by itself/)).toBeInTheDocument();
  });

  test('when agents are mid-task it says it is waiting for them', () => {
    panel({ phase: 'restarting', status: { ready: { commit: 'b'.repeat(40), changes: [] }, pendingRestart: { waiting: true } } });
    expect(screen.getByText(/Waiting for the agents to finish their task/)).toBeInTheDocument();
  });

  test('up to date stays one plain line, with no steps', () => {
    panel({ phase: 'shown', status: { checked: { at: new Date().toISOString(), result: 'up-to-date' } }, inFlight: { changes: [], agents: [] } });
    expect(screen.getByText('censaiOS is up to date.')).toBeInTheDocument();
    expect(screen.queryByTestId('update-steps')).not.toBeInTheDocument();
  });
});
