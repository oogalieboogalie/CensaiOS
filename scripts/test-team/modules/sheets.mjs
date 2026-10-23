// Sheets for two: Pat Example types made-up numbers and a sum, Sam Example
// sees them, Sam changes one and both see the new total, Pat adds a chart Sam
// can see, and it is all still there after Pat reloads. Bug hunt: both type
// in the same cell at once, a formula that points at itself, a pasted block of
// 1,000 rows. All numbers and words are made up.

import { openBoard, spawnWindow, windowFrame } from '../../e2e/board.mjs';

const cell = (page, id, address) => windowFrame(page, id).locator(`td[data-addr="${address}"]`).first();
const shown = (page, id, address) => cell(page, id, address).innerText().then((t) => t.trim()).catch(() => '');

/** Clicks a cell and types into it the way a person does, Enter to finish. */
async function type(page, id, address, text) {
  await cell(page, id, address).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Waits until both screens show what `want` says for each cell; returns what they showed last. */
async function bothShow(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  let seen = [];
  while (Date.now() < until) {
    seen = await Promise.all([t.pat, t.sam].map(async (p) => {
      const out = {};
      for (const a of Object.keys(want)) out[a] = await shown(p.page, id, a);
      return out;
    }));
    if (seen.every((s) => Object.entries(want).every(([a, v]) => s[a] === v))) return { ok: true, seen };
    await t.pat.page.waitForTimeout(300);
  }
  return { ok: false, seen };
}

const describe = (seen) => seen.map((s, i) => `${i ? 'Sam' : 'Pat'} sees ${Object.entries(s).map(([a, v]) => `${a}=${v || 'empty'}`).join(' ')}`).join('; ');

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
  id: 'sheets',
  label: 'Sheets',
  async run(t) {
    const { pat, sam, check } = t;
    let id;

    await check('walk', 'Pat opens Sheets and types numbers and a total', async ({ shot }) => {
      id = await spawnWindow(pat.page, 'officeSheets', { title: 'Made-up seed budget' }, { x: 60, y: 70 }, { w: 820, h: 500 });
      await cell(pat.page, id, 'A1').waitFor({ state: 'visible', timeout: 15_000 });
      for (const [a, v] of [['A1', '12'], ['A2', '30'], ['A3', '8'], ['A4', '=SUM(A1:A3)']]) await type(pat.page, id, a, v);
      t.typed.push('Made-up seed budget');
      const total = await shown(pat.page, id, 'A4');
      if (total !== '50') throw new Error(`the total shows "${total}" instead of 50`);
      await shot(pat.page, 'pat-types-numbers-and-a-total');
      return 'Pat sees 12, 30, 8 and the total 50';
    });

    await check('walk', 'Sam sees the numbers and the total', async ({ shot }) => {
      await cell(sam.page, id, 'A1').waitFor({ state: 'visible', timeout: 15_000 });
      const r = await bothShow(t, id, { A1: '12', A2: '30', A3: '8', A4: '50' });
      if (!r.ok) throw new Error(describe(r.seen));
      await sideBySide(t, 'both-screens-show-the-total', shot);
      return 'both screens show 12, 30, 8 and 50';
    });

    await check('walk', 'Sam changes a number and both see the new total', async ({ shot }) => {
      await type(sam.page, id, 'A2', '45');
      const r = await bothShow(t, id, { A2: '45', A4: '65' });
      if (!r.ok) throw new Error(describe(r.seen));
      await sideBySide(t, 'both-see-the-new-total', shot);
      return 'Sam typed 45 and both screens now show the total 65';
    });

    await check('walk', 'Pat adds a chart and Sam sees it', async ({ shot }) => {
      await cell(pat.page, id, 'A1').click();
      await cell(pat.page, id, 'A3').click({ modifiers: ['Shift'] });
      await windowFrame(pat.page, id).locator('button[title="Chart the selected cells"]').click();
      const chart = windowFrame(sam.page, id).locator('.hb-of-chart');
      await chart.first().waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => { throw new Error('Pat added a chart but none showed up on Sam\'s screen'); });
      await sideBySide(t, 'both-screens-show-the-chart', shot);
      return 'the chart Pat added shows on Sam\'s screen too';
    });

    await check('walk', 'Pat reloads and it is all still there', async ({ shot }) => {
      await openBoard(pat.page, t.workspaceId, t.web);
      await cell(pat.page, id, 'A1').waitFor({ state: 'visible', timeout: 30_000 });
      const r = await bothShow(t, id, { A1: '12', A2: '45', A3: '8', A4: '65' });
      if (!r.ok) throw new Error(`after a reload: ${describe(r.seen)}`);
      if (!(await windowFrame(pat.page, id).locator('.hb-of-chart').count())) throw new Error('the chart is gone after the reload');
      await shot(pat.page, 'pat-after-a-reload');
      return 'the numbers, the total 65 and the chart came back after the reload';
    });

    await check('hunt', 'Pat and Sam type in the same cell at the same moment', async ({ shot }) => {
      await Promise.all([type(pat.page, id, 'B1', '111'), type(sam.page, id, 'B1', '222')]);
      await pat.page.waitForTimeout(2000);
      const until = Date.now() + 10_000;
      let a = ''; let b = '';
      while (Date.now() < until) {
        [a, b] = await Promise.all([shown(pat.page, id, 'B1'), shown(sam.page, id, 'B1')]);
        if (a === b && a) break;
        await pat.page.waitForTimeout(300);
      }
      await sideBySide(t, 'both-type-in-one-cell', shot);
      if (a !== b) throw new Error(`the screens disagree: Pat sees ${a || 'empty'}, Sam sees ${b || 'empty'}`);
      if (!['111', '222'].includes(a)) throw new Error(`both see "${a}", which neither typed`);
      return `both screens agree on ${a} (the last one to land wins)`;
    });

    await check('hunt', 'a formula that points at itself', async ({ shot }) => {
      await type(pat.page, id, 'A6', '=A6+1');
      const r = await bothShow(t, id, { A6: '#CIRC!' });
      await shot(pat.page, 'a-formula-that-points-at-itself');
      if (!r.ok) throw new Error(`the cell shows something other than a loop warning: ${describe(r.seen)}`);
      if (pat.errors.length) throw new Error(`the page crashed: ${pat.errors[0]}`);
      return 'the cell says #CIRC! on both screens and nothing hangs';
    });

    await check('hunt', 'a pasted block of 1,000 rows', async ({ shot }) => {
      await cell(pat.page, id, 'D1').click();
      const started = Date.now();
      await pat.page.evaluate(() => {
        const text = Array.from({ length: 1000 }, (_, i) => `${i + 1}\t${(i + 1) * 2}`).join('\n');
        const data = new DataTransfer();
        data.setData('text/plain', text);
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      });
      await type(pat.page, id, 'G1', '=SUM(D1:D1000)');
      const r = await bothShow(t, id, { D1: '1', E1: '2', G1: '500500' }, 30_000);
      const ms = Date.now() - started;
      await sideBySide(t, 'a-pasted-block-of-1000-rows', shot);
      if (!r.ok) throw new Error(describe(r.seen));
      if (pat.errors.length) throw new Error(`the page crashed: ${pat.errors[0]}`);
      return `1,000 rows pasted, the sum of the first column is right on both screens (${Math.round(ms / 1000)} s)`;
    });
  },
};
