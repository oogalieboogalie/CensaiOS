// Live cursors in Censai Photo and Censai Video for two people. Pat Example
// types the words of a made-up poster's text layer; Sam Example puts the
// cursor after "Grand opening". Pat must see a line with Sam's name at that
// spot, and when Pat types in front of it the line must move with Sam's
// words. Then the same in a layer's name, and in a Video title. When Sam
// clicks away, it leaves Pat's screen. Nothing is written by the AI, so no key
// is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const LID = 'crewL1';
const CID = 'crewC1';
const WORDS = 'Grand opening Friday';
const SPOT = 'Grand opening'.length;
const PAT_WORDS = 'Big ';

const box = (page, id, name) => windowFrame(page, id).getByRole('textbox', { name, exact: true });
const markOf = (b, who) => b.locator('xpath=..').locator(`[data-teammate-caret="${who}"]`);
const markAt = async (page, id, name, who = 'Sam Example') => {
  const m = markOf(box(page, id, name), who);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

// Pat types the words; Sam puts the cursor at SPOT; Pat must see it there,
// then Pat types in front and it must move with Sam's words.
async function cursorWalk(t, shot, win, name, part, words, shotName) {
  const { pat, sam } = t;
  const patBox = box(pat.page, win, name);
  await patBox.click({ timeout: 15_000 });
  await patBox.pressSequentially(words, { delay: 8 });
  const synced = await waitFor(async () => String((await readWindow(sam.page, win))?.[part]?.[name === 'Layer name' ? 'name' : 'text'] ?? '') === words, 15_000, pat.page);
  if (!synced) throw new Error(`Sam's copy of the ${name} does not match`);
  await box(sam.page, win, name).waitFor({ timeout: 10_000 });
  await box(sam.page, win, name).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
  await box(sam.page, win, name).press('Shift');
  const seen = await waitFor(async () => ((await markAt(pat.page, win, name)) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
  await pat.page.waitForTimeout(500);
  await sideBySide(t, `${shotName}-pat-sees-sams-cursor`, shot);
  if (!seen) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, name)) ?? 'nowhere'}, not ${SPOT}`);
  await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
  await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
  const want = String(SPOT + PAT_WORDS.length);
  const moved = await waitFor(async () => ((await markAt(pat.page, win, name)) === want ? 'ok' : null), 15_000, pat.page);
  await pat.page.waitForTimeout(500);
  await sideBySide(t, `${shotName}-cursor-moves-with-the-words`, shot);
  if (!moved) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, name)}, not ${want}`);
  await box(sam.page, win, name).evaluate((el) => el.blur());
  const gone = await waitFor(async () => (await markOf(box(pat.page, win, name), 'Sam Example').count()) === 0, 15_000, pat.page);
  if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
}

export default {
  id: 'photoVideoCursors',
  label: "Censai Photo and Video: see a teammate's cursor in a text layer, layer name and title",
  async run(t) {
    const { pat, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim(), 'Shop sign');
    let photo;
    let video;

    await check('walk', "Photo text layer: Pat sees Sam's cursor and name, and it moves with the words", async ({ shot }) => {
      photo = await spawnWindow(pat.page, 'creativePhoto', {
        title: 'Made-up poster',
        photoDoc: { w: 1200, h: 800, order: [LID] },
        [`pl.${LID}`]: { kind: 'text', name: '', x: 80, y: 120, visible: true, opacity: 1, blend: 'source-over', adj: {}, text: '', size: 96, weight: 700, at: 1 },
      }, { x: 40, y: 40 }, { w: 1000, h: 700 });
      await cursorWalk(t, shot, photo, 'Text', `pl.${LID}`, WORDS, 'photo-text');
      return "Pat sees a line with Sam's name after \"Grand opening\"; it moves when Pat types in front, and leaves when Sam clicks away";
    });

    await check('walk', "Photo layer name: Pat sees Sam's cursor there, not in the words", async ({ shot }) => {
      await cursorWalk(t, shot, photo, 'Layer name', `pl.${LID}`, WORDS, 'photo-name');
      return "Sam's line shows in the layer name box while Sam types there";
    });

    await check('walk', "Video title: Pat sees Sam's cursor and name, and it moves with the words", async ({ shot }) => {
      video = await spawnWindow(pat.page, 'creativeVideo', {
        title: 'Made-up promo',
        videoDoc: { w: 1280, h: 720, fps: 30 },
        [`vc.${CID}`]: { track: 't', start: 0, dur: 3, text: '', pos: 'center', size: 72, at: 1 },
      }, { x: 60, y: 60 }, { w: 1000, h: 700 });
      for (const p of [t.pat, t.sam]) {
        const frame = windowFrame(p.page, video);
        if (!(await frame.getByRole('textbox', { name: 'Title text', exact: true }).count())) {
          await frame.locator(`[data-clip="${CID}"]`).first().click({ timeout: 15_000 });
        }
      }
      await cursorWalk(t, shot, video, 'Title text', `vc.${CID}`, WORDS, 'video-title');
      return "Pat sees a line with Sam's name after \"Grand opening\" in the title, and it moves with the words";
    });
  },
};
