// Asteroids red team: the match record and the high-score table ride the
// shared board, so a hostile teammate (played by Pat Example's browser) can
// write anything into them. Sam Example's window must stay up, show names as
// plain words and never run a planted script. All names are made up.

import { updateWindow, windowFrame } from '../../e2e/board.mjs';

const TAG_NAME = '<img src=x onerror="window.__madeUpRockRan=1">Made-up Pilot';
const BROKEN_SCORES = [
  null,
  'not a row',
  { name: { nested: 'object' }, score: 900 },
  { name: ['a', 'list'], score: 'lots' },
  { name: 'No Score Example' },
  { name: TAG_NAME, score: 800 },
  { name: 'Sam Example', score: 700 },
];
const BROKEN_MATCHES = [
  'not a match',
  { host: { nested: 'object' }, hostName: { nested: 'object' }, startedAt: 'soon' },
  { host: 'made-up-host', hostName: ['a', 'list'], startedAt: Date.now() + 60_000 },
  { host: 'made-up-host', hostName: TAG_NAME, startedAt: Date.now() + 60_000 },
];

const windowAlive = (page, id) => windowFrame(page, id).getByTestId('asteroids').isVisible().catch(() => false);
const scriptRan = (page) => page.evaluate(() => window.__madeUpRockRan === 1);

export async function runAsteroidsRedTeam(t, winId) {
  const { pat, sam, check } = t;

  await check('redteam', 'a broken high-score table planted on the board does not break Sam\'s window', async ({ shot }) => {
    const win = winId();
    await updateWindow(pat.page, win, { match: null, highScores: BROKEN_SCORES });
    await sam.page.waitForTimeout(2500);
    const alive = await windowAlive(sam.page, win);
    const words = alive ? await windowFrame(sam.page, win).getByTestId('game-leaderboard').innerText().catch(() => '') : '';
    await shot(sam.page, 'sam-after-a-broken-score-table');
    if (await scriptRan(sam.page)) throw new Error('the planted name ran as a script on Sam\'s screen');
    if (!alive) throw new Error('Sam\'s Asteroids window stopped showing after the broken table');
    if (!words.includes('Sam Example')) throw new Error(`Sam's table lost the good row (it reads "${words.replace(/\s+/g, ' ').slice(0, 120)}")`);
    if (/\[object Object\]|NaN|undefined/.test(words)) throw new Error(`the table shows junk: "${words.replace(/\s+/g, ' ').slice(0, 160)}"`);
    return 'Sam\'s window stays up, the good row shows and the planted name stays words';
  });

  await check('redteam', 'a broken match planted on the board does not break Sam\'s window', async ({ shot }) => {
    const win = winId();
    const results = [];
    for (const match of BROKEN_MATCHES) {
      await updateWindow(pat.page, win, { match, highScores: [] });
      await sam.page.waitForTimeout(1200);
      const alive = await windowAlive(sam.page, win);
      const words = alive ? await windowFrame(sam.page, win).innerText().catch(() => '') : '';
      results.push({ alive, junk: /\[object Object\]/.test(words) });
    }
    await shot(sam.page, 'sam-after-broken-matches');
    if (await scriptRan(sam.page)) throw new Error('a planted player name ran as a script on Sam\'s screen');
    const dead = results.findIndex((r) => !r.alive);
    if (dead >= 0) throw new Error(`broken match ${dead + 1} stopped Sam's window from showing`);
    const junk = results.findIndex((r) => r.junk);
    if (junk >= 0) throw new Error(`broken match ${junk + 1} shows "[object Object]" as a name`);
    return `all ${results.length} broken matches left the window up with names as plain words`;
  });

  await check('redteam', 'after the broken records, Sam can still start a game', async () => {
    const win = winId();
    await updateWindow(pat.page, win, { match: null, highScores: [] });
    const play = windowFrame(sam.page, win).getByTestId('game-play');
    await play.click({ timeout: 10_000 });
    await sam.page.waitForTimeout(800);
    const role = await windowFrame(sam.page, win).getByTestId('asteroids').getAttribute('data-game-role');
    await sam.page.keyboard.press('Escape').catch(() => {});
    await windowFrame(sam.page, win).getByRole('button', { name: 'Leave match' }).last().click({ timeout: 5_000 }).catch(() => {});
    if (role !== 'host') throw new Error(`Sam pressed play and is "${role}"`);
    return 'Sam pressed "Click to play" and a fresh match started';
  });
}
