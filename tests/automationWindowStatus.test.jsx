/**
 * @jest-environment jsdom
 *
 * Focused tests for the Automation Board status/error/next-run display.
 * Covers:
 *   - the four required per-row fields render with the right data attributes
 *   - the status mapper (queued | running | done | error | unknown)
 *   - the relative-time formatter across the three contract cases (ISO, null,
 *     invalid) — it must never throw
 *   - error rows get a red border via the theme's --ps-red variable
 *   - empty API response uses the existing empty state, no extra empty tile
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
// eslint-disable-next-line no-unused-vars
import { AutomationRow } from '../src/components/AutomationRow.jsx';
// eslint-disable-next-line no-unused-vars
import { AutomationWindow } from '../src/components/AutomationWindow.jsx';
import { mapStatus, formatRelativeNextRun, resolveCurrentStep } from '../src/lib/automationFormat.js';

describe('AutomationWindow status/error/next-run display', () => {
  test('row renders the four required fields with data attributes', () => {
    render(
      <AutomationRow
        taskName="CensaiJulesQueue"
        info={{
          armed: true,
          state: 'Ready',
          lastTaskResult: 0,
          lastRunTime: '2026-06-22T10:00:00Z',
          nextRunTime: '2030-01-01T00:00:00Z',
          pending: 0,
          dispatched: 0,
          host: 'homebase-dev',
        }}
        onAction={jest.fn()}
      />
    );

    const row = screen.getByTestId('automation-row');
    expect(row).toHaveAttribute('data-task', 'CensaiJulesQueue');
    expect(row).toHaveAttribute('data-status', 'done');
    expect(row).toHaveAttribute('data-current-step', '—');
    expect(row).toHaveAttribute('data-location', 'homebase-dev');
    expect(row.getAttribute('data-next-run')).toMatch(/^in /);
  });

  test('error row uses the red theme border (no hardcoded color)', () => {
    const { container } = render(
      <AutomationRow
        taskName="OpenHubOverseer"
        info={{ state: 'Ready', lastTaskResult: 1, host: 'homebase-dev' }}
        onAction={jest.fn()}
      />
    );
    const row = container.querySelector('[data-testid="automation-row"]');
    expect(row.getAttribute('data-status')).toBe('error');
    const style = row.getAttribute('style') || '';
    expect(style).toContain('var(--ps-red)');
  });

  test('row with pending > 0 reports queued', () => {
    render(
      <AutomationRow
        taskName="CensaiJulesQueue"
        info={{ armed: true, state: 'Ready', lastTaskResult: 0, pending: 3, dispatched: 0, host: 'h' }}
        onAction={jest.fn()}
      />
    );
    expect(screen.getByTestId('automation-row')).toHaveAttribute('data-status', 'queued');
  });

  test('row with state Running reports running', () => {
    render(
      <AutomationRow
        taskName="OpenHubQueue"
        info={{ state: 'Running', lastTaskResult: null, host: 'h' }}
        onAction={jest.fn()}
      />
    );
    expect(screen.getByTestId('automation-row')).toHaveAttribute('data-status', 'running');
  });

  test('row with no state reports unknown', () => {
    render(<AutomationRow taskName="X" info={{}} onAction={jest.fn()} />);
    expect(screen.getByTestId('automation-row')).toHaveAttribute('data-status', 'unknown');
  });

  test('formatRelativeNextRun handles ISO / null / undefined / invalid without throwing', () => {
    const futureIso = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
    expect(formatRelativeNextRun(futureIso)).toMatch(/^in /);
    expect(formatRelativeNextRun(null)).toBe('—');
    expect(formatRelativeNextRun(undefined)).toBe('—');
    expect(formatRelativeNextRun('not-a-date')).toBe('—');
    expect(formatRelativeNextRun('')).toBe('—');
    // never throws on weird inputs
    expect(() => formatRelativeNextRun({})).not.toThrow();
    expect(() => formatRelativeNextRun(NaN)).not.toThrow();
  });

  test('mapStatus covers the five contract states', () => {
    expect(mapStatus({ state: 'Running' })).toBe('running');
    expect(mapStatus({ state: 'Ready', lastTaskResult: 0 })).toBe('done');
    expect(mapStatus({ state: 'Ready', lastTaskResult: 1 })).toBe('error');
    expect(mapStatus({ state: 'Ready', lastTaskResult: 0, pending: 2 })).toBe('queued');
    expect(mapStatus({ state: 'Disabled' })).toBe('done');
    expect(mapStatus({})).toBe('unknown');
  });

  test('resolveCurrentStep prefers currentStep, then metadata.current, then queue fallback', () => {
    expect(resolveCurrentStep({ currentStep: 'scanning' })).toBe('scanning');
    expect(resolveCurrentStep({ metadata: { current: 'planning' } })).toBe('planning');
    expect(resolveCurrentStep({ state: 'Running', pending: 0, dispatched: 2 })).toMatch(/Dispatching/);
    expect(resolveCurrentStep({ pending: 5 })).toMatch(/5 pending/);
    expect(resolveCurrentStep({ state: 'Disabled' })).toBe('Disabled');
    expect(resolveCurrentStep({})).toBe('—');
  });

  test('Run Now button calls onAction', () => {
    const onAction = jest.fn();
    render(
      <AutomationRow
        taskName="CensaiJulesQueue"
        info={{ armed: true, state: 'Ready', lastTaskResult: 0, host: 'h' }}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText('Run Now'));
    expect(onAction).toHaveBeenCalledWith('CensaiJulesQueue', 'run');
  });

  test('empty API response shows existing empty state, not a new tile', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    }));
    const win = { id: 'auto-1', title: 'Automation Board', state: {} };
    render(<AutomationWindow win={win} onUpdate={jest.fn()} />);
    // existing empty copy, unchanged wording
    expect(await screen.findByText('No automation tasks configured.')).toBeInTheDocument();
    expect(screen.queryByTestId('automation-row')).toBeNull();
  });
});
