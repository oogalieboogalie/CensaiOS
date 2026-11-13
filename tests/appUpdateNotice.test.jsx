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
const restart = jest.fn(async () => ({}));
const launchUpdater = jest.fn(async () => 'app');
const afterUpdaterStarted = jest.fn(async () => ({ watching: false }));
jest.unstable_mockModule('../src/lib/appUpdate/api.js', () => ({
  appUpdateApi: { status, restart, check: jest.fn(), inFlight: jest.fn(), start: jest.fn() },
  changeCount: (changes) => (changes?.length ? `${changes.length} changes` : null),
}));
jest.unstable_mockModule('../src/lib/appUpdate/startUpdater.js', () => ({
  launchUpdater,
  afterUpdaterStarted,
  UPDATER_DID_NOT_START: 'The updater did not start. Open censaiOS with its shortcut once so it can start on its own from then on.',
  UPDATER_DOWN: 'updater-not-running',
  UPDATER_LINK: 'censaios-updater:start',
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

beforeEach(() => {
  jest.useFakeTimers();
  status.mockReset();
  restart.mockReset();
  restart.mockResolvedValue({});
  launchUpdater.mockClear();
  afterUpdaterStarted.mockReset();
  afterUpdaterStarted.mockResolvedValue({ watching: false });
});
afterEach(() => { jest.useRealTimers(); });

describe('the update note', () => {
  test('a built update shows "Update ready"', async () => {
    await shown({ ready: { commit: 'b'.repeat(40), changes: ['Fix the header', 'New window'] }, watching: true, checked: { at: AT, result: 'ready' } });
    expect(screen.getByTestId('app-update-notice')).toHaveTextContent('Update ready');
    expect(screen.getByText('Restart now')).toBeInTheDocument();
    expect(screen.queryByTestId('start-updater')).toBeNull();
    expect(screen.getByTestId('app-update-notice')).toHaveTextContent('when nobody is using censaiOS');
    expect(screen.queryByTestId('app-update-paused')).toBeNull();
  });

  test('while someone is using censaiOS the note says the update waits', async () => {
    await shown({ ready: { commit: 'b'.repeat(40), changes: [] }, watching: true, inUse: true });
    expect(screen.getByTestId('app-update-notice')).toHaveTextContent('Update ready, restarts when you are done');
    expect(screen.getByText('Restart now')).toBeInTheDocument();
  });

  test('a ready update with the updater stopped offers one button to start it', async () => {
    await shown({ ready: { commit: 'b'.repeat(40), changes: [] }, watching: false, running: 'a'.repeat(40) });
    expect(screen.getByTestId('start-updater')).toHaveTextContent('Start the updater');
    expect(screen.queryByText('Restart now')).toBeNull();
    afterUpdaterStarted.mockResolvedValue({ watching: true, ready: { commit: 'b'.repeat(40) } });
    await act(async () => { fireEvent.click(screen.getByTestId('start-updater')); });
    expect(launchUpdater).toHaveBeenCalled();
    expect(restart).toHaveBeenCalled();
    expect(screen.getByTestId('app-update-notice')).toHaveTextContent('Updating censaiOS');
  });

  test('Start the updater says so when it does not come up', async () => {
    await shown({ ready: { commit: 'b'.repeat(40), changes: ['Fix the header'] }, watching: false, running: 'a'.repeat(40) });
    await act(async () => { fireEvent.click(screen.getByTestId('start-updater')); });
    expect(screen.getByRole('alert')).toHaveTextContent('The updater did not start');
    expect(restart).not.toHaveBeenCalled();
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
