import fs from 'fs';
import os from 'os';
import path from 'path';
import { updateStatus, requestRestart, requestCheck, updaterOnDemand } from '../server/appUpdate/index.js';

const NEW = 'b'.repeat(40);
const OLD = 'a'.repeat(40);

function makeDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-update-'));
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return dir;
}

const beat = (msAgo = 0) => ({ pid: 1, at: new Date(Date.now() - msAgo).toISOString() });

describe('app update status', () => {
  test('no folder means nothing to show', () => {
    expect(updateStatus({ dir: null })).toEqual({ ready: null, running: null, version: null, updated: null, watching: false, requested: false, checking: false, checked: null, step: null });
  });

  test('a built update newer than the running app is ready', () => {
    const dir = makeDir({
      'running.txt': OLD,
      'ready.json': { commit: NEW, builtAt: '2026-10-15T15:00:00Z', changes: ['Fix the terminal', ' ', 'Board map minimize'] },
      'watcher.json': beat(),
    });
    expect(updateStatus({ dir })).toEqual({
      ready: { commit: NEW, version: null, builtAt: '2026-10-15T15:00:00Z', changes: ['Fix the terminal', 'Board map minimize'] },
      running: OLD,
      version: null,
      updated: null,
      watching: true,
      requested: false,
      checking: false,
      checked: null,
      step: null,
    });
  });

  test('while a look runs it passes on the step the updater names', () => {
    for (const step of ['looking', 'downloading', 'building']) {
      expect(updateStatus({ dir: makeDir({ 'step.txt': step }) }).step).toBe(step);
    }
    expect(updateStatus({ dir: makeDir({ 'step.txt': '\uFEFFbuilding\r\n' }) }).step).toBe('building');
  });

  test('a step it does not know, or one left behind by an updater that stopped, is not shown', () => {
    expect(updateStatus({ dir: makeDir({ 'step.txt': 'rm -rf' }) }).step).toBeNull();
    expect(updateStatus({ dir: makeDir({}) }).step).toBeNull();
    const dir = makeDir({ 'step.txt': 'building' });
    expect(updateStatus({ dir, now: Date.now() + 44 * 60_000 }).step).toBe('building');
    expect(updateStatus({ dir, now: Date.now() + 46 * 60_000 }).step).toBeNull();
  });

  test('reads files written with a BOM and a lone change string', () => {
    const dir = makeDir({ 'running.txt': `\uFEFF${OLD}\r\n`, 'ready.json': `\uFEFF${JSON.stringify({ commit: NEW, changes: 'One fix' })}` });
    const status = updateStatus({ dir });
    expect(status.running).toBe(OLD);
    expect(status.ready.changes).toEqual(['One fix']);
  });

  test('nothing is ready once the app runs that commit', () => {
    const dir = makeDir({ 'running.txt': NEW, 'ready.json': { commit: NEW } });
    expect(updateStatus({ dir }).ready).toBeNull();
  });

  test('a garbled ready file is ignored', () => {
    expect(updateStatus({ dir: makeDir({ 'ready.json': '{nope' }) }).ready).toBeNull();
    expect(updateStatus({ dir: makeDir({ 'ready.json': { commit: '../../etc' } }) }).ready).toBeNull();
  });

  test('an old heartbeat means the updater is not running', () => {
    expect(updateStatus({ dir: makeDir({ 'watcher.json': beat(5 * 60_000) }) }).watching).toBe(false);
  });
});

describe('restart request', () => {
  test('writes the request for the updater', () => {
    const dir = makeDir({ 'running.txt': OLD, 'ready.json': { commit: NEW }, 'watcher.json': beat() });
    expect(requestRestart({ dir }).requested).toBe(true);
    expect(fs.existsSync(path.join(dir, 'restart-requested'))).toBe(true);
    expect(updateStatus({ dir }).requested).toBe(true);
  });

  test('refuses when nothing is waiting', () => {
    const dir = makeDir({ 'running.txt': NEW, 'watcher.json': beat() });
    expect(() => requestRestart({ dir })).toThrow('no update waiting');
  });

  test('refuses when the updater is not running', () => {
    const dir = makeDir({ 'running.txt': OLD, 'ready.json': { commit: NEW } });
    expect(() => requestRestart({ dir })).toThrow('updater is not running');
    try { requestRestart({ dir }); } catch (err) {
      expect(err.code).toBe('updater-not-running');
      expect(err.statusCode).toBe(409);
    }
    expect(fs.existsSync(path.join(dir, 'restart-requested'))).toBe(false);
  });
});

describe('check now (the tray Update item)', () => {
  test('writes the request and reads back what the updater found', () => {
    const dir = makeDir({ 'running.txt': NEW, 'watcher.json': beat() });
    const asked = requestCheck({ dir, now: new Date('2026-10-17T23:00:00Z') });
    expect(asked.askedAt).toBe('2026-10-17T23:00:00.000Z');
    expect(updateStatus({ dir }).checking).toBe(true);
    fs.rmSync(path.join(dir, 'check-requested'));
    fs.writeFileSync(path.join(dir, 'checked.json'), JSON.stringify({ at: '2026-10-17T23:00:05Z', result: 'docker-off' }));
    expect(updateStatus({ dir }).checked).toEqual({ at: '2026-10-17T23:00:05Z', result: 'docker-off' });
    fs.writeFileSync(path.join(dir, 'checked.json'), JSON.stringify({ at: '2026-10-17T23:00:06Z', result: 'blocked' }));
    expect(updateStatus({ dir }).checked).toEqual({ at: '2026-10-17T23:00:06Z', result: 'blocked' });
  });

  test('a download that failed reads as download-failed, not as up to date', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-update-'));
    fs.writeFileSync(path.join(dir, 'checked.json'), JSON.stringify({ at: '2026-11-21T14:43:44Z', result: 'download-failed' }));
    expect(updateStatus({ dir }).checked).toEqual({ at: '2026-11-21T14:43:44Z', result: 'download-failed' });
  });

  test('the running version number and the last update\'s patch notes are passed on', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-update-'));
    const now = 'a'.repeat(40);
    const next = 'b'.repeat(40);
    fs.writeFileSync(path.join(dir, 'running.txt'), now);
    fs.writeFileSync(path.join(dir, 'running-version.json'), JSON.stringify({ commit: now, version: '0.7.1359' }));
    fs.writeFileSync(path.join(dir, 'updated.json'), JSON.stringify({ commit: now, version: '0.7.1359', fromVersion: '0.7.1358', at: '2026-11-21T15:03:34Z', changes: ['fix: one', ' fix: two '] }));
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ commit: next, version: '0.7.1360', changes: ['fix: three'] }));

    const status = updateStatus({ dir });

    expect(status.version).toBe('0.7.1359');
    expect(status.updated).toEqual({ version: '0.7.1359', fromVersion: '0.7.1358', at: '2026-11-21T15:03:34Z', changes: ['fix: one', 'fix: two'] });
    expect(status.ready.version).toBe('0.7.1360');
  });

  test('a number that belongs to another commit, or is not a number, is not shown', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-update-'));
    fs.writeFileSync(path.join(dir, 'running.txt'), 'a'.repeat(40));
    fs.writeFileSync(path.join(dir, 'running-version.json'), JSON.stringify({ commit: 'c'.repeat(40), version: '0.7.1300' }));
    fs.writeFileSync(path.join(dir, 'updated.json'), JSON.stringify({ commit: 'c'.repeat(40), version: '0.7.1300', changes: [] }));
    expect(updateStatus({ dir })).toMatchObject({ version: null, updated: null });

    fs.writeFileSync(path.join(dir, 'running-version.json'), JSON.stringify({ commit: 'a'.repeat(40), version: '<b>0.7</b>' }));
    expect(updateStatus({ dir }).version).toBeNull();
  });

  test('a PC on a side branch reads as side-branch, not as up to date', () => {
    const dir = makeDir({ 'running.txt': NEW, 'watcher.json': beat() });
    fs.writeFileSync(path.join(dir, 'checked.json'), JSON.stringify({ at: '2026-11-11T17:55:25Z', result: 'side-branch' }));
    expect(updateStatus({ dir }).checked).toEqual({ at: '2026-11-11T17:55:25Z', result: 'side-branch' });
  });

  test('an unknown result reads as up to date and a bad time as never looked', () => {
    expect(updateStatus({ dir: makeDir({ 'checked.json': { at: '2026-10-17T23:00:05Z', result: 'rm -rf' } }) }).checked.result).toBe('up-to-date');
    expect(updateStatus({ dir: makeDir({ 'checked.json': { at: 'soon' } }) }).checked).toBeNull();
  });

  test('refuses when the updater is not running', () => {
    const dir = makeDir({ 'running.txt': NEW });
    expect(() => requestCheck({ dir })).toThrow('updater is not running');
    try { requestCheck({ dir }); } catch (err) {
      expect(err.code).toBe('updater-not-running');
    }
    expect(fs.existsSync(path.join(dir, 'check-requested'))).toBe(false);
  });
});

describe('an updater that only runs when asked (Linux)', () => {
  const env = process.env.CENSAI_UPDATER_ON_DEMAND;
  afterEach(() => {
    if (env === undefined) delete process.env.CENSAI_UPDATER_ON_DEMAND;
    else process.env.CENSAI_UPDATER_ON_DEMAND = env;
  });

  test('is off unless the setting says 1', () => {
    expect(updaterOnDemand({})).toBe(false);
    expect(updaterOnDemand({ CENSAI_UPDATER_ON_DEMAND: 'yes' })).toBe(false);
    expect(updaterOnDemand({ CENSAI_UPDATER_ON_DEMAND: '1' })).toBe(true);
  });

  test('counts as running with no heartbeat at all', () => {
    const dir = makeDir({ 'running.txt': NEW });
    expect(updateStatus({ dir, onDemand: false }).watching).toBe(false);
    expect(updateStatus({ dir, onDemand: true }).watching).toBe(true);
  });

  test('Check and Update now write their request with no heartbeat', () => {
    process.env.CENSAI_UPDATER_ON_DEMAND = '1';
    const dir = makeDir({ 'running.txt': OLD, 'ready.json': { commit: NEW } });
    requestCheck({ dir });
    expect(fs.existsSync(path.join(dir, 'check-requested'))).toBe(true);
    requestRestart({ dir });
    expect(fs.existsSync(path.join(dir, 'restart-requested'))).toBe(true);
  });

  test('without the setting, no heartbeat still means not running', () => {
    delete process.env.CENSAI_UPDATER_ON_DEMAND;
    const dir = makeDir({ 'running.txt': OLD, 'ready.json': { commit: NEW } });
    expect(() => requestCheck({ dir })).toThrow('The updater is not running.');
  });
});
