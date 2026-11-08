// Racetrack for one and for two. Pat Example opens Racetrack from the Add
// menu and finds the "Draw a track" card; asking for a loop from an empty
// board says so in plain words; the sample track shows on Sam Example's
// screen too. Pat drives (the car really moves) and Sam's screen counts two
// on the track; Escape hands the keyboard back. A best lap saved on the board
// shows on Sam's table, and both survive a reload. Bug hunt: both pick the
// sample at once, and both drive at once. The red team lives in
// racetrackRedTeam.mjs. All names are made up.

import { openBoard, readWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';
import { runRacetrackRedTeam } from './racetrackRedTeam.mjs';

const carOf = (page, id) => page.evaluate((wid) => {
  const car = globalThis.__hbRace?.[wid]?.sim?.car;
  return car ? { x: car.x, y: car.y } : null;
}, id);
const hudText = (page, id) => windowFrame(page, id).getByTestId('race-hud').innerText().catch(() => '');

/** Waits until this person's screen says how many are on the track. */
async function seesOnTrack(page, id, count, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await hudText(page, id)).includes(`${count} on track`)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Clicks "Click to drive" and holds the up arrow for a while; returns how far the car went. */
async function drive(page, id, holdMs = 1500) {
  const frame = windowFrame(page, id);
  await frame.getByTestId('race-drive').click({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const from = await carOf(page, id);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(holdMs);
  await page.keyboard.up('ArrowUp');
  const to = await carOf(page, id);
  return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : -1;
}

export default {
  id: 'racetrack',
  label: 'Racetrack: draw a track and race a teammate',
  async run(t) {
    const { pat, sam, check } = t;
    let win;

    await check('walk', 'Pat opens Racetrack from the Add menu and sees "Draw a track"', async ({ shot }) => {
      const opened = await addFromMenu(pat.page, 'Racetrack');
      if (opened.kind !== 'racetrack') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}`);
      win = opened.id;
      await windowFrame(pat.page, win).getByTestId('race-empty').waitFor({ timeout: 10_000 });
      await shot(pat.page, 'pat-opens-racetrack');
      return 'the window opens on the "Draw a track" card with both buttons';
    });

    await check('walk', 'asking for a loop from an empty board says so in plain words', async () => {
      const frame = windowFrame(pat.page, win);
      await frame.getByRole('button', { name: 'Use a loop from the board' }).click();
      const said = await frame.getByRole('status').innerText({ timeout: 5_000 }).catch(() => '');
      if (!/No closed loop/i.test(said)) throw new Error(`it said "${said.slice(0, 80)}"`);
      return `it says "${said}"`;
    });

    await check('walk', 'Pat picks the sample track and Sam sees it, ready to drive', async ({ shot }) => {
      await windowFrame(pat.page, win).getByRole('button', { name: 'Try a sample track' }).click();
      await windowFrame(sam.page, win).getByTestId('race-overlay').waitFor({ timeout: 10_000 });
      const samCopy = await readWindow(sam.page, win);
      await sideBySide(t, 'both-see-the-sample-track', shot);
      if (!(samCopy?.track?.pts?.length >= 8)) throw new Error('Sam\'s copy of the window has no track');
      return `Sam's window shows the track (${samCopy.track.pts.length} points) with "Click to drive"`;
    });

    await check('walk', 'Pat drives: the car moves and Sam\'s screen counts two on the track', async ({ shot }) => {
      const moved = await drive(pat.page, win);
      if (!(moved > 20)) throw new Error(`Pat's car moved ${Math.round(moved)} units holding the up arrow`);
      const samSees = await seesOnTrack(sam.page, win, 2);
      await sideBySide(t, 'pat-drives-sam-watches', shot);
      if (!samSees) throw new Error(`Sam's screen says "${(await hudText(sam.page, win)).replace(/\s+/g, ' ')}"`);
      return `Pat's car went ${Math.round(moved)} units and Sam's screen says "2 on track"`;
    });

    await check('walk', 'Escape hands the keyboard back and shows "Keep driving"', async () => {
      await pat.page.keyboard.press('Escape');
      const frame = windowFrame(pat.page, win);
      await frame.getByTestId('race-overlay').waitFor({ timeout: 5_000 });
      const label = await frame.getByTestId('race-drive').innerText();
      if (!/Keep driving|Click to drive/.test(label)) throw new Error(`the button says "${label}"`);
      return `the pit-stop card is back with "${label}"`;
    });

    await check('walk', 'a best lap saved on the board shows on Sam\'s table and both keep it after a reload', async ({ shot }) => {
      await updateWindow(pat.page, win, { bestLaps: [{ name: 'Pat Example', ms: 41234, at: Date.now() }] });
      const table = windowFrame(sam.page, win).getByTestId('race-best-laps');
      const live = await table.getByText('41.234').waitFor({ timeout: 10_000 }).then(() => true, () => false);
      await Promise.all([openBoard(pat.page, t.workspaceId, t.web), openBoard(sam.page, t.workspaceId, t.web)]);
      const kept = await Promise.all([pat, sam].map((p) => windowFrame(p.page, win).getByTestId('race-best-laps')
        .getByText('41.234').waitFor({ timeout: 15_000 }).then(() => true, () => false)));
      await shot(sam.page, 'sam-sees-the-best-lap-after-reload');
      if (!live) throw new Error('Sam\'s table never showed the lap');
      if (!kept.every(Boolean)) throw new Error(`after the reload: Pat ${kept[0] ? 'has' : 'lost'} it, Sam ${kept[1] ? 'has' : 'lost'} it`);
      return 'Sam\'s table shows "Pat Example 41.234", on both screens after a reload';
    });

    await check('hunt', 'both pick the sample track at the same moment: one track, the same on both screens', async () => {
      await updateWindow(pat.page, win, { track: null });
      await windowFrame(sam.page, win).getByTestId('race-empty').waitFor({ timeout: 10_000 });
      await windowFrame(pat.page, win).getByTestId('race-empty').waitFor({ timeout: 10_000 });
      // The first click to land shows the track on both screens, so the other
      // person's button may be gone before their click arrives.
      await Promise.all([pat, sam].map((p) => windowFrame(p.page, win).getByRole('button', { name: 'Try a sample track' })
        .click({ timeout: 3_000 }).catch(() => {})));
      await Promise.all([pat, sam].map((p) => windowFrame(p.page, win).getByTestId('race-overlay').waitFor({ timeout: 10_000 })));
      await pat.page.waitForTimeout(1500);
      const [a, b] = await Promise.all([pat, sam].map((p) => readWindow(p.page, win)));
      if (JSON.stringify(a?.track) !== JSON.stringify(b?.track)) throw new Error('the two screens hold different tracks');
      return 'both screens hold the same track and show "Click to drive"';
    });

    await check('hunt', 'both drive at once: each screen counts two on the track', async ({ shot }) => {
      const moved = await Promise.all([drive(pat.page, win, 1200), drive(sam.page, win, 1200)]);
      const sees = await Promise.all([seesOnTrack(pat.page, win, 2), seesOnTrack(sam.page, win, 2)]);
      await sideBySide(t, 'both-drive-at-once', shot);
      await Promise.all([pat, sam].map((p) => p.page.keyboard.press('Escape')));
      if (!moved.every((m) => m > 20)) throw new Error(`the cars moved ${moved.map(Math.round).join(' and ')} units`);
      if (!sees.every(Boolean)) throw new Error(`"2 on track" on Pat's screen: ${sees[0]}, on Sam's: ${sees[1]}`);
      return 'both cars moved and both screens say "2 on track"';
    });

    await runRacetrackRedTeam(t, () => win);
  },
};
