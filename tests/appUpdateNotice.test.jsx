/**
 * @jest-environment jsdom
 */
// The note at the top of the board about updates (src/components/AppUpdateNotice.jsx):
// "Update ready" when a newer censaiOS is built, and "Updates are paused" when
// none can come in at all, so a stopped updater is never just silence.
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const status = jest.fn();
jest.unstable_mockModule('../src/lib/appUpdate/api.js', () => ({
  appUpdateApi: { status, restart: jest.fn(), check: jest.fn(), inFlight: jest.fn() },
  changeCount: (changes) => (changes?.length ? `${changes.length} changes` : null),
}));
jest.unstable_mockModule('../src/components/TrayUpdatePanel.jsx', () => ({ TrayUpdatePanel: () => null }));

const { AppUpdateNotice } = await import('../src/components/AppUpdateNotice.jsx');
const { panelStage, updatesPaused, STAGE_TEXT } = await import('../src/lib/appUpdate/trayFlow.js');

const AT = '2026-11-11T17:55:25Z';

// The note first looks five seconds after the board opens.
async function shown(found) {
  status.mockResolvedValue(found);
  render(<AppUpdateNotice />);
  await act(async () => { await jest.advanceTimersByTimeAsync(5100); });
}

beforeEach(() => { jest.useFakeTimers(); status.mockReset(); });
afterEach(() => { jest.useRealTimers(); });

describe('the update note', () => {
  test('a built update shows "Update ready"', async () => {
    await shown({ ready: { commit: 'b'.repeat(40), changes: ['Fix the header', 'New window'] }, watching: true, checked: { at: AT, result: 'ready' } });
    expect(screen.getByTestId('app-update-notice')).toHaveTextContent('Update ready');
    expect(screen.getByText('Restart now')).toBeInTheDocument();
    expect(screen.queryByTestId('app-update-paused')).toBeNull();
  });

  test('a PC on a side branch is told updates are paused, instead of nothing', async () => {
    await shown({ ready: null, watching: true, checked: { at: AT, result: 'side-branch' } });
    const note = screen.getByTestId('app-update-paused');
    expect(note).toHaveTextContent('Updates are paused on this PC');
    expect(note).toHaveTextContent('not getting updates');
    fireEvent.click(screen.getByText('OK'));
    expect(screen.queryByTestId('app-update-paused')).toBeNull();
  });

  test('a PC with its own unpushed commits is told the same way', async () => {
    await shown({ ready: null, watching: true, checked: { at: AT, result: 'blocked' } });
    expect(screen.getByTestId('app-update-paused')).toHaveTextContent(STAGE_TEXT.blocked);
  });

  test('up to date shows nothing', async () => {
    await shown({ ready: null, watching: true, checked: { at: AT, result: 'up-to-date' } });
    expect(screen.queryByTestId('app-update-notice')).toBeNull();
    expect(screen.queryByTestId('app-update-paused')).toBeNull();
  });

  test('the tray panel names the side branch too, and a ready update wins over paused', () => {
    expect(panelStage({ checked: { at: AT, result: 'side-branch' } }, null)).toBe('side-branch');
    expect(updatesPaused({ checked: { result: 'side-branch' } })).toBe(true);
    expect(updatesPaused({ ready: { commit: 'b' }, checked: { result: 'side-branch' } })).toBe(false);
    expect(updatesPaused({ checked: { result: 'up-to-date' } })).toBe(false);
  });
});
