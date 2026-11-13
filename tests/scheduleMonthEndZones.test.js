// PR 902's month-end cases: a 29th, 30th or 31st clamps to the short month
// and comes back. The calendar is Chicago, so the same instants come out
// when the process zone is UTC and when it is Asia/Tokyo.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const probe = path.join(root, 'tests', 'scheduleMonthEndProbe.mjs');

function run(tz) {
  const env = { ...process.env, TZ: tz };
  delete env.LOCAL_DEV_TIME_ZONE;
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', probe], {
    cwd: root, env, encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const expected = {
  d31: ['2026-02-28 09:30', '2026-03-31 09:30', '2026-04-30 09:30', '2026-05-31 09:30', '2026-06-30 09:30'],
  d30: ['2026-02-28 09:30', '2026-03-30 09:30', '2026-04-30 09:30', '2026-05-30 09:30'],
  d29: ['2026-02-28 09:30', '2026-03-29 09:30', '2026-04-29 09:30', '2026-05-29 09:30'],
  leap31: ['2024-02-29 09:30', '2024-03-31 09:30', '2024-04-30 09:30'],
  leap29: ['2024-02-29 09:30', '2024-03-29 09:30'],
  back: '2026-05-31 09:30',
  catchup: '2026-04-30 09:30',
  plain: ['2026-02-15 09:30', '2026-03-15 09:30', '2026-04-15 09:30'],
  year: '2027-01-31 09:30',
  anchor: [31, 29, null],
  evening: ['2026-02-28 20:00', '2026-03-31 20:00', '2026-04-30 20:00'],
};

test('month-end repeats match on a UTC process and on a Tokyo process', () => {
  const utc = run('UTC');
  const tokyo = run('Asia/Tokyo');
  expect(utc.tz).toBe('UTC');
  expect(tokyo.tz).toBe('Asia/Tokyo');
  expect(utc).toMatchObject(expected);
  expect(tokyo).toMatchObject(expected);
});
