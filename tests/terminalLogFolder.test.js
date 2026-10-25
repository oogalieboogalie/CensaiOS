import fs from 'fs';
import { folderKind, safeReason } from '../server/terminal/logSafe.js';

describe('terminal start failures keep folders out of the log', () => {
  test('the folder is named by kind only', () => {
    expect(folderKind('C:\\Users\\Pat\\projects\\shop', true, 'C:\\Users\\Pat')).toBe('project');
    expect(folderKind('C:\\Users\\Pat\\', false, 'C:\\Users\\Pat')).toBe('home');
    expect(folderKind('/home/sam', false, '/home/sam')).toBe('home');
    expect(folderKind('D:\\Stuff', false, 'C:\\Users\\Pat')).toBe('other');
    expect(folderKind(undefined, false, '/home/sam')).toBe('other');
  });

  test('a start error loses any folder it repeats', () => {
    const err = new Error("posix_spawnp failed: cwd 'C:\\Users\\Pat\\Documents' not found, tried /home/sam/work");
    const reason = safeReason(err);
    expect(reason).not.toMatch(/Pat|sam|Documents/);
    expect(reason).toMatch(/posix_spawnp failed/);
    expect(safeReason(new Error('docker is not running'))).toBe('docker is not running');
    expect(safeReason(undefined)).toBe('failed');
  });

  test('the start lines no longer pass the folder itself', () => {
    const sessions = fs.readFileSync('server/terminal/sessions.js', 'utf8');
    const backends = fs.readFileSync('server/terminal/backends.js', 'utf8');
    expect(sessions).toMatch(/failed to start any backend', \{ sessionId, folder: folderKind\(cwd, hasProject\)/);
    expect(backends).toMatch(/sandbox backend failed, falling back', \{ folder: folderKind\(cwd, hasProject\)/);
    expect(sessions.split('\n').length).toBeLessThanOrEqual(251);
  });
});
