// Two people on one board at the same moment: Pat Example and Sam Example type
// into the same note at once, drag the same window at once, see each other's
// cursor and name, and Sam drops off the network while Pat edits, then comes
// back. Bug hunt: one deletes a window while the other edits it, a very long
// paste, Sam's tab closed in the middle of a drag. All words are made up.

import { spawnWindow, readWindow, windowFrame } from '../../e2e/board.mjs';

const PAT_WORDS = 'Pat (made up): tomatoes by the fence.';
const SAM_WORDS = 'Sam (made up): peppers by the shed.';
// Two lines that open with the same words, the case a text diff can misread.
const PAT_TWIN = 'Made-up list: Pat brings bread.';
const SAM_TWIN = 'Made-up list: Sam brings jam.';
const OFFLINE_WORDS = 'Made-up line Pat wrote while Sam was away.';
const SNEAKY_WORDS = 'Made-up edit to a window that is going away.';

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

const textOf = (id) => {
  const win = window.__e2eStore.getState().wins.find((w) => w.id === id);
  return { ok: true, text: String(win?.text ?? ''), here: !!win };
};

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

async function openNote(t, text = '') {
  const id = await spawnWindow(t.pat.page, 'doc', { title: 'Made-up shared note', text, isEditing: true }, { x: 120, y: 120 }, { w: 520, h: 360 });
  await bothSee(t.pat, t.sam, (wid) => ({ ok: window.__e2eStore.getState().wins.some((w) => w.id === wid) }), id);
  return id;
}

/** Opens the note's typing box the way a person does. */
async function typeIn(page, id) {
  const frame = windowFrame(page, id);
  const box = frame.locator('[data-doc-body] textarea').first();
  // A double-click on the page opens typing, as a person would.
  if (!(await box.count())) await frame.locator('[data-doc-body]').first().dblclick();
  await box.waitFor({ timeout: 15_000 });
  return box;
}

/** Pat and Sam type into one note at the same moment; both must end with the same text holding both lines. */
async function typeAtOnce(t, id, patWords, samWords) {
  const boxes = [];
  for (const p of [t.pat, t.sam]) { boxes.push(await typeIn(p.page, id)); await p.page.waitForTimeout(800); }
  await Promise.all(boxes.map((b) => b.click()));
  await Promise.all([boxes[0].pressSequentially(patWords, { delay: 25 }), boxes[1].pressSequentially(samWords, { delay: 25 })]);
  const seen = await bothSee(t.pat, t.sam, ([wid, a, b]) => {
    const text = String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? '');
    return { ok: text.includes(a) && text.includes(b), text };
  }, [id, patWords, samWords]);
  if (seen[0].text !== seen[1].text) throw new Error(`the two screens disagree: Pat has "${seen[0].text.slice(0, 80)}", Sam has "${seen[1].text.slice(0, 80)}"`);
  if (!seen[0].ok) throw new Error(`someone's words came out wrong: both have "${seen[0].text.slice(0, 120)}"`);
  return `both have "${seen[0].text.slice(0, 120)}"`;
}

async function dragBy(page, id, dx, dy) {
  const box = await windowFrame(page, id).boundingBox();
  const x = box.x + 80;
  const y = box.y + 14;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
  await page.mouse.up();
}

export default {
  id: 'liveBoard',
  label: 'Two people edit the board at the same moment',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS, SAM_WORDS, PAT_TWIN, SAM_TWIN, OFFLINE_WORDS, SNEAKY_WORDS);
    let note;

    await check('walk', 'Pat and Sam type into the same note at the same moment and end with the same text', async ({ shot }) => {
      note = await openNote(t);
      const result = await typeAtOnce(t, note, PAT_WORDS, SAM_WORDS);
      await sideBySide(t, 'both-screens-after-typing-at-once', shot);
      return result;
    });

    await check('walk', 'both drag the same window at once and both screens settle on one place', async ({ shot }) => {
      await Promise.all([dragBy(pat.page, note, 160, 40), dragBy(sam.page, note, -60, 140)]);
      const seen = await bothSee(pat, sam, (id) => {
        const w = window.__e2eStore.getState().wins.find((x) => x.id === id);
        return { ok: true, at: w ? `${Math.round(w.x)},${Math.round(w.y)}` : 'gone' };
      }, note, 3000);
      await pat.page.waitForTimeout(1500);
      const settled = await Promise.all([pat, sam].map((p) => readWindow(p.page, note)));
      await sideBySide(t, 'both-drag-the-same-window', shot);
      const [a, b] = settled.map((w) => `${Math.round(w.x)},${Math.round(w.y)}`);
      if (a !== b) throw new Error(`Pat sees the window at ${a}, Sam at ${b} (first look: ${seen.map((s) => s.at).join(' / ')})`);
      return `both see it at ${a}`;
    });

    await check('walk', 'each sees the other\'s cursor and name', async ({ shot }) => {
      await pat.page.mouse.move(700, 500);
      await sam.page.mouse.move(900, 300);
      await pat.page.mouse.move(720, 520, { steps: 4 });
      await sam.page.mouse.move(920, 320, { steps: 4 });
      const names = {};
      for (const [p, other] of [[pat, 'Sam Example'], [sam, 'Pat Example']]) {
        const cursor = p.page.getByTestId('remote-cursor').filter({ hasText: other }).first();
        await cursor.waitFor({ timeout: 10_000 }).catch(() => {});
        names[p.who.name] = (await cursor.count()) ? other : 'nobody';
      }
      await sideBySide(t, 'each-sees-the-other-cursor', shot);
      if (names['Pat Example'] !== 'Sam Example' || names['Sam Example'] !== 'Pat Example') throw new Error(`Pat sees ${names['Pat Example']}, Sam sees ${names['Sam Example']}`);
      return 'Pat sees Sam\'s cursor and name, and Sam sees Pat\'s';
    });

    await check('walk', 'Sam goes offline, Pat edits, Sam comes back and catches up with nothing lost', async ({ shot }) => {
      const before = (await sam.page.evaluate(textOf, note)).text;
      await sam.ctx.setOffline(true);
      await pat.page.waitForTimeout(1000);
      const box = await typeIn(pat.page, note);
      await box.click();
      await pat.page.keyboard.press('End');
      await box.pressSequentially(` ${OFFLINE_WORDS}`, { delay: 10 });
      await pat.page.waitForTimeout(2000);
      const whileAway = (await sam.page.evaluate(textOf, note)).text;
      await sam.ctx.setOffline(false);
      const seen = await bothSee(pat, sam, (id) => {
        const text = String(window.__e2eStore.getState().wins.find((w) => w.id === id)?.text ?? '');
        return { ok: text.includes('while Sam was away'), text };
      }, note, 30_000);
      await sideBySide(t, 'sam-is-back-and-caught-up', shot);
      if (!seen[1].ok) throw new Error(`Sam never got Pat's offline line; Sam has "${seen[1].text.slice(-80)}"`);
      if (seen[0].text !== seen[1].text) throw new Error('after catching up the two screens still disagree');
      if (!seen[1].text.includes(SAM_WORDS) || !before.includes(PAT_WORDS)) throw new Error('earlier words were lost on the way');
      const note2 = whileAway === before ? 'Sam\'s screen held still while offline' : 'Sam\'s screen changed while "offline" (the browser kept its live link)';
      return `${note2}; back online Sam has Pat's line and nothing was lost`;
    });

    await check('hunt', 'two lines that start with the same words, typed at once, both come out whole', async ({ shot }) => {
      const id = await openNote(t);
      try {
        return await typeAtOnce(t, id, PAT_TWIN, SAM_TWIN);
      } finally {
        await sideBySide(t, 'same-start-typed-at-once', shot);
        await pat.page.evaluate((wid) => window.__e2eStore.getState().onClose(wid), id);
      }
    });

    await check('hunt', 'one deletes a window while the other edits it, and both end up agreeing', async () => {
      const id = await openNote(t, 'Made-up note to delete.');
      await Promise.all([
        pat.page.evaluate((wid) => window.__e2eStore.getState().onClose(wid), id),
        sam.page.evaluate(([wid, text]) => window.__e2eStore.getState().onUpdate(wid, { text }), [id, SNEAKY_WORDS]),
      ]);
      await pat.page.waitForTimeout(2500);
      const seen = await Promise.all([pat, sam].map((p) => p.page.evaluate(textOf, id)));
      if (seen[0].here !== seen[1].here) throw new Error(`Pat ${seen[0].here ? 'still has' : 'lost'} the window, Sam ${seen[1].here ? 'still has' : 'lost'} it`);
      return seen[0].here ? 'both kept the window (the edit won)' : 'both lost the window (the delete won)';
    });

    await check('hunt', 'a very long paste reaches the other screen whole', async () => {
      const long = `${'Made-up long paste line. '.repeat(2000)}end`;
      const id = await openNote(t);
      await pat.page.evaluate(([wid, text]) => window.__e2eStore.getState().onUpdate(wid, { text }), [id, long]);
      const seen = await bothSee(pat, sam, ([wid, n]) => {
        const text = String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? '');
        return { ok: text.length === n, length: text.length };
      }, [id, long.length], 15_000);
      if (!seen[1].ok) throw new Error(`Sam got ${seen[1].length} of ${long.length} characters (Pat's own copy has ${seen[0].length})`);
      return `Sam got all ${long.length} characters`;
    });

    await check('hunt', 'Sam\'s tab closed in the middle of a drag leaves no ghost on Pat\'s screen', async ({ shot }) => {
      const before = await readWindow(pat.page, note);
      const box = await windowFrame(sam.page, note).boundingBox();
      await sam.page.mouse.move(box.x + 80, box.y + 14);
      await sam.page.mouse.down();
      await sam.page.mouse.move(box.x + 180, box.y + 64, { steps: 5 });
      await sam.page.close();
      await pat.page.waitForTimeout(6000);
      const after = await readWindow(pat.page, note);
      const ghosts = await pat.page.getByTestId('remote-cursor').filter({ hasText: 'Sam Example' }).count();
      await shot(pat.page, 'after-sams-tab-closed-mid-drag');
      if (!after) throw new Error('the window disappeared from Pat\'s board');
      if (ghosts) throw new Error('Sam\'s cursor is still on Pat\'s screen after Sam left');
      const moved = before.x !== after.x || before.y !== after.y;
      return `no cursor left behind; the window ${moved ? 'kept the part of the drag that arrived' : 'stayed where it was'}`;
    });
  },
};
