// Asteroids for one and for two. Pat Example opens Asteroids from the Add
// menu and finds "Click to play" with an empty high-score table; Pat plays
// (the ship really moves) and Sam Example's screen says "Pat Example is
// playing" with a Join button. Sam joins and both screens count two ships;
// Escape hands the keyboard back. A high score saved on the board shows on
// Sam's table, and both keep it after a reload. Bug hunt: both press play at
// the same moment, and Leave match. The red team lives in
// asteroidsRedTeam.mjs. All names are made up.

import { openBoard, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';
import { runAsteroidsRedTeam } from './asteroidsRedTeam.mjs';

const shipsSeen = (page, id) => page.evaluate((wid) => {
  const picture = globalThis.__hbAsteroids?.[wid]?.latest?.();
  return picture ? picture.ships.map((s) => ({ name: s.name, x: s.x, y: s.y })) : [];
}, id);
const roleOf = (page, id) => windowFrame(page, id).getByTestId('asteroids').getAttribute('data-game-role').catch(() => null);

/** Waits until this person's screen draws this many ships. */
async function seesShips(page, id, count, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await shipsSeen(page, id)).length === count) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Holds the up arrow for a while; returns how far this person's own ship went. */
async function thrust(page, id, name, holdMs = 1200) {
  const mine = async () => (await shipsSeen(page, id)).find((s) => s.name === name);
  const from = await mine();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(holdMs);
  await page.keyboard.up('ArrowUp');
  const to = await mine();
  return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : -1;
}

export default {
  id: 'asteroids',
  label: 'Asteroids: play alone, then together',
  async run(t) {
    const { pat, sam, check } = t;
    let win;

    await check('walk', 'Pat opens Asteroids from the Add menu and sees "Click to play"', async ({ shot }) => {
      const opened = await addFromMenu(pat.page, 'Asteroids');
      if (opened.kind !== 'asteroids') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}`);
      win = opened.id;
      const frame = windowFrame(pat.page, win);
      await frame.getByTestId('game-play').waitFor({ timeout: 10_000 });
      const board = await frame.getByTestId('game-leaderboard').innerText();
      await shot(pat.page, 'pat-opens-asteroids');
      if (!/No scores yet/.test(board)) throw new Error(`the high-score table reads "${board.replace(/\s+/g, ' ')}"`);
      return 'the window opens on "Click to play" with "No scores yet. Be the first."';
    });

    await check('walk', 'Pat plays: the ship moves and Sam\'s screen says "Pat Example is playing"', async ({ shot }) => {
      await windowFrame(pat.page, win).getByTestId('game-play').click();
      await pat.page.waitForTimeout(600);
      const moved = await thrust(pat.page, win, 'Pat Example');
      const bar = windowFrame(sam.page, win).getByTestId('game-watch-bar');
      const said = await bar.innerText({ timeout: 10_000 }).catch(() => '');
      await sideBySide(t, 'pat-plays-sam-watches', shot);
      if (!(moved > 20)) throw new Error(`Pat's ship moved ${Math.round(moved)} units holding the up arrow`);
      if (!/Pat Example is playing/.test(said)) throw new Error(`Sam's screen says "${said.replace(/\s+/g, ' ')}"`);
      return `Pat's ship went ${Math.round(moved)} units and Sam's screen says "${said.replace(/\s+/g, ' ').trim()}"`;
    });

    await check('walk', 'Sam presses Join: both screens draw two ships and Sam\'s ship moves', async ({ shot }) => {
      await windowFrame(sam.page, win).getByTestId('game-join').click();
      await sam.page.waitForTimeout(600);
      const both = await Promise.all([seesShips(pat.page, win, 2), seesShips(sam.page, win, 2)]);
      const moved = await thrust(sam.page, win, 'Sam Example');
      await sideBySide(t, 'both-playing', shot);
      if (!both.every(Boolean)) throw new Error(`two ships on Pat's screen: ${both[0]}, on Sam's: ${both[1]}`);
      if (!(moved > 20)) throw new Error(`Sam's ship moved ${Math.round(moved)} units holding the up arrow`);
      return `both screens draw two ships, and Sam's went ${Math.round(moved)} units`;
    });

    await check('walk', 'Escape hands the keyboard back and shows "Resume"', async () => {
      await pat.page.keyboard.press('Escape');
      const frame = windowFrame(pat.page, win);
      const label = await frame.getByTestId('game-play').innerText({ timeout: 5_000 }).catch(() => '');
      if (label !== 'Resume') throw new Error(`the button says "${label}"`);
      return 'the card is back with "Resume" while the match carries on';
    });

    await check('walk', 'Leave match: Sam\'s screen goes back to a game nobody is in', async () => {
      await Promise.all([pat, sam].map((p) => p.page.keyboard.press('Escape').catch(() => {})));
      for (const p of [sam, pat]) {
        await windowFrame(p.page, win).getByRole('button', { name: 'Leave match' }).last().click({ timeout: 5_000 });
        await p.page.waitForTimeout(800);
      }
      const roles = await Promise.all([roleOf(pat.page, win), roleOf(sam.page, win)]);
      if (!roles.every((r) => r === 'idle')) throw new Error(`after leaving, Pat is "${roles[0]}" and Sam is "${roles[1]}"`);
      return 'both are out of the match and see the game card again';
    });

    await check('walk', 'a high score saved on the board shows on Sam\'s table and both keep it after a reload', async ({ shot }) => {
      await updateWindow(pat.page, win, { match: null, highScores: [{ name: 'Pat Example', score: 4321, wave: 2, at: Date.now() }] });
      const table = windowFrame(sam.page, win).getByTestId('game-leaderboard');
      const live = await table.getByText('4,321').waitFor({ timeout: 10_000 }).then(() => true, () => false);
      await Promise.all([openBoard(pat.page, t.workspaceId, t.web), openBoard(sam.page, t.workspaceId, t.web)]);
      const kept = await Promise.all([pat, sam].map((p) => windowFrame(p.page, win).getByTestId('game-leaderboard')
        .getByText('4,321').waitFor({ timeout: 15_000 }).then(() => true, () => false)));
      await shot(sam.page, 'sam-sees-the-high-score-after-reload');
      if (!live) throw new Error('Sam\'s table never showed the score');
      if (!kept.every(Boolean)) throw new Error(`after the reload: Pat ${kept[0] ? 'has' : 'lost'} it, Sam ${kept[1] ? 'has' : 'lost'} it`);
      return 'Sam\'s table shows "Pat Example 4,321", on both screens after a reload';
    });

    await check('hunt', 'both press play at the same moment: one match with both ships in it', async ({ shot }) => {
      await Promise.all([pat, sam].map((p) => windowFrame(p.page, win).getByTestId('game-play').click({ timeout: 5_000 }).catch(() => {})));
      await pat.page.waitForTimeout(1500);
      // Whoever lost the race either joined already or is offered Join.
      for (const p of [pat, sam]) {
        if ((await roleOf(p.page, win)) === 'idle') {
          await windowFrame(p.page, win).getByTestId('game-join').click({ timeout: 5_000 }).catch(() => {});
        }
      }
      const both = await Promise.all([seesShips(pat.page, win, 2), seesShips(sam.page, win, 2)]);
      const roles = await Promise.all([roleOf(pat.page, win), roleOf(sam.page, win)]);
      await sideBySide(t, 'both-press-play-at-once', shot);
      if (roles.filter((r) => r === 'host').length !== 1) throw new Error(`roles after the race: Pat "${roles[0]}", Sam "${roles[1]}"`);
      if (!both.every(Boolean)) throw new Error(`two ships on Pat's screen: ${both[0]}, on Sam's: ${both[1]}`);
      return `one match: Pat is ${roles[0]}, Sam is ${roles[1]}, and both screens draw two ships`;
    });

    await check('hunt', 'the one hosting leaves mid-match: the other is not stuck in a dead game', async () => {
      const roles = await Promise.all([roleOf(pat.page, win), roleOf(sam.page, win)]);
      const [hostP, otherP] = roles[0] === 'host' ? [pat, sam] : [sam, pat];
      await hostP.page.keyboard.press('Escape').catch(() => {});
      await windowFrame(hostP.page, win).getByRole('button', { name: 'Leave match' }).last().click({ timeout: 5_000 });
      const until = Date.now() + 10_000;
      let role = await roleOf(otherP.page, win);
      while (role !== 'idle' && Date.now() < until) { await otherP.page.waitForTimeout(300); role = await roleOf(otherP.page, win); }
      await otherP.page.keyboard.press('Escape').catch(() => {});
      if (role !== 'idle') throw new Error(`10 seconds later the other player is still "${role}"`);
      return 'the other player is let go and sees the game card again';
    });

    await runAsteroidsRedTeam(t, () => win);
  },
};
