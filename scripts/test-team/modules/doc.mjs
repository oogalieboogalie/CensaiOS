// Two people write in one Doc window: Pat Example writes a made-up
// paragraph, Sam Example sees it and adds a line, then both type into the
// middle of the same sentence at once; both screens must agree, with both
// people's words whole and each caret where its owner was typing. Pat adds a
// wiki link and a note on a line, and Sam sees both. Bug hunt: two lines that
// start with the same words typed at once, a 50,000-letter paste, Sam offline
// then back. All words are made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';

const PARAGRAPH = 'Made-up plan: we meet at noon by the old mill.';
const SAM_LINE = 'Made-up line from Sam: I will bring the lanterns.';
const PAT_INSERT = ' sharp';
const SAM_INSERT = ' on Friday';
const LINK_LINE = 'See [[Made-up Plan B]] if it rains.';
const NOTE_BODY = 'Made-up note from Pat: the mill gate sticks.';
const PAT_TWIN = 'Made-up list: Pat brings bread.';
const SAM_TWIN = 'Made-up list: Sam brings jam.';
const AWAY_LINE = 'Made-up line Pat wrote while Sam was away.';
const PASTE = `${'made up words '.repeat(3572)}end.`.slice(0, 50_000);

const textOf = (page, id) => page.evaluate((wid) => String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? ''), id);

/** Waits until a check on both people's copies passes; returns what each saw last. */
async function bothSee(t, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => textOf(p.page, t.docId)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
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

/** Opens the Doc's typing box the way a person does (a double-click). */
async function typingBox(page, id) {
  const frame = windowFrame(page, id);
  const box = frame.locator('[data-doc-body] textarea').first();
  if (!(await box.count())) await frame.locator('[data-doc-body]').first().dblclick();
  await box.waitFor({ timeout: 15_000 });
  return box;
}

/** Puts the caret right after `after` in this person's typing box. */
async function caretAfter(page, id, after) {
  const box = await typingBox(page, id);
  await box.click();
  await box.evaluate((el, words) => {
    const at = el.value.indexOf(words) + words.length;
    el.setSelectionRange(at, at);
  }, after);
  return box;
}

const caretOf = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el?.tagName === 'TEXTAREA' ? { at: el.selectionStart, text: el.value } : null;
});

/** Both type a line at the end at the same moment; both must end with the same text holding both. */
async function linesAtOnce(t, patLine, samLine) {
  const boxes = [];
  for (const p of [t.pat, t.sam]) {
    const box = await typingBox(p.page, t.docId);
    await box.click();
    await p.page.keyboard.press('Control+End');
    boxes.push(box);
  }
  await Promise.all([[t.pat, boxes[0], patLine], [t.sam, boxes[1], samLine]].map(async ([p, box, line]) => {
    await p.page.keyboard.press('Enter');
    await box.pressSequentially(line, { delay: 25 });
  }));
  const seen = await bothSee(t, (s) => s.includes(patLine) && s.includes(samLine));
  if (seen[0] !== seen[1]) throw new Error('the two screens disagree');
  if (!seen[0].includes(patLine) || !seen[0].includes(samLine)) throw new Error(`a line came out wrong: "${seen[0].slice(-120)}"`);
  return 'both lines are whole on both screens';
}

export default {
  id: 'doc',
  label: 'Two people write in one Doc window',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PARAGRAPH, SAM_LINE, NOTE_BODY, PAT_TWIN, SAM_TWIN, AWAY_LINE, LINK_LINE);

    await check('walk', 'Pat writes a paragraph in a Doc and Sam sees it, then adds a line', async ({ shot }) => {
      t.docId = await spawnWindow(pat.page, 'doc', { title: 'Made-up shared doc', text: '', isEditing: true }, { x: 120, y: 100 }, { w: 620, h: 420 });
      const box = await typingBox(pat.page, t.docId);
      await box.click();
      await box.pressSequentially(PARAGRAPH, { delay: 10 });
      const first = await bothSee(t, (s) => s.includes(PARAGRAPH));
      if (!first[1].includes(PARAGRAPH)) throw new Error(`Sam has "${first[1].slice(0, 80)}"`);
      const samBox = await typingBox(sam.page, t.docId);
      await samBox.click();
      await sam.page.keyboard.press('Control+End');
      await sam.page.keyboard.press('Enter');
      await samBox.pressSequentially(SAM_LINE, { delay: 10 });
      const seen = await bothSee(t, (s) => s.includes(SAM_LINE));
      await sideBySide(t, 'pat-writes-sam-adds-a-line', shot);
      if (!seen[0].includes(SAM_LINE)) throw new Error('Pat never got Sam\'s line');
      return 'Sam saw Pat\'s paragraph and Pat saw Sam\'s line';
    });

    await check('walk', 'both type into the middle of one sentence at once; words whole, carets where each was typing', async ({ shot }) => {
      await caretAfter(pat.page, t.docId, 'noon');
      await caretAfter(sam.page, t.docId, 'old mill');
      await Promise.all([
        pat.page.keyboard.type(PAT_INSERT, { delay: 30 }),
        sam.page.keyboard.type(SAM_INSERT, { delay: 30 }),
      ]);
      const want = `noon${PAT_INSERT} by the old mill${SAM_INSERT}.`;
      const seen = await bothSee(t, (s) => s.includes(want));
      await pat.page.waitForTimeout(800);
      const [patCaret, samCaret] = await Promise.all([caretOf(pat.page), caretOf(sam.page)]);
      await sideBySide(t, 'both-screens-after-typing-at-once', shot);
      const problems = [];
      if (seen[0] !== seen[1]) problems.push('the two screens disagree');
      if (!seen[0].includes(want)) problems.push(`the sentence came out as "${seen[0].split('\n')[0]}"`);
      const patWant = seen[0].indexOf(`noon${PAT_INSERT}`) + `noon${PAT_INSERT}`.length;
      const samWant = seen[0].indexOf(`mill${SAM_INSERT}`) + `mill${SAM_INSERT}`.length;
      if (patCaret?.at !== patWant) problems.push(`Pat's caret is at ${patCaret?.at}, not ${patWant} (after "sharp")`);
      if (samCaret?.at !== samWant) problems.push(`Sam's caret is at ${samCaret?.at}, not ${samWant} (after "Friday")`);
      if (problems.length) throw new Error(problems.join('; '));
      return `both have "${seen[0].split('\n')[0]}"; Pat's caret after "sharp", Sam's after "Friday"`;
    });

    await check('walk', 'Pat adds a wiki link and a note on a line, and Sam sees both', async ({ shot }) => {
      const box = await typingBox(pat.page, t.docId);
      await box.click();
      await pat.page.keyboard.press('Control+End');
      await pat.page.keyboard.press('Enter');
      await box.pressSequentially(LINK_LINE, { delay: 10 });
      await bothSee(t, (s) => s.includes(LINK_LINE));
      // Leave typing (the view shows links and lets a person select a line).
      await pat.page.mouse.click(1300, 820);
      await windowFrame(pat.page, t.docId).locator('[data-doc-body] textarea').waitFor({ state: 'detached', timeout: 10_000 });
      await windowFrame(pat.page, t.docId).locator('[data-doc-body]').evaluate((body) => {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = node.textContent.indexOf('old mill');
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + 'old mill'.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return;
        }
      });
      await windowFrame(pat.page, t.docId).getByTitle('Comment').click({ timeout: 10_000 });
      await windowFrame(pat.page, t.docId).getByPlaceholder('Add a comment…').fill(NOTE_BODY);
      await windowFrame(pat.page, t.docId).getByRole('button', { name: 'Save', exact: true }).click();
      const samFrame = windowFrame(sam.page, t.docId);
      // Edit and View are each person's own: Sam leaves typing to read the page.
      const samView = samFrame.getByRole('button', { name: 'View', exact: true });
      if (await samView.count()) await samView.first().click();
      const link = samFrame.locator('[data-wiki-link="Made-up Plan B"]').first();
      const noteCard = samFrame.getByText(NOTE_BODY).first();
      await Promise.all([link.waitFor({ timeout: 15_000 }), noteCard.waitFor({ timeout: 15_000 })]).catch(() => {});
      await sideBySide(t, 'sam-sees-the-link-and-the-note', shot);
      const problems = [];
      if (!(await link.count())) problems.push('Sam does not see the wiki link');
      if (!(await noteCard.count())) problems.push('Sam does not see Pat\'s note');
      const author = await samFrame.getByText(NOTE_BODY).first().locator('xpath=..').innerText().catch(() => '');
      if (problems.length) throw new Error(problems.join('; '));
      if (!/Pat Example/.test(author)) throw new Error(`Sam sees the note signed "${author.split('\n')[0]}", not Pat Example`);
      return 'Sam sees "Made-up Plan B" as a link and Pat\'s note, signed Pat Example';
    });

    await check('hunt', 'two lines that start with the same words, typed at once, both come out whole', async ({ shot }) => {
      try {
        return await linesAtOnce(t, PAT_TWIN, SAM_TWIN);
      } finally {
        await sideBySide(t, 'same-start-typed-at-once', shot);
      }
    });

    await check('hunt', 'a 50,000-letter paste reaches the other screen whole', async () => {
      const before = await textOf(pat.page, t.docId);
      const box = await typingBox(pat.page, t.docId);
      await box.click();
      await pat.page.keyboard.press('Control+End');
      await pat.page.keyboard.insertText(PASTE);
      const seen = await bothSee(t, (s) => s.length === before.length + PASTE.length, 20_000);
      if (seen[1].length !== before.length + PASTE.length) throw new Error(`Sam has ${seen[1].length - before.length} of ${PASTE.length} pasted letters (Pat ${seen[0].length - before.length})`);
      if (seen[0] !== seen[1]) throw new Error('the two screens disagree after the paste');
      return `Sam got all ${PASTE.length} letters`;
    });

    await check('hunt', 'Sam goes offline, Pat writes, Sam comes back with nothing lost', async ({ shot }) => {
      await sam.ctx.setOffline(true);
      await pat.page.waitForTimeout(1000);
      const box = await typingBox(pat.page, t.docId);
      await box.click();
      await pat.page.keyboard.press('Control+Home');
      await box.pressSequentially(`${AWAY_LINE}\n`, { delay: 10 });
      await pat.page.waitForTimeout(1500);
      await sam.ctx.setOffline(false);
      const seen = await bothSee(t, (s) => s.includes(AWAY_LINE), 30_000);
      await sideBySide(t, 'sam-is-back-and-caught-up', shot);
      if (!seen[1].includes(AWAY_LINE)) throw new Error('Sam never got Pat\'s offline line');
      if (seen[0] !== seen[1]) throw new Error('after catching up the two screens still disagree');
      if (![PARAGRAPH.slice(0, 20), SAM_LINE, PAT_TWIN, SAM_TWIN].every((w) => seen[1].includes(w))) throw new Error('earlier words were lost on the way');
      return 'Sam caught up and every earlier line is still there';
    });
  },
};
