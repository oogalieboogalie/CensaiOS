// Figma and pasted designs: Pat pastes a made-up HTML card onto the board
// (it sits there with no window border), connects a made-up Figma token,
// imports a frame from a stand-in Figma file, and Sam sees both. Then the
// wrong things: a link that is not a Figma file, a token Figma refuses,
// pasted code with a script tag (it must not run for Sam). Red team: signed
// out, and the token never comes back to a browser.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { FILE_URL } from '../../../tests/fixtures/figmaApi.js';
import { STANDIN_FIGMA_TOKEN } from '../standinFigma.mjs';

const CARD = '<div style="padding:24px;border-radius:16px;background:#fde68a;font:600 20px sans-serif">Made-up bakery: fresh rolls at 7</div>';
const SCRIPTED = '<div style="padding:24px">Made-up promo card</div><script>try{top.__teamPwned=1}catch(e){}try{parent.document.title="pwned"}catch(e){}</script>';
const RAW = /\bat [\w.]+ \(|node_modules|ECONN|figd_/;

/** Pastes text on the board, the way Ctrl+V does after clicking empty canvas. */
async function paste(page, text) {
  await page.evaluate((value) => {
    // A press on the empty board first, so no window claims the paste.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.activeElement?.blur?.();
    const data = new DataTransfer();
    data.setData('text/plain', value);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

const blocks = (page) => page.evaluate(() => window.__e2eStore.getState().wins
  .filter((w) => w.kind === 'designBlock')
  .map((w) => ({ id: w.id, source: w.source || '', figma: w.figma?.nodeId || null, frameless: w.frameless === true, bare: w.bare === true })));

async function waitForBlock(page, test, ms = 8_000) {
  const until = Date.now() + ms;
  for (;;) {
    const found = (await blocks(page)).find(test);
    if (found || Date.now() > until) return found || null;
    await page.waitForTimeout(250);
  }
}

/** The frame's own border and shadow, once nothing is pointing at or holding it. */
async function borderOf(page, id) {
  await page.evaluate(() => window.__e2eStore.getState().setActiveId(null));
  await page.mouse.move(5, 890);
  await page.waitForTimeout(400);
  return windowFrame(page, id).evaluate((el) => {
    const s = getComputedStyle(el);
    const width = ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Color`] !== 'rgba(0, 0, 0, 0)');
    return width || (s.boxShadow && s.boxShadow !== 'none') ? `${s.borderTopWidth} ${s.borderTopColor} / ${s.boxShadow}` : '';
  });
}

export default {
  id: 'figma',
  label: 'Figma and pasted designs',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(STANDIN_FIGMA_TOKEN, CARD, SCRIPTED);
    let card;
    let figmaId;
    let frame;
    let imported;

    await check('walk', 'Pat pastes a small HTML card and it sits on the board with no window border', async ({ shot }) => {
      await paste(pat.page, CARD);
      card = await waitForBlock(pat.page, (b) => b.source === CARD);
      if (!card) throw new Error('the paste did not make a design block');
      if (!card.frameless || !card.bare) throw new Error('the pasted card got a normal window');
      await windowFrame(pat.page, card.id).waitFor({ state: 'visible', timeout: 10_000 });
      const border = await borderOf(pat.page, card.id);
      await shot(pat.page, 'pat-pastes-a-card');
      if (border) throw new Error(`the card has a window border: ${border}`);
      return 'a borderless design block holding the card';
    });

    await check('walk', 'Pat connects a Figma token', async ({ shot }) => {
      figmaId = await spawnWindow(pat.page, 'figma', { figmaMode: 'import' }, { x: 560, y: 40 }, { w: 620, h: 640 });
      frame = windowFrame(pat.page, figmaId);
      const tokenBox = frame.getByLabel('Figma personal access token');
      const fileBox = frame.getByLabel('Figma file link');
      await tokenBox.or(fileBox).first().waitFor({ timeout: 15_000 });
      // A run in a second theme finds Pat already connected from the first.
      const already = !(await tokenBox.count());
      if (!already) {
        await tokenBox.fill(STANDIN_FIGMA_TOKEN);
        await frame.getByRole('button', { name: 'Connect Figma' }).click();
      }
      await fileBox.waitFor({ timeout: 10_000 });
      await shot(pat.page, 'pat-connects-figma');
      const status = await t.api(pat, 'GET', '/api/design/figma/status');
      if (!status.body?.connected) throw new Error(`Figma does not show as connected (${status.text.slice(0, 80)})`);
      return `${already ? 'still ' : ''}connected as ${status.body.user} with Pat's own token`;
    });

    await check('walk', 'Pat imports the Hero frame from a Figma file', async ({ shot }) => {
      await frame.getByLabel('Figma file link').fill(FILE_URL);
      await frame.getByRole('button', { name: 'Show frames' }).click();
      // The link names the Hero frame, so it comes picked already; pick it only if not.
      const hero = frame.getByRole('button', { name: /Hero/ }).first();
      await hero.waitFor({ timeout: 15_000 });
      if ((await hero.getAttribute('aria-pressed')) !== 'true') await hero.click();
      await shot(pat.page, 'pat-picks-a-frame');
      await frame.getByRole('button', { name: /^Place 1 on canvas$/ }).click();
      imported = await waitForBlock(pat.page, (b) => b.figma === '1:2', 15_000);
      if (!imported) throw new Error('no design block came from the import');
      await windowFrame(pat.page, imported.id).waitFor({ state: 'visible', timeout: 10_000 });
      await shot(pat.page, 'pat-sees-the-imported-frame');
      return 'the Hero frame is on the board as editable code';
    });

    await check('walk', 'Sam sees the pasted card and the imported frame', async ({ shot }) => {
      const seen = await waitForBlock(sam.page, (b) => b.id === card?.id, 5_000);
      const seenImport = await waitForBlock(sam.page, (b) => b.id === imported?.id, 5_000);
      if (!seen || !seenImport) throw new Error(`Sam is missing ${!seen ? 'the pasted card' : 'the imported frame'}`);
      const border = await borderOf(sam.page, card.id);
      await shot(sam.page, 'sam-sees-both');
      if (border) throw new Error(`on Sam's board the card has a window border: ${border}`);
      return 'both are on Sam\'s board, the card still borderless';
    });

    await check('hunt', 'a link that is not a Figma file gets a plain message', async ({ shot }) => {
      await frame.getByLabel('Figma file link').fill('https://www.figma.com/community/plugins');
      await frame.getByRole('button', { name: 'Show frames' }).click();
      const alert = frame.getByRole('alert').first();
      await alert.waitFor({ timeout: 10_000 });
      const said = await alert.innerText();
      await shot(pat.page, 'pat-pastes-a-bad-figma-link');
      if (!/Figma file link/.test(said)) throw new Error(`Pat saw "${said.slice(0, 120)}"`);
      return `Pat saw: ${said}`;
    });

    await check('hunt', 'a token Figma refuses gets a plain message', async () => {
      await t.api(pat, 'POST', '/api/keys', { provider: 'figma', apiKey: 'figd_made_up_wrong' });
      try {
        const res = await t.api(pat, 'GET', `/api/design/figma/frames?url=${encodeURIComponent(FILE_URL)}`);
        if (RAW.test(res.text)) throw new Error(`answered ${res.status} with raw text`);
        if (res.status < 400 || !/rejected the token/.test(res.body?.error || '')) throw new Error(`answered ${res.status}: ${res.body?.error}`);
        return `answered ${res.status}: ${res.body.error}`;
      } finally {
        await t.api(pat, 'POST', '/api/keys', { provider: 'figma', apiKey: STANDIN_FIGMA_TOKEN });
      }
    });

    await check('hunt', 'pasted code with a script tag does not run on Sam\'s board', async ({ shot }) => {
      await paste(pat.page, SCRIPTED);
      const block = await waitForBlock(pat.page, (b) => b.source === SCRIPTED);
      if (!block) throw new Error('the paste did not make a design block');
      if (!(await waitForBlock(sam.page, (b) => b.id === block.id, 5_000))) throw new Error('the block never reached Sam');
      await sam.page.waitForTimeout(1500);
      const ran = await sam.page.evaluate(() => window.__teamPwned === 1 || document.title === 'pwned');
      const ranForPat = await pat.page.evaluate(() => window.__teamPwned === 1 || document.title === 'pwned');
      await shot(sam.page, 'sam-sees-the-scripted-paste');
      if (ran || ranForPat) throw new Error(`the pasted script reached the app page${ran ? ' on Sam\'s board' : ''}`);
      return 'the script stayed inside its sealed frame';
    });

    await check('redteam', 'signed out, the Figma routes answer nothing', async () => {
      const before = t.figma.calls();
      const status = await t.api({ ctx: t.signedOut }, 'GET', '/api/design/figma/status');
      const frames = await t.api({ ctx: t.signedOut }, 'GET', `/api/design/figma/frames?url=${encodeURIComponent(FILE_URL)}`);
      if (status.status < 400 || frames.status < 400 || t.figma.calls() !== before) throw new Error(`answered ${status.status} and ${frames.status} with no sign-in`);
      return `answered ${status.status} and ${frames.status}`;
    });

    await check('redteam', 'the Figma token never comes back to a browser, and Sam cannot use Pat\'s', async () => {
      const mine = await t.api(pat, 'GET', '/api/design/figma/status');
      const keys = await t.api(pat, 'GET', '/api/keys');
      if (mine.text.includes(STANDIN_FIGMA_TOKEN) || keys.text.includes(STANDIN_FIGMA_TOKEN)) throw new Error('the token came back to Pat\'s browser');
      const before = t.figma.calls();
      const theirs = await t.api(sam, 'GET', `/api/design/figma/frames?url=${encodeURIComponent(FILE_URL)}`);
      if (theirs.status < 400 || t.figma.calls() !== before) throw new Error(`Sam listed Pat's file with Pat's token (${theirs.status})`);
      return `Sam was told: ${theirs.body?.error}`;
    });
  },
};
