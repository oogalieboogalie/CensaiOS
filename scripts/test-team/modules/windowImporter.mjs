// The Window Importer says plainly what it does and where a new window goes.
// Its Options tab used to offer an "Add to canvas launcher tiles" box, ticked
// from the start, but no tile ever appeared: the empty board offers only its
// three starting buttons (src/lib/launchpadStarts.js). Pat Example owns the
// computer and Sam Example is a teammate on the same board. Walk: Pat opens
// the Window Importer from Add; on both screens it says it turns AI Studio
// code into a censaiOS window, and its Options tab has the hint for the AI
// and a line saying the new window stays out of Add until someone checks it
// and publishes it in the code, with no launcher box.
//
// The module stops short of importing: an import writes the new window into
// the app's own code, which the dev server the test team runs on then reloads
// under the walk. What an import writes is checked in
// tests/importedWindowMeta.test.js. All people and words are made up.

import { updateWindow, windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';

const WHAT_IT_DOES = 'Turn AI Studio code into a censaiOS window';
const WHERE_IT_GOES = 'The new window stays out of Add until someone checks it and publishes it in the code.';

/** What the Window Importer shows on this screen once its Options tab is open. */
const options = (page, id) => windowFrame(page, id).evaluate((el) => ({
  words: el.innerText,
  note: el.querySelector('#wi-where-it-goes')?.textContent.trim() || '',
  hintBox: Boolean(el.querySelector('#wi-hint-input')),
  boxes: el.querySelectorAll('input[type="checkbox"]').length,
})).catch(() => ({ words: '', note: '', hintBox: false, boxes: 0 }));

/** Pat's and Sam's copies of one window in one picture, Pat on the left. */
async function bothWindows(t, id, title, shot) {
  const boxes = await Promise.all([t.pat.page, t.sam.page].map((page) => windowFrame(page, id).boundingBox()));
  const [a, b] = await Promise.all([t.pat.page, t.sam.page].map((page, i) => page.screenshot({ type: 'png', clip: boxes[i] })));
  const view = await t.browser.newPage({ viewport: { width: 1240, height: 700 } });
  const img = (buf, who) => `<figure><figcaption>${who}</figcaption><img src="data:image/png;base64,${buf.toString('base64')}"></figure>`;
  await view.setContent(`<style>body{margin:0;display:flex;gap:16px;padding:16px;background:gray;font:14px sans-serif}
    figure{margin:0;flex:1}img{width:100%;display:block}figcaption{padding:4px 0}</style>${img(a, "Pat's screen")}${img(b, "Sam's screen")}`);
  await shot(view, title);
  await view.close();
}

export default {
  id: 'windowImporter',
  label: 'The Window Importer says what it does and where a new window goes',
  async run(t) {
    const { pat, sam, check } = t;

    await check('walk', 'Pat opens the Window Importer from Add: on both screens it says it turns AI Studio code into a censaiOS window, and its Options tab has the hint for the AI and a plain line on where the new window goes, with no launcher box', async ({ shot }) => {
      const win = await addFromMenu(pat.page, 'Window Importer');
      if (win.kind !== 'windowImporter') throw new Error(`the Add menu opened ${win.kind || 'nothing'}, not the Window Importer`);
      await updateWindow(pat.page, win.id, { x: 40, y: 60, w: 560, h: 520, width: 560, height: 520 });
      await pat.page.waitForTimeout(800);
      for (const p of [pat, sam]) await windowFrame(p.page, win.id).getByRole('button', { name: /Options/ }).click({ timeout: 10_000 });
      const seen = { Pat: await options(pat.page, win.id), Sam: await options(sam.page, win.id) };
      await bothWindows(t, win.id, 'options-say-where-a-new-window-goes', shot);
      const problems = [];
      for (const [who, o] of Object.entries(seen)) {
        if (!o.words.includes(WHAT_IT_DOES)) problems.push(`${who}'s Window Importer does not say "${WHAT_IT_DOES}"`);
        if (o.note !== WHERE_IT_GOES) problems.push(`${who}'s Options says ${o.note ? `"${o.note}"` : 'nothing'} about where the new window goes`);
        if (!o.hintBox) problems.push(`${who}'s Options has no hint for the AI`);
        if (o.boxes) problems.push(`${who}'s Options has ${o.boxes} tick box(es)`);
        if (/launcher/i.test(o.words)) problems.push(`${who}'s Window Importer still offers launcher tiles`);
      }
      if (problems.length) throw new Error(problems.join('; '));
      return `both screens say "${WHAT_IT_DOES}" and "${WHERE_IT_GOES}", with the hint for the AI and no tick box`;
    });
  },
};
