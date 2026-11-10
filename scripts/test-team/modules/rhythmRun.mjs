// Rhythm Run for one and for two. Pat Example opens Rhythm Run from the Add
// menu and finds the song list, a Play button and an empty score table. Pat
// plays Night Drive on Easy with D F J K while Sam Example's screen lists Pat
// under "Playing now"; Pat's results card shows a grade, and the score lands
// on Sam's table. Sam presses "Play together", Pat joins from the invite, both
// play at once and see each other, and Escape takes each off the other's
// list. The score is still on both tables after a reload. Bug hunt: an invite
// while the results card is up, both pressing "Play together" at the same
// moment. The red team lives in rhythmRunRedTeam.mjs. All names are made up.

import { openBoard } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';
import { runRhythmRedTeam } from './rhythmRunRedTeam.mjs';
import {
  DIFFICULTY, SONG, SONG_MS, boardRows, boardShows, phaseOf, pickSong, pressEscape, rhythmOf,
  seesPlaying, squish, startPlaying, stopPlaying, waitPhase,
} from './rhythmSteps.mjs';

export default {
  id: 'rhythmRun',
  label: 'Rhythm Run: play alone, then together',
  async run(t) {
    const { pat, sam, check } = t;
    let win;
    let patScore = '';

    await check('walk', 'Pat opens Rhythm Run from the Add menu and sees the songs and an empty score table', async ({ shot }) => {
      const opened = await addFromMenu(pat.page, 'Rhythm Run');
      if (opened.kind !== 'rhythmRun') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}`);
      win = opened.id;
      const rhythm = rhythmOf(pat.page, win);
      await rhythm.getByTestId('rhythm-play').waitFor({ timeout: 15_000 });
      const songs = await rhythm.getByRole('radiogroup', { name: 'Song' }).getByRole('radio').count();
      const board = squish(await rhythm.getByTestId('rhythm-board').innerText());
      await shot(pat.page, 'pat-opens-rhythm-run');
      if (songs < 4) throw new Error(`the song list has ${songs} choices (three songs and "Your own track" expected)`);
      if (!/No scores yet/.test(board)) throw new Error(`the score table reads "${board.slice(0, 120)}"`);
      return `the window opens on the menu with ${songs} song choices, Play, and "No scores yet"`;
    });

    await check('walk', `Pat plays ${SONG.title} on ${DIFFICULTY}: Sam's screen lists Pat under "Playing now"`, async ({ shot }) => {
      await pickSong(pat.page, win);
      await rhythmOf(pat.page, win).getByTestId('rhythm-play').click();
      await startPlaying(pat.page, win);
      if (!(await waitPhase(pat.page, win, 'playing'))) throw new Error(`after Play the window is "${await phaseOf(pat.page, win)}"`);
      const seen = await seesPlaying(sam.page, win, 'Pat Example', true, 15_000);
      await sideBySide(t, 'pat-plays-sam-watches', shot);
      if (!seen) throw new Error('Sam\'s "Playing now" list never showed Pat');
      return 'Pat\'s window is playing and Sam\'s "Playing now" lists Pat Example';
    });

    await check('walk', 'the song ends on Pat\'s results card with a grade, and Sam\'s table shows Pat\'s score', async ({ shot }) => {
      const done = await waitPhase(pat.page, win, 'results', SONG_MS);
      await stopPlaying(pat.page, win);
      if (!done) throw new Error(`the song never ended: the window is "${await phaseOf(pat.page, win)}"`);
      const rhythm = rhythmOf(pat.page, win);
      const grade = squish(await rhythm.getByTestId('rhythm-grade').innerText());
      patScore = squish(await rhythm.getByTestId('rhythm-score').innerText());
      await pickSong(sam.page, win);
      const rows = await boardShows(sam.page, win, ['Pat Example']);
      await sideBySide(t, 'pat-results-sam-table', shot);
      if (!/^[SA]$/.test(grade)) throw new Error(`a steady player hitting every note got grade "${grade}" (score ${patScore})`);
      if (!rows) throw new Error(`Sam's table reads ${JSON.stringify(await boardRows(sam.page, win))}`);
      if (!rows.some((r) => r === `Pat Example ${grade} ${patScore}`)) throw new Error(`Sam's table reads ${JSON.stringify(rows)}, not Pat's ${grade} ${patScore}`);
      return `Pat's card says ${grade} with ${patScore} points, and Sam's table reads "${rows.join('; ')}"`;
    });

    await check('hunt', 'Sam presses "Play together" while Pat\'s results card is up: Pat is still offered Join', async ({ shot }) => {
      await rhythmOf(sam.page, win).getByTestId('rhythm-together').click();
      const invite = rhythmOf(pat.page, win).getByTestId('rhythm-invite');
      const offered = await invite.waitFor({ timeout: 4_000 }).then(() => true, () => false);
      await shot(pat.page, 'pat-results-when-sam-starts');
      // Let Sam's countdown pass and stop Sam, so the walk starts clean.
      await waitPhase(sam.page, win, 'playing');
      await pressEscape(sam.page, win);
      await waitPhase(sam.page, win, 'menu');
      await rhythmOf(pat.page, win).getByRole('button', { name: 'Pick another song' }).click({ timeout: 5_000 }).catch(() => {});
      await pat.page.waitForTimeout(6_500);
      if (!offered) throw new Error('Pat\'s screen showed no invite or Join while the results card was up; the invite only shows on the menu, so Pat missed the match');
      return 'Pat\'s results screen offered Join for Sam\'s match';
    });

    await check('walk', 'Sam presses "Play together": Pat sees the invite, joins, and both see each other playing', async ({ shot }) => {
      await waitPhase(pat.page, win, 'menu', 5_000);
      await pickSong(sam.page, win);
      await rhythmOf(sam.page, win).getByTestId('rhythm-together').click();
      const invite = rhythmOf(pat.page, win).getByTestId('rhythm-invite');
      await invite.waitFor({ timeout: 5_000 });
      const said = squish(await invite.innerText());
      await rhythmOf(pat.page, win).getByTestId('rhythm-join').click();
      await Promise.all([startPlaying(pat.page, win), startPlaying(sam.page, win)]);
      const playing = await Promise.all([waitPhase(pat.page, win, 'playing'), waitPhase(sam.page, win, 'playing')]);
      const each = await Promise.all([seesPlaying(pat.page, win, 'Sam Example', true, 15_000), seesPlaying(sam.page, win, 'Pat Example', true, 15_000)]);
      await sideBySide(t, 'both-playing-together', shot);
      if (!/Sam Example is starting Night Drive \(Easy\) for everyone/.test(said)) throw new Error(`Pat's invite says "${said}"`);
      if (!playing.every(Boolean)) throw new Error(`playing: Pat ${playing[0]}, Sam ${playing[1]}`);
      if (!each.every(Boolean)) throw new Error(`Pat sees Sam playing: ${each[0]}; Sam sees Pat playing: ${each[1]}`);
      return `Pat's invite said "${said.replace(/ Join$/, '')}"; both play and each lists the other under "Playing now"`;
    });

    await check('walk', 'Escape stops each one and takes them off the other\'s "Playing now"', async () => {
      await Promise.all([stopPlaying(pat.page, win), stopPlaying(sam.page, win)]);
      await pressEscape(pat.page, win);
      const patMenu = await waitPhase(pat.page, win, 'menu', 5_000);
      const patGone = await seesPlaying(sam.page, win, 'Pat Example', false, 8_000);
      await pressEscape(sam.page, win);
      const samMenu = await waitPhase(sam.page, win, 'menu', 5_000);
      const samGone = await seesPlaying(pat.page, win, 'Sam Example', false, 8_000);
      if (!patMenu || !samMenu) throw new Error(`after Escape Pat is "${await phaseOf(pat.page, win)}", Sam is "${await phaseOf(sam.page, win)}"`);
      if (!patGone) throw new Error('Sam\'s "Playing now" still lists Pat after Pat stopped');
      if (!samGone) throw new Error('Pat\'s "Playing now" still lists Sam after Sam stopped');
      return 'both are back on the menu and "Playing now" is empty on both screens';
    });

    await check('walk', 'after a reload both still see Pat\'s score, and a stopped song left no score behind', async ({ shot }) => {
      await Promise.all([openBoard(pat.page, t.workspaceId, t.web), openBoard(sam.page, t.workspaceId, t.web)]);
      await Promise.all([pat, sam].map((p) => rhythmOf(p.page, win).getByTestId('rhythm-play').waitFor({ timeout: 20_000 })));
      await Promise.all([pickSong(pat.page, win), pickSong(sam.page, win)]);
      const kept = await Promise.all([pat, sam].map((p) => boardShows(p.page, win, ['Pat Example'], 20_000)));
      await shot(sam.page, 'sam-after-reload');
      if (!kept.every(Boolean)) throw new Error(`after the reload: Pat ${kept[0] ? 'has' : 'lost'} the score, Sam ${kept[1] ? 'has' : 'lost'} it`);
      if (!kept[1].some((r) => r.endsWith(` ${patScore}`))) throw new Error(`Sam's table reads ${JSON.stringify(kept[1])}, not Pat's ${patScore}`);
      if (kept[1].some((r) => r.startsWith('Sam Example '))) throw new Error(`Sam stopped mid-song but the table reads ${JSON.stringify(kept[1])}`);
      return `both tables read "${kept[1].join('; ')}" after the reload`;
    });

    await check('hunt', 'both press "Play together" at the same moment: both end up playing the same song', async ({ shot }) => {
      await Promise.all([pat, sam].map((p) => rhythmOf(p.page, win).getByTestId('rhythm-together').click({ timeout: 5_000 })));
      const playing = await Promise.all([waitPhase(pat.page, win, 'playing', 12_000), waitPhase(sam.page, win, 'playing', 12_000)]);
      const titles = await Promise.all([pat, sam].map((p) => rhythmOf(p.page, win).locator('.hb-rhythm-now .hb-game-title').innerText().catch(() => '')));
      await sideBySide(t, 'both-press-play-together', shot);
      await Promise.all([pressEscape(pat.page, win), pressEscape(sam.page, win)]);
      await Promise.all([waitPhase(pat.page, win, 'menu', 5_000), waitPhase(sam.page, win, 'menu', 5_000)]);
      if (!playing.every(Boolean)) throw new Error(`playing: Pat ${playing[0]}, Sam ${playing[1]}`);
      if (squish(titles[0]) !== squish(titles[1])) throw new Error(`Pat plays "${squish(titles[0])}", Sam plays "${squish(titles[1])}"`);
      return `both play "${squish(titles[0])}" and Escape stops both`;
    });

    await runRhythmRedTeam(t, () => win);
  },
};
