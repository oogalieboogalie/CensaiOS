// Music Player: Pat plays a song from a file, pauses it, clicks through the
// visualizer looks, changes the skin; Sam sees the player on the shared board.
// On Auto the skin follows the source: a made-up YouTube link turns it red, a
// made-up Spotify link green, and Sam sees the same song. Then the wrong
// things: a text file named .mp3, an empty link, a link that only mentions
// YouTube, a look-alike YouTube host, a script link, and (red team) a teammate
// planting a script link on the shared player.

import { readWindow, spawnWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { fakeMp3, toneWav } from '../testFiles.mjs';
import { note } from '../report.mjs';

const YOUTUBE_LINK = 'https://www.youtube.com/watch?v=madeUp00001';
const SPOTIFY_LINK = 'https://open.spotify.com/track/madeUp0000000000000002';
const LOOKS = [['scope', 'SCOPE'], ['vu', 'VU METERS'], ['ambience', 'AMBIENCE'], ['swirl', 'SWIRL']];

const lcdSays = (frame) => frame.locator('.hb-music-status').innerText().catch(() => '');

const playingNow = (page) => page.evaluate(() => [...(window.__teamMedia || [])].some((a) => !a.paused && a.currentTime > 0));
async function openLinks(frame) {
  // MENU leads back to the list; the paste box lives on the Stations tab.
  const menu = frame.getByRole('button', { name: 'Library' }).first();
  if (await menu.count()) await menu.click().catch(() => {});
  await frame.getByRole('tab', { name: /^Stations/ }).click();
}

/** Which skin the player wears: its brand name and the source it says it plays. */
async function wears(frame) {
  const brand = (await frame.locator('.hb-music-brand').first().innerText().catch(() => '')).trim();
  const source = await frame.locator('[data-music-device]').first().getAttribute('data-music-device').catch(() => null);
  return { brand, source };
}

async function iframeSrcs(page, frame) {
  return frame.locator('iframe').evaluateAll((list) => list.map((f) => f.getAttribute('src') || '')).catch(() => []);
}

async function pasteLink(page, id, link) {
  const frame = windowFrame(page, id);
  const box = frame.getByPlaceholder('YouTube, Spotify, SoundCloud, song or radio link');
  if (!(await box.count())) await openLinks(frame);
  await box.fill(link);
  await frame.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForTimeout(1200);
}

export default {
  id: 'music',
  label: 'Music Player',
  async run(t) {
    const { pat, sam, check } = t;
    let id;
    await check('walk', 'Pat opens the Music Player', async ({ shot }) => {
      id = await spawnWindow(pat.page, 'music', {}, { x: 80, y: 80 });
      await windowFrame(pat.page, id).waitFor({ state: 'visible', timeout: 15_000 });
      await shot(pat.page, 'pat-opens-music-player');
      return 'the player opened on the board';
    });
    const frame = windowFrame(pat.page, id);

    await check('walk', 'Pat plays a song from a file on this computer', async ({ shot }) => {
      await frame.locator('input[data-music-file-input]').setInputFiles({ name: 'made-up-tone.wav', mimeType: 'audio/wav', buffer: toneWav() });
      await pat.page.waitForFunction(() => [...(window.__teamMedia || [])].some((a) => !a.paused && a.currentTime > 0), null, { timeout: 15_000 });
      await shot(pat.page, 'pat-plays-a-song');
      return `the audio is really playing; the screen says "${(await lcdSays(frame)).replace(/\s+/g, ' ').trim()}"`;
    });

    await check('walk', 'Pat pauses with the space bar', async () => {
      await frame.locator('.hb-music-status').click().catch(() => {});
      await pat.page.keyboard.press(' ');
      await pat.page.waitForFunction(() => [...(window.__teamMedia || [])].every((a) => a.paused), null, { timeout: 5_000 });
      return `paused; the screen says "${(await lcdSays(frame)).replace(/\s+/g, ' ').trim()}"`;
    });

    await check('walk', 'Pat clicks through the visualizer looks', async ({ shot }) => {
      const seen = [];
      for (const [mode, label] of LOOKS) {
        await frame.locator('[data-music-visualizer]').first().click();
        await frame.locator(`[data-music-visualizer="${mode}"]`).waitFor({ timeout: 5_000 });
        const said = (await lcdSays(frame)).replace(/\s+/g, ' ');
        if (!said.includes(label)) throw new Error(`the ${mode} look is drawn but the screen says "${said.trim()}"`);
        seen.push(label.toLowerCase());
      }
      await shot(pat.page, 'pat-picks-the-swirl-look');
      return `the screen named each look in turn: ${seen.join(', ')}`;
    });

    await check('walk', 'Pat changes the player skin', async ({ shot }) => {
      await frame.getByLabel('Player skin').selectOption('spotify');
      await pat.page.waitForTimeout(500);
      await shot(pat.page, 'pat-picks-spotify-green-skin');
      return 'the skin picker took "Spotify green"';
    });

    await check('walk', 'Sam sees the player on the shared board', async ({ shot }) => {
      await windowFrame(sam.page, id).waitFor({ state: 'visible', timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-player');
      const songShows = (await lcdSays(windowFrame(sam.page, id))).includes('PLAYING');
      // A file stays on Pat's computer by design, so Sam's copy has no song.
      return songShows ? 'Sam sees the player, and it says it is playing' : 'Sam sees the player; Pat\'s file stays on Pat\'s computer, as the player promises';
    });

    await check('walk', 'on Auto, a YouTube link turns the player YouTube red', async ({ shot }) => {
      await frame.getByLabel('Player skin').selectOption('auto');
      await pasteLink(pat.page, id, YOUTUBE_LINK);
      const { brand, source } = await wears(frame);
      if (source !== 'youtube' || brand !== 'YouTube') throw new Error(`the player wears "${brand}" (${source}) for a YouTube link`);
      await shot(pat.page, 'pat-youtube-red');
      return 'the player turned YouTube red';
    });

    await check('walk', 'Sam sees the same song on the shared board', async ({ shot }) => {
      const samFrame = windowFrame(sam.page, id);
      await samFrame.locator('[data-music-device="youtube"]').waitFor({ timeout: 15_000 }).catch(() => {});
      const { brand, source } = await wears(samFrame);
      const saved = await readWindow(sam.page, id);
      if (source !== 'youtube' || !String(saved?.src || '').includes('madeUp00001')) throw new Error(`Sam's player wears "${brand}" (${source}) instead of the YouTube song Pat loaded`);
      await shot(sam.page, 'sam-sees-the-youtube-song');
      return 'Sam\'s player shows the same YouTube song, in YouTube red';
    });

    await check('walk', 'on Auto, a Spotify link turns a second player Spotify green', async ({ shot }) => {
      const second = await spawnWindow(pat.page, 'music', {}, { x: 560, y: 80 });
      await windowFrame(pat.page, second).waitFor({ state: 'visible', timeout: 15_000 });
      await pasteLink(pat.page, second, SPOTIFY_LINK);
      const { brand, source } = await wears(windowFrame(pat.page, second));
      if (source !== 'spotify' || brand !== 'Spotify') throw new Error(`the player wears "${brand}" (${source}) for a Spotify link`);
      const first = await wears(frame);
      if (first.source !== 'youtube') throw new Error(`the first player changed to "${first.brand}"`);
      await shot(pat.page, 'red-and-green-players-side-by-side');
      return 'the second player turned Spotify green, next to the YouTube red one';
    });

    await check('hunt', 'Pat loads a text file wearing an .mp3 name', async ({ shot }) => {
      await frame.locator('input[data-music-file-input]').setInputFiles({ name: 'not-really-a-song.mp3', mimeType: 'audio/mpeg', buffer: fakeMp3() });
      await pat.page.waitForTimeout(2500);
      await shot(pat.page, 'pat-loads-a-fake-mp3');
      const said = (await frame.innerText()).replace(/\s+/g, ' ');
      if (pat.errors.length) throw new Error(`the page crashed: ${pat.errors[0]}`);
      if (/this file could not be played\./i.test(said)) return 'the player says "This file could not be played."';
      if (/can.?t play|could not|not a song|unsupported|error/i.test(said)) throw note(`the player refuses it, but not with the agreed words: "${said.slice(0, 80)}"`);
      if (/PLAYING/.test(said) && !(await playingNow(pat.page))) throw new Error('the screen says PLAYING but no sound is playing, and there is no "cannot play this file" message');
      throw note('no crash, but the player gives no sign the file is not a song');
    });

    await check('hunt', 'an empty link cannot be loaded', async () => {
      await openLinks(frame);
      const box = frame.getByPlaceholder('YouTube, Spotify, SoundCloud, song or radio link');
      await box.fill('    ');
      if (!(await frame.getByRole('button', { name: 'Load', exact: true }).isDisabled())) throw new Error('Load is clickable with only spaces typed');
      return 'Load stays greyed out for spaces';
    });

    await check('hunt', 'a link to an ordinary web page is not opened inside the player', async ({ shot }) => {
      const link = 'https://example.com/page?from=youtube.com';
      await pasteLink(pat.page, id, link);
      await shot(pat.page, 'pat-pastes-a-pretend-youtube-link');
      const saved = await readWindow(pat.page, id);
      const srcs = await iframeSrcs(pat.page, frame);
      const opened = srcs.find((s) => s.startsWith('https://example.com'));
      if (opened) throw new Error(`the player opened the outside page inside the board (iframe ${opened.slice(0, 60)}), and it does so on every teammate\'s board too`);
      return `saved as ${String(saved?.src || '').slice(0, 60)}; no outside page was opened`;
    });

    await check('hunt', 'a look-alike YouTube host is treated as a web page, not music', async ({ shot }) => {
      await pasteLink(pat.page, id, 'https://youtube.com.evil.example/watch?v=madeUp00003');
      await shot(pat.page, 'pat-pastes-a-look-alike-youtube-link');
      const said = (await frame.innerText()).replace(/\s+/g, ' ');
      const srcs = await iframeSrcs(pat.page, frame);
      if (srcs.some((s) => s.includes('evil.example'))) throw new Error('the look-alike page was opened inside the player');
      if (!/this is a web page, not music\./i.test(said)) throw new Error('the look-alike link gets no "This is a web page, not music" note');
      return 'the player says "This is a web page, not music." and opens nothing';
    });

    await check('hunt', 'a javascript: link pasted in the box does nothing', async () => {
      t.typed.push('javascript:parent.__teamPatRan=1');
      await pasteLink(pat.page, id, 'javascript:parent.__teamPatRan=1');
      const ran = await pat.page.evaluate(() => window.__teamPatRan === 1);
      if (ran) throw new Error('the pasted script ran inside censaiOS');
      return 'the script did not run';
    });

    await check('redteam', 'a teammate cannot plant a script on the shared player', async ({ shot }) => {
      // Pat's browser writes the window's saved link directly, the way a
      // hostile teammate with a changed browser could; Sam's browser must not run it.
      await updateWindow(pat.page, id, { src: 'javascript:parent.__teamSamRan=1', musicDevice: true, musicPaused: false });
      await sam.page.waitForTimeout(3000);
      await shot(sam.page, 'sam-after-planted-link');
      const ran = await sam.page.evaluate(() => window.__teamSamRan === 1);
      const srcs = await iframeSrcs(sam.page, windowFrame(sam.page, id));
      if (ran) throw new Error('Pat\'s planted link ran as Sam inside Sam\'s censaiOS');
      if (srcs.some((s) => /^\s*javascript:/i.test(s))) throw new Error('Sam\'s player put the script link in a frame (blocked by the browser this time)');
      return 'Sam\'s browser did not run it';
    });

    await check('redteam', 'outside pages in the player are fenced off (sandboxed)', async () => {
      await updateWindow(pat.page, id, { src: 'https://example.com/not-music', musicDevice: true });
      await sam.page.waitForTimeout(2500);
      const sandboxes = await windowFrame(sam.page, id).locator('iframe').evaluateAll((list) => list.map((f) => f.getAttribute('sandbox')));
      if (!sandboxes.length) throw note('no frame shown for a plain outside link');
      if (sandboxes.every((s) => s !== null)) return 'every frame has a sandbox';
      throw note('the player frames outside pages without a sandbox; YouTube, Spotify and SoundCloud need scripts, so the fix is a host list, not a blanket sandbox');
    });
  },
};
