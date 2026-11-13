/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import { afterUpdaterStarted, launchUpdater, openUpdaterLink, UPDATER_DOWN, UPDATER_LINK } from '../src/lib/appUpdate/startUpdater.js';
import { startUpdaterProcess, updaterScript } from '../server/appUpdate/startUpdater.js';

function repoWithScript() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'start-updater-'));
  const scripts = path.join(repo, 'scripts');
  fs.mkdirSync(scripts);
  const script = path.join(scripts, 'auto-update.ps1');
  fs.writeFileSync(script, '# test\n');
  return { repo, script };
}

describe('starting the updater from the update panel', () => {
  test('the desktop app is asked first, then this PC, then the sign-in link', async () => {
    const invoke = jest.fn(async () => {});
    const start = jest.fn(async () => ({ started: true }));
    const open = jest.fn();
    expect(await launchUpdater({ invoke, start, open })).toBe('app');
    expect(start).not.toHaveBeenCalled();

    invoke.mockRejectedValue(new Error('no'));
    expect(await launchUpdater({ invoke, start, open })).toBe('server');
    expect(open).not.toHaveBeenCalled();

    start.mockResolvedValue({ started: false });
    expect(await launchUpdater({ invoke, start, open })).toBe('windows');
    expect(open).toHaveBeenCalledWith(UPDATER_LINK);

    expect(await launchUpdater({
      invoke: null,
      start: async () => { throw new Error('linux'); },
      open,
    })).toBe('windows');
  });

  test('the sign-in link is opened with a click, then the link is removed', () => {
    const clicks = [];
    const real = document.createElement.bind(document);
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = real(tag);
      if (tag === 'a') el.click = () => clicks.push(el.getAttribute('href'));
      return el;
    });
    openUpdaterLink();
    expect(clicks).toEqual([UPDATER_LINK]);
    expect(document.querySelector('a')).toBeNull();
    spy.mockRestore();
  });

  test('after it starts, a heartbeat or a changed running commit is enough', async () => {
    const sleep = async () => {};
    const watching = { watching: true, running: 'aaa' };
    expect(await afterUpdaterStarted({ read: async () => watching, sleep, tries: 3 })).toBe(watching);
    const swapped = await afterUpdaterStarted({
      read: async () => ({ watching: false, running: 'bbb' }), sleep, before: 'aaa', tries: 3,
    });
    expect(swapped.swapped).toBe(true);
    let reads = 0;
    const none = await afterUpdaterStarted({
      read: async () => { reads += 1; return { watching: false, running: 'aaa' }; },
      sleep, before: 'aaa', tries: 2,
    });
    expect(none).toBeNull();
    expect(reads).toBe(2);
    expect(await afterUpdaterStarted({ read: async () => watching, sleep, alive: () => false })).toBeNull();
  });

  test('the panel tells Start apart from other failures by a fixed code', () => {
    expect(UPDATER_DOWN).toBe('updater-not-running');
  });
});

describe('this PC can start the updater only on Windows', () => {
  test('Linux, including the app inside Docker, does not start a program', () => {
    const spawnFn = jest.fn();
    expect(startUpdaterProcess({ platform: 'linux', repo: '/repo', spawnFn, script: '/repo/scripts/auto-update.ps1' })).toEqual({ started: false });
    expect(spawnFn).not.toHaveBeenCalled();
    expect(startUpdaterProcess({ platform: 'win32', repo: '/missing', spawnFn, script: null })).toEqual({ started: false });
  });

  test('Windows starts the hidden updater in the censaiOS folder', () => {
    const { repo, script } = repoWithScript();
    expect(updaterScript(repo)).toBe(script);
    expect(updaterScript(path.join(repo, 'nope'))).toBeNull();
    const child = { unref: jest.fn() };
    const spawnFn = jest.fn(() => child);
    expect(startUpdaterProcess({ platform: 'win32', repo, spawnFn })).toEqual({ started: true });
    expect(spawnFn).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script],
      expect.objectContaining({ cwd: repo, windowsHide: true, detached: true, stdio: 'ignore' }),
    );
    expect(child.unref).toHaveBeenCalled();
  });
});
