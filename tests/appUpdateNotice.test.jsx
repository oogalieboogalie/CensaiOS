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
const { unseenUpdate, updateSummary, versionLabel } = await import('../src/lib/appUpdate/version.js');

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
  test('after an update the note says the new version number and what changed, once', async () => {
    window.localStorage.clear();
    const landed = { version: '0.7.1360', running: 'b'.repeat(40), updated: { version: '0.7.1360', fromVersion: '0.7.1359', at: AT, changes: ['fix: the header', 'feat: a new window'] }, ready: null, watching: true, checked: { at: AT, result: 'up-to-date' } };
    await shown(landed);
    const note = screen.getByTestId('app-updated-note');
    expect(note).toHaveTextContent('Updated to censaiOS 0.7.1360');
    expect(note).toHaveTextContent('Updated from 0.7.1359 with 2 changes.');
    expect(note).toHaveTextContent('fix: the header');
    expect(note).toHaveTextContent('feat: a new window');

    await act(async () => { fireEvent.click(screen.getByText('OK')); });
    expect(screen.queryByTestId('app-updated-note')).toBeNull();
    // It does not come back for this version, and comes back for the next one.
    expect(unseenUpdate(landed)).toBeNull();
    expect(unseenUpdate({ version: '0.7.1361', updated: { version: '0.7.1361', changes: [] } })).toMatchObject({ version: '0.7.1361' });
  });

  test('a waiting update is named by its number', async () => {
    window.localStorage.clear();
    await shown({ ready: { commit: 'b'.repeat(40), version: '0.7.1361', changes: ['Fix the header'] }, watching: true, version: '0.7.1360', checked: { at: AT, result: 'ready' } });
    expect(screen.getByTestId('app-update-notice')).toHaveTextContent('censaiOS 0.7.1361 is downloaded');
  });

  test('the words around the number', () => {
    expect(versionLabel('0.7.1360')).toBe('censaiOS 0.7.1360');
    expect(versionLabel('')).toBe('');
    expect(updateSummary({ changes: ['a'] })).toBe('Updated with 1 change.');
    expect(updateSummary({ fromVersion: '0.7.1', changes: [] })).toBe('Updated from 0.7.1.');
    // No number for the running copy means nothing to announce.
    expect(unseenUpdate({ version: null, updated: { version: '0.7.2', changes: [] } })).toBeNull();
  });

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

  test('a failed download is its own screen in the panel, and is not announced unasked', () => {
    expect(panelStage({ checked: { at: AT, result: 'download-failed' } }, null)).toBe('download-failed');
    expect(STAGE_TEXT['download-failed']).toMatch(/could not download/);
    // A laptop that is offline for an hour should not get a notice about it.
    expect(updatesPaused({ checked: { result: 'download-failed' } })).toBe(false);
  });

  test('the tray panel names the side branch too, and a ready update wins over paused', () => {
    expect(panelStage({ checked: { at: AT, result: 'side-branch' } }, null)).toBe('side-branch');
    expect(updatesPaused({ checked: { result: 'side-branch' } })).toBe(true);
    expect(updatesPaused({ ready: { commit: 'b' }, checked: { result: 'side-branch' } })).toBe(false);
    expect(updatesPaused({ checked: { result: 'up-to-date' } })).toBe(false);
  });
});
