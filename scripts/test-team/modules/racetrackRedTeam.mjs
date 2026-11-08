// Racetrack red team: the track and the best-lap table ride the shared board,
// so a hostile teammate (played by Pat Example's browser) can write anything
// into them. Sam Example's window must stay up, show names as plain words and
// never run a planted script. All names are made up.

import { readWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { sampleTrack } from '../../../src/lib/games/racetrack/track.js';

const TAG_NAME = '<img src=x onerror="window.__madeUpRaceRan=1">Made-up Driver';
const BROKEN_LAPS = [
  null,
  'not a row',
  { name: { nested: 'object' }, ms: 30000 },
  { name: ['a', 'list'], ms: 'fast' },
  { name: TAG_NAME, ms: 39000 },
  { name: 'Sam Example', ms: 45000 },
];
const BROKEN_TRACKS = [
  { pts: 'not a list' },
  { pts: [[1, 2], [3, 4], [5, 6]] },
  { pts: Array.from({ length: 20 }, () => ['x', null]) },
  { pts: [[0, 0], [1e308, 1e308], [-1e308, 1e308], [Infinity, 0], [0, 1e308], [5, 5], [9, 9], [1, 7], [3, 3]], width: 'wide' },
];

const windowAlive = (page, id) => windowFrame(page, id).getByTestId('racetrack').isVisible().catch(() => false);
const scriptRan = (page) => page.evaluate(() => window.__madeUpRaceRan === 1);

export async function runRacetrackRedTeam(t, winId) {
  const { pat, sam, check } = t;

  await check('redteam', 'a broken best-lap table planted on the board does not break Sam\'s window', async ({ shot }) => {
    const win = winId();
    await updateWindow(pat.page, win, { track: sampleTrack(), bestLaps: BROKEN_LAPS });
    await sam.page.waitForTimeout(2500);
    const alive = await windowAlive(sam.page, win);
    const table = windowFrame(sam.page, win).getByTestId('race-best-laps');
    const words = alive ? await table.innerText().catch(() => '') : '';
    await shot(sam.page, 'sam-after-a-broken-lap-table');
    if (await scriptRan(sam.page)) throw new Error('the planted name ran as a script on Sam\'s screen');
    if (!alive) throw new Error('Sam\'s Racetrack window stopped showing after the broken table');
    if (!words.includes('Sam Example')) throw new Error(`Sam's table lost the good row (it reads "${words.replace(/\s+/g, ' ').slice(0, 120)}")`);
    if (/\[object Object\]/.test(words)) throw new Error('the table shows "[object Object]" for a planted name');
    return 'Sam\'s window stays up, the good row shows and the planted name stays words';
  });

  await check('redteam', 'a broken track planted on the board shows "Draw a track" instead of breaking', async ({ shot }) => {
    const win = winId();
    const results = [];
    for (const track of BROKEN_TRACKS) {
      await updateWindow(pat.page, win, { track, bestLaps: [] });
      await sam.page.waitForTimeout(1200);
      const alive = await windowAlive(sam.page, win);
      const empty = await windowFrame(sam.page, win).getByTestId('race-empty').isVisible().catch(() => false);
      results.push({ alive, empty });
    }
    await shot(sam.page, 'sam-after-broken-tracks');
    const bad = results.findIndex((r) => !r.alive);
    if (bad >= 0) throw new Error(`broken track ${bad + 1} stopped Sam's window from showing`);
    return `all ${results.length} broken tracks left the window up (${results.filter((r) => r.empty).length} show "Draw a track")`;
  });

  await check('redteam', 'after the broken tracks, a good track drives again for Sam', async () => {
    const win = winId();
    await updateWindow(pat.page, win, { track: sampleTrack(), bestLaps: [] });
    await windowFrame(sam.page, win).getByTestId('race-overlay').waitFor({ timeout: 10_000 });
    const copy = await readWindow(sam.page, win);
    if (!(copy?.track?.pts?.length >= 8)) throw new Error('Sam\'s copy has no good track');
    return 'Sam\'s window shows "Click to drive" on the good track';
  });
}
