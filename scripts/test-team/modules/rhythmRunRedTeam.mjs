// Rhythm Run red team: every player's scores and the "play together" match
// ride the shared board, so a hostile teammate (played by Pat Example's
// browser) can write anything into them. Sam Example's window must stay up,
// show names as plain words, never run a planted script, and still play.
// All names are made up.

import { updateWindow } from '../../e2e/board.mjs';
import { pickSong, pressEscape, rhythmOf, squish, waitPhase } from './rhythmSteps.mjs';

const TAG_NAME = '<img src=x onerror="window.__madeUpBeatRan=1">Made-up Drummer';
const KEY = 'night-drive:easy';

/** Broken player records, keyed by the window field each one is planted in. */
export const BROKEN_PLAYERS = {
  player_made_up_null: null,
  player_made_up_text: 'not a player',
  player_made_up_nested: { name: { nested: 'object' }, best: { [KEY]: { score: { lots: 1 }, grade: 'Z' } } },
  player_made_up_list: { name: ['a', 'list'], best: [1, 2, 3], live: 'yes' },
  player_made_up_tag: { name: TAG_NAME, best: { [KEY]: { score: 800, grade: 'A', accuracy: 90, maxCombo: 12, at: 1 } } },
  player_made_up_huge: { name: 'Huge Example', best: { [KEY]: { score: 1e30, grade: 'S', accuracy: 1e9, maxCombo: -5, at: 'soon' } } },
  player_made_up_bad_key: { name: 'Odd Key Example', best: { 'night-drive:impossible': { score: 9 } } },
  player_made_up_live: { name: 'Live Example', best: {}, live: { song: { nested: 'object' }, score: 'lots', combo: NaN, at: Date.now() + 60_000 } },
  player_sam_example: { name: 'Sam Example', best: { [KEY]: { score: 700, grade: 'B', accuracy: 75, maxCombo: 9, at: 1 } }, live: null },
};

/** Broken "play together" matches, planted one at a time. */
export const brokenMatches = (now = Date.now()) => [
  'not a match',
  { song: { nested: 'object' }, difficulty: 'easy', startAt: now + 60_000, by: 'Odd Example' },
  { song: 'night-drive', difficulty: 'impossible', startAt: now + 60_000, by: 'Odd Example' },
  { song: 'night-drive', difficulty: 'easy', startAt: 'soon', by: 'Odd Example' },
  { song: 'night-drive', difficulty: 'easy', startAt: now + 60_000, by: TAG_NAME },
  { song: 'night-drive', difficulty: 'easy', startAt: now + 60_000, by: { nested: 'object' } },
  { song: 'made-up-song', difficulty: 'easy', startAt: now + 60_000, by: 'Odd Example' },
];

const JUNK = /\[object Object\]|NaN|undefined/;
const windowAlive = (page, id) => rhythmOf(page, id).isVisible().catch(() => false);
const scriptRan = (page) => page.evaluate(() => window.__madeUpBeatRan === 1);
const clearPlanted = () => Object.fromEntries(Object.keys(BROKEN_PLAYERS).map((k) => [k, null]));

export async function runRhythmRedTeam(t, winId) {
  const { pat, sam, check } = t;

  await check('redteam', 'broken score records planted on the board do not break Sam\'s window', async ({ shot }) => {
    const win = winId();
    await pickSong(sam.page, win);
    await updateWindow(pat.page, win, { match: null, ...BROKEN_PLAYERS });
    await sam.page.waitForTimeout(2500);
    const alive = await windowAlive(sam.page, win);
    const words = alive ? squish(await rhythmOf(sam.page, win).innerText().catch(() => '')) : '';
    await shot(sam.page, 'sam-after-broken-scores');
    if (await scriptRan(sam.page)) throw new Error('a planted name ran as a script on Sam\'s screen');
    if (!alive) throw new Error('Sam\'s Rhythm Run window stopped showing after the broken records');
    if (!words.includes('Sam Example')) throw new Error(`Sam's table lost the good row (it reads "${words.slice(0, 160)}")`);
    if (JUNK.test(words)) throw new Error(`the window shows junk: "${words.match(JUNK)[0]}" in "${words.slice(0, 200)}"`);
    return 'Sam\'s window stays up, the good row shows and the planted name stays words';
  });

  await check('redteam', 'broken "play together" matches planted on the board do not break Sam\'s window', async ({ shot }) => {
    const win = winId();
    const results = [];
    for (const match of brokenMatches()) {
      await updateWindow(pat.page, win, { match });
      await sam.page.waitForTimeout(1200);
      const alive = await windowAlive(sam.page, win);
      const words = alive ? squish(await rhythmOf(sam.page, win).innerText().catch(() => '')) : '';
      results.push({ alive, junk: (words.match(JUNK) || [])[0] || null });
    }
    await shot(sam.page, 'sam-after-broken-matches');
    if (await scriptRan(sam.page)) throw new Error('a planted starter name ran as a script on Sam\'s screen');
    const dead = results.findIndex((r) => !r.alive);
    if (dead >= 0) throw new Error(`broken match ${dead + 1} stopped Sam's window from showing`);
    const junk = results.findIndex((r) => r.junk);
    if (junk >= 0) throw new Error(`broken match ${junk + 1} shows "${results[junk].junk}"`);
    return `all ${results.length} broken matches left the window up with plain words`;
  });

  await check('redteam', 'Sam presses Join on a planted match for a song that does not exist: no junk on screen', async ({ shot }) => {
    const win = winId();
    await updateWindow(pat.page, win, { match: { song: 'made-up-song', difficulty: 'easy', startAt: Date.now() + 60_000, by: 'Odd Example' } });
    const join = rhythmOf(sam.page, win).getByTestId('rhythm-join');
    const offered = await join.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    if (offered) await join.click();
    await sam.page.waitForTimeout(1000);
    const alive = await windowAlive(sam.page, win);
    const words = alive ? squish(await rhythmOf(sam.page, win).innerText().catch(() => '')) : '';
    await shot(sam.page, 'sam-joins-a-made-up-song');
    if (!alive) throw new Error('Sam\'s window stopped showing after Join');
    if (JUNK.test(words)) throw new Error(`after Join the window shows "${words.match(JUNK)[0]}" (it reads "${words.slice(0, 200)}")`);
    return offered ? 'Join on a song nobody has leaves the window on a plain menu' : 'no Join is offered for a song nobody has';
  });

  await check('redteam', 'after the broken records, Sam can still pick a song and play', async () => {
    const win = winId();
    await updateWindow(pat.page, win, { match: null, ...clearPlanted() });
    await pickSong(sam.page, win);
    await rhythmOf(sam.page, win).getByTestId('rhythm-play').click({ timeout: 10_000 });
    const playing = await waitPhase(sam.page, win, 'playing');
    await pressEscape(sam.page, win);
    await waitPhase(sam.page, win, 'menu', 5_000);
    if (!playing) throw new Error('Sam pressed Play and the song did not start');
    return 'Sam picked Night Drive, pressed Play and the song started';
  });
}
