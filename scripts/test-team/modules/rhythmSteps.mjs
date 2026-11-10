// Steps the Rhythm Run test-team module shares with its red team: pick a
// song, play it with the window's own keys, stop, and read what each screen
// shows. All names are made up.

import { windowFrame } from '../../e2e/board.mjs';

export const SONG = { id: 'night-drive', title: 'Night Drive' };
export const DIFFICULTY = 'Easy';
// Night Drive is about 35 seconds; the results card follows a moment later.
export const SONG_MS = 50_000;

export const rhythmOf = (page, id) => windowFrame(page, id).getByTestId('rhythm-run');
export const squish = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export const phaseOf = (page, id) => rhythmOf(page, id).getAttribute('data-phase').catch(() => null);

/** Picks the song and difficulty on this person's menu (they are per screen, not shared). */
export async function pickSong(page, id, song = SONG, difficulty = DIFFICULTY) {
  const rhythm = rhythmOf(page, id);
  await rhythm.getByTestId(`rhythm-song-${song.id}`).click({ timeout: 10_000 });
  await rhythm.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: difficulty, exact: true }).click();
}

/** Waits until this person's window is in this phase ("menu", "playing", "results"). */
export async function waitPhase(page, id, phase, ms = 10_000) {
  const until = Date.now() + ms;
  for (;;) {
    const now = await phaseOf(page, id);
    if (now === phase) return true;
    if (Date.now() > until) return false;
    await page.waitForTimeout(250);
  }
}

/**
 * Plays the running song the way a steady player does: when a note reaches
 * the line, D F J or K goes down on the window and comes back up. The keys
 * are sent to the window itself, so they go through its own key handling.
 * Reads the run from the dev-build hook (`__hbRhythm`). Stops with stopPlaying.
 */
export async function startPlaying(page, id) {
  await page.evaluate((wid) => {
    const KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
    const flags = (window.__madeUpPlayer ||= {});
    flags[wid] = true;
    const sent = new Set();
    const target = () => document.querySelector(`[data-win-id="${wid}"] [data-testid="rhythm-run"]`);
    const send = (type, code) => target()?.dispatchEvent(new KeyboardEvent(type, { code, key: code.slice(3).toLowerCase(), bubbles: true, cancelable: true }));
    let run = null;
    const tick = () => {
      if (!flags[wid]) return;
      const hook = globalThis.__hbRhythm?.[wid];
      if (hook && hook.live !== run) { run = hook.live; sent.clear(); }
      if (hook && run) {
        const t = hook.now();
        for (const note of run.run.chart) {
          if (sent.has(note.id) || run.run.hit.has(note.id)) continue;
          if (note.t - t > 0.02) break;
          if (t - note.t > 0.12) { sent.add(note.id); continue; }
          sent.add(note.id);
          send('keydown', KEYS[note.lane]);
          send('keyup', KEYS[note.lane]);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, id);
}

export async function stopPlaying(page, id) {
  await page.evaluate((wid) => { if (window.__madeUpPlayer) window.__madeUpPlayer[wid] = false; }, id).catch(() => {});
}

/** Escape on the window: the window's own "stop" key. */
export async function pressEscape(page, id) {
  await page.evaluate((wid) => {
    document.querySelector(`[data-win-id="${wid}"] [data-testid="rhythm-run"]`)
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }, id);
}

/** Names in the "Playing now" list on this person's screen. */
export async function playingNow(page, id) {
  const list = rhythmOf(page, id).getByTestId('rhythm-live');
  if (!(await list.isVisible().catch(() => false))) return [];
  return list.locator('.hb-game-board-name').allInnerTexts().catch(() => []);
}

/** Waits until "Playing now" on this screen does (or, with `want` false, does not) list this name. */
export async function seesPlaying(page, id, name, want = true, ms = 10_000) {
  const until = Date.now() + ms;
  for (;;) {
    const names = await playingNow(page, id);
    if (names.includes(name) === want) return true;
    if (Date.now() > until) return false;
    await page.waitForTimeout(300);
  }
}

/** The best-score table under the menu as "name grade score" rows. */
export async function boardRows(page, id) {
  return rhythmOf(page, id).locator('aside [data-testid="rhythm-board"] li').evaluateAll((rows) => rows.map((li) => {
    const part = (sel) => (li.querySelector(sel)?.textContent || '').trim();
    return `${part('.hb-game-board-name')} ${part('.hb-rhythm-grade')} ${part('.hb-game-num')}`;
  })).catch(() => []);
}

/** Waits until the best-score table on this screen has a row for every name. */
export async function boardShows(page, id, names, ms = 10_000) {
  const until = Date.now() + ms;
  for (;;) {
    const rows = await boardRows(page, id);
    if (names.every((n) => rows.some((r) => r.startsWith(`${n} `)))) return rows;
    if (Date.now() > until) return null;
    await page.waitForTimeout(300);
  }
}
