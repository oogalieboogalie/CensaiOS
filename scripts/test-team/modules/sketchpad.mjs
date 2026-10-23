// Sketchpad for two: Pat Example draws a box and writes a made-up label, Sam
// Example sees both on the same board, Sam draws an arrow and Pat sees it, and
// Pat reloads to find everything still there. Bug hunt: both draw at the same
// moment, a huge picture pasted onto the pad, Sam's tab closed mid-stroke.
// All words are made up.

import { openBoard, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';

const LABEL = 'Made-up label: seedlings by the gate';

/** What one person's board copy holds for the sketch: element types and texts. */
const sketchOf = (id) => {
  const win = window.__e2eStore.getState().wins.find((w) => w.id === id);
  const els = win?.state?.excalidraw?.elements || [];
  return { ok: true, types: els.map((e) => e.type), texts: els.map((e) => e.text || '').filter(Boolean) };
};

/** Waits until a check on each person's board copy passes; returns what each saw last. */
async function bothSee(pat, sam, test, arg, ms = 10_000) {
  const until = Date.now() + ms;
  let seen = [];
  while (Date.now() < until) {
    seen = await Promise.all([pat, sam].map((p) => p.page.evaluate(test, arg)));
    if (seen.every((s) => s && s.ok)) return seen;
    await pat.page.waitForTimeout(250);
  }
  return seen;
}

const has = ([id, types, text]) => {
  const s = (() => {
    const win = window.__e2eStore.getState().wins.find((w) => w.id === id);
    return win?.state?.excalidraw?.elements || [];
  })();
  const need = [...types];
  for (const el of s) { const i = need.indexOf(el.type); if (i >= 0) need.splice(i, 1); }
  return { ok: need.length === 0 && (!text || s.some((el) => el.text === text)), count: s.length, missing: need };
};

const pad = (page, id) => windowFrame(page, id).locator('svg[style*="touch-action: none"]').first();

/** Picks a tool and drags from one point to another on the pad, the way a person does. */
async function drag(page, id, tool, from, to) {
  await windowFrame(page, id).locator(`button[title="${tool}"]`).click();
  const box = await pad(page, id).boundingBox();
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
  await page.mouse.up();
}

/** Both screens in one picture, Pat on the left and Sam on the right. */
async function sideBySide(t, title, shot) {
  const [a, b] = await Promise.all([t.pat.page, t.sam.page].map((p) => p.screenshot({ type: 'png' })));
  const view = await t.browser.newPage({ viewport: { width: 1800, height: 620 } });
  const img = (buf, who) => `<figure><figcaption>${who}</figcaption><img src="data:image/png;base64,${buf.toString('base64')}"></figure>`;
  await view.setContent(`<style>body{margin:0;display:flex;gap:12px;padding:12px;background:gray;font:14px sans-serif}
    figure{margin:0;flex:1}img{width:100%;display:block}figcaption{padding:4px 0}</style>${img(a, "Pat's screen")}${img(b, "Sam's screen")}`);
  await shot(view, title);
  await view.close();
}

export default {
  id: 'sketchpad',
  label: 'Sketchpad',
  async run(t) {
    const { pat, sam, check } = t;
    let id;

    await check('walk', 'Pat opens a Sketchpad', async ({ shot }) => {
      id = await spawnWindow(pat.page, 'sketchpad', {}, { x: 80, y: 80 }, { w: 640, h: 440 });
      await pad(pat.page, id).waitFor({ state: 'visible', timeout: 15_000 });
      await shot(pat.page, 'pat-opens-a-sketchpad');
      return 'a blank Sketchpad opened on the board';
    });

    await check('walk', 'Pat draws a box and writes a made-up label', async ({ shot }) => {
      await drag(pat.page, id, 'Rectangle Tool', { x: 60, y: 60 }, { x: 260, y: 180 });
      t.typed.push(LABEL);
      await windowFrame(pat.page, id).locator('button[title="Text Tool"]').click();
      const box = await pad(pat.page, id).boundingBox();
      await pat.page.mouse.click(box.x + 70, box.y + 220);
      // Before the fix the box for the words vanished the moment it appeared.
      await windowFrame(pat.page, id).locator('input:focus').waitFor({ state: 'visible', timeout: 3000 })
        .catch(() => { throw new Error('the Text tool opened no box to type in (or lost it at once)'); });
      await pat.page.keyboard.type(LABEL);
      await pat.page.keyboard.press('Enter');
      const [mine] = await bothSee(pat, pat, has, [id, ['rect', 'text'], LABEL]);
      if (!mine.ok) throw new Error(`Pat's own board copy is missing ${mine.missing.join(', ') || 'the label'}`);
      await shot(pat.page, 'pat-draws-a-box-and-a-label');
      return 'the box and the label are on the board';
    });

    await check('walk', 'Sam sees the box and the label', async ({ shot }) => {
      await pad(sam.page, id).waitFor({ state: 'visible', timeout: 15_000 });
      const [, theirs] = await bothSee(pat, sam, has, [id, ['rect', 'text'], LABEL], 15_000);
      if (!theirs.ok) throw new Error(`Sam's board has ${theirs.count} drawing(s) and is missing ${theirs.missing.join(', ') || 'the label'}`);
      const drawn = await pad(sam.page, id).locator('rect, text').count();
      if (!drawn) throw new Error('Sam\'s board copy has the drawing but Sam\'s screen shows nothing');
      await sideBySide(t, 'both-screens-show-the-box-and-label', shot);
      return 'Sam\'s screen shows the same box and label';
    });

    await check('walk', 'Sam draws an arrow and Pat sees it', async ({ shot }) => {
      await drag(sam.page, id, 'Arrow Tool', { x: 300, y: 120 }, { x: 460, y: 220 });
      const seen = await bothSee(pat, sam, has, [id, ['rect', 'text', 'arrow'], LABEL], 15_000);
      if (!seen[0].ok) throw new Error(`Pat's board has ${seen[0].count} drawing(s) and is missing ${seen[0].missing.join(', ')}`);
      await sideBySide(t, 'both-screens-show-sams-arrow', shot);
      return 'Pat sees Sam\'s arrow next to the box and label';
    });

    await check('walk', 'Pat reloads and everything is still there', async ({ shot }) => {
      await openBoard(pat.page, t.workspaceId, t.web);
      await pad(pat.page, id).waitFor({ state: 'visible', timeout: 30_000 });
      const [after] = await bothSee(pat, pat, has, [id, ['rect', 'text', 'arrow'], LABEL], 15_000);
      if (!after.ok) throw new Error(`after a reload Pat's board is missing ${after.missing.join(', ') || 'the label'}`);
      const shapes = await pad(pat.page, id).locator('rect, text, line, path').count();
      if (!shapes) throw new Error('the board copy kept the drawing but the reloaded screen is empty');
      await shot(pat.page, 'pat-after-a-reload');
      return 'the box, the label and Sam\'s arrow came back after the reload';
    });

    await check('hunt', 'Pat and Sam draw at the same moment', async ({ shot }) => {
      const [before] = await Promise.all([pat, sam].map((p) => p.page.evaluate(sketchOf, id)));
      await Promise.all([
        drag(pat.page, id, 'Circle Tool', { x: 360, y: 260 }, { x: 440, y: 330 }),
        drag(sam.page, id, 'Rectangle Tool', { x: 480, y: 260 }, { x: 590, y: 340 }),
      ]);
      const want = [...before.types, 'circle', 'rect'];
      const seen = await bothSee(pat, sam, has, [id, want], 15_000);
      await sideBySide(t, 'both-draw-at-once', shot);
      const lost = seen.find((s) => !s.ok);
      if (lost) throw new Error(`one drawing was lost: a board copy has ${lost.count} of ${want.length} drawings`);
      return 'both new shapes are on both screens';
    });

    await check('hunt', 'a huge picture pasted onto the pad does not break it', async () => {
      const before = await pat.page.evaluate(sketchOf, id);
      await pad(pat.page, id).evaluate((svg) => {
        const big = new Uint8Array(6 * 1024 * 1024);
        big.set([137, 80, 78, 71, 13, 10, 26, 10]);
        const data = new DataTransfer();
        data.items.add(new File([big], 'made-up-huge-picture.png', { type: 'image/png' }));
        svg.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
      });
      await pat.page.waitForTimeout(1500);
      if (pat.errors.length) throw new Error(`the page crashed: ${pat.errors[0]}`);
      const after = await pat.page.evaluate(sketchOf, id);
      if (after.types.length !== before.types.length) return 'the picture was added and the pad kept working';
      throw note('nothing happens: the Sketchpad does not take pasted pictures, and the paste does no harm');
    });

    await check('hunt', 'Sam\'s tab closed mid-stroke leaves Pat\'s drawing whole', async ({ shot }) => {
      const before = await pat.page.evaluate(sketchOf, id);
      await windowFrame(sam.page, id).locator('button[title="Pencil Tool"]').click();
      const box = await pad(sam.page, id).boundingBox();
      await sam.page.mouse.move(box.x + 100, box.y + 300);
      await sam.page.mouse.down();
      await sam.page.mouse.move(box.x + 220, box.y + 360, { steps: 6 });
      await sam.page.close();
      await pat.page.waitForTimeout(4000);
      const after = await pat.page.evaluate(sketchOf, id);
      await shot(pat.page, 'after-sams-tab-closed-mid-stroke');
      if (after.types.length < before.types.length) throw new Error(`Pat's drawing lost ${before.types.length - after.types.length} shape(s)`);
      if (pat.errors.length) throw new Error(`Pat's page crashed: ${pat.errors[0]}`);
      return `Pat's drawing is whole (${after.types.length} shapes); Sam's unfinished stroke never arrived`;
    });
  },
};
