import { parseAnsi, stripAnsi } from '../src/components/docker/ansi.jsx';
import { friendlyError, logLevel, uptimeLabel, isFailing } from '../src/components/docker/dockerApi.js';

test('parseAnsi splits colour runs and resets', () => {
  const runs = parseAnsi('\u001b[1;34mdir\u001b[0m file \u001b[32mok');
  expect(runs).toEqual([
    { text: 'dir', style: { bold: true, fg: 4 } },
    { text: ' file ', style: {} },
    { text: 'ok', style: { fg: 2 } },
  ]);
  expect(stripAnsi('\u001b[31merr\u001b[0m \u001b]0;title\u0007x')).toBe('err x');
});

test('logLevel reads markers before falling back to the stream', () => {
  expect(logLevel({ text: 'WARN slow query', stream: 'stderr' })).toBe('warn');
  expect(logLevel({ text: '\u001b[36mdebug\u001b[0m ping', stream: 'stdout' })).toBe('debug');
  expect(logLevel({ text: 'db timeout', stream: 'stderr' })).toBe('error');
  expect(logLevel({ text: 'GET / 200', stream: 'stdout' })).toBe('info');
});

test('friendlyError adds what to do next', () => {
  expect(friendlyError('remove homebase_pgdata: volume is in use')).toMatch(/Remove the containers that use it first/);
  expect(friendlyError('something odd')).toBe('something odd');
});

test('uptime and failing helpers', () => {
  expect(uptimeLabel({ status: 'Up 5 hours (healthy)' })).toBe('5 hours');
  expect(uptimeLabel({ status: 'Exited (1) 3 hours ago' })).toBe('exit 1 · 3 hours ago');
  expect(isFailing({ state: 'exited', status: 'Exited (1) 3 hours ago' })).toBe(true);
  expect(isFailing({ state: 'exited', status: 'Exited (0) 3 hours ago' })).toBe(false);
});
