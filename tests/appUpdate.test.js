import fs from 'fs';
import os from 'os';
import path from 'path';
import { updateStatus, requestRestart, requestCheck } from '../server/appUpdate/index.js';

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
    expect(updateStatus({ dir: null })).toEqual({ ready: null, running: null, watching: false, requested: false, checking: false, checked: null });
  });

  test('a built update newer than the running app is ready', () => {
    const dir = makeDir({
      'running.txt': OLD,
      'ready.json': { commit: NEW, builtAt: '2026-10-15T15:00:00Z', changes: ['Fix the terminal', ' ', 'Board map minimize'] },
      'watcher.json': beat(),
    });
    expect(updateStatus({ dir })).toEqual({
      ready: { commit: NEW, builtAt: '2026-10-15T15:00:00Z', changes: ['Fix the terminal', 'Board map minimize'] },
      running: OLD,
      watching: true,
      requested: false,
      checking: false,
      checked: null,
    });
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

  test('an unknown result reads as up to date and a bad time as never looked', () => {
    expect(updateStatus({ dir: makeDir({ 'checked.json': { at: '2026-10-17T23:00:05Z', result: 'rm -rf' } }) }).checked.result).toBe('up-to-date');
    expect(updateStatus({ dir: makeDir({ 'checked.json': { at: 'soon' } }) }).checked).toBeNull();
  });

  test('refuses when the updater is not running', () => {
    const dir = makeDir({ 'running.txt': NEW });
    expect(() => requestCheck({ dir })).toThrow('updater is not running');
    expect(fs.existsSync(path.join(dir, 'check-requested'))).toBe(false);
  });
});
