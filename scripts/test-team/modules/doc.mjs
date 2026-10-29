// Two people write in one Doc window: Pat Example writes a made-up
// paragraph, Sam Example sees it and adds a line, then both type into the
// middle of the same sentence at once; both screens must agree, with both
// people's words whole and each caret where its owner was typing. Pat adds a
// wiki link and a note on a line, and Sam sees both. Bug hunt: two lines that
// start with the same words typed at once, a 50,000-letter paste, Sam offline
// then back, a comment that stays on its words when a line is added above
// them and says so when they are deleted. Then the everyday basics: a new
// Document from the Add menu takes typing at once, one click edits where you
// click, a click on commented words opens the comments, and the comments
// panel is each person's own. Last, a Document whose file will not load says
// why and opens no editor. All words are made up.

import { openBoard, spawnWindow, windowFrame } from '../../e2e/board.mjs';

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
const LIST = 'Made-up shopping list: eggs, flour.';

const textOf = (page, id) => page.evaluate((wid) => String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? ''), id);

/** Waits until a check on both people's copies passes; returns what each saw last. */
async function bothSee(t, test, ms = 15_000, id = t.docId) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => textOf(p.page, id)));
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

/** Selects `words` in the read view the way a mouse does and saves a comment on them. */
async function addNote(page, id, words, body) {
  const frame = windowFrame(page, id);
  await frame.locator('[data-doc-body]').evaluate((el, find) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(find);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + find.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
  }, words);
  await frame.getByTitle('Comment', { exact: true }).click({ timeout: 10_000 });
  await frame.getByPlaceholder('Add a comment…').fill(body);
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
}

/** Where on screen the letter at `index` of the first shown line holding `words` starts. */
const spotOf = (page, id, words, index = 0) => windowFrame(page, id).locator('[data-doc-body]').evaluate((el, [find, i]) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.textContent.indexOf(find);
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(node, at + i);
    range.setEnd(node, at + i + 1);
    const box = range.getBoundingClientRect();
    return { x: box.left + 1, y: box.top + box.height / 2 };
  }
  return null;
}, [words, index]);

const commentsOpen = (page, id) => windowFrame(page, id).locator('[data-doc-comments]').count();

/** What this screen paints as notes, and the whole line each painted bit sits in. */
const painted = (page) => page.evaluate(() => [...(CSS.highlights?.get('hb-doc-note-comment') || [])].map((r) => ({
  words: r.toString(), line: r.startContainer.parentElement?.closest('[data-doc-body] > div')?.textContent || '',
})));

/** The words each saved note covers in the file itself. */
const savedWords = (page, id) => page.evaluate((wid) => {
  const win = window.__e2eStore.getState().wins.find((w) => w.id === wid);
  return (win?.annotations || []).map((a) => String(win.text || '').slice(a.start, a.end));
}, id);

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
    t.typed.push(PARAGRAPH, SAM_LINE, NOTE_BODY, 'Made-up note: bring the tarp.', PAT_TWIN, SAM_TWIN, AWAY_LINE, LINK_LINE);

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
      await addNote(pat.page, t.docId, 'old mill', NOTE_BODY);
      const samFrame = windowFrame(sam.page, t.docId);
      // Edit and View are each person's own: Sam leaves typing to read the page.
      const samView = samFrame.getByRole('button', { name: 'View', exact: true });
      if (await samView.count()) await samView.first().click();
      const link = samFrame.locator('[data-wiki-link="Made-up Plan B"]').first();
      await link.waitFor({ timeout: 15_000 }).catch(() => {});
      // The comments panel starts closed; Sam clicks the painted words to read the note.
      await samFrame.getByRole('button', { name: 'Comments 1' }).waitFor({ timeout: 15_000 }).catch(() => {});
      const spot = await spotOf(sam.page, t.docId, 'old mill', 2);
      if (spot) await sam.page.mouse.click(spot.x, spot.y);
      const noteCard = samFrame.getByText(NOTE_BODY).first();
      await noteCard.waitFor({ timeout: 15_000 }).catch(() => {});
      await sideBySide(t, 'sam-sees-the-link-and-the-note', shot);
      const problems = [];
      if (!(await link.count())) problems.push('Sam does not see the wiki link');
      if (!(await noteCard.count())) problems.push('a click on the painted words did not show Sam Pat\'s note');
      if (await samFrame.locator('[data-doc-body] textarea').count()) problems.push('the click on painted words opened the editor instead');
      const author = await samFrame.getByText(NOTE_BODY).first().locator('xpath=..').innerText().catch(() => '');
      if (problems.length) throw new Error(problems.join('; '));
      if (!/Pat Example/.test(author)) throw new Error(`Sam sees the note signed "${author.split('\n')[0]}", not Pat Example`);
      return 'Sam sees "Made-up Plan B" as a link, and one click on the painted "old mill" shows Pat\'s note, signed Pat Example';
    });

    await check('walk', 'Pat\'s note sits inside its sentence on both screens', async ({ shot }) => {
      const want = (p) => p.some((x) => x.words === 'old mill' && x.line.includes('by the old mill'));
      let seen = [];
      for (let i = 0; i < 40; i++) {
        seen = await Promise.all([pat.page, sam.page].map(painted));
        if (seen.every(want)) break;
        await pat.page.waitForTimeout(250);
      }
      await sideBySide(t, 'note-inside-its-sentence', shot);
      const problems = ['Pat', 'Sam'].map((who, i) => (want(seen[i] || []) ? '' : `${who} sees ${JSON.stringify(seen[i]).slice(0, 160)}`)).filter(Boolean);
      if (problems.length) throw new Error(`the note is not painted on "old mill" inside its line: ${problems.join('; ')}`);
      return `both screens paint "old mill" inside "${seen[0].find((x) => x.words === 'old mill').line}"`;
    });

    await check('hunt', 'a note on words after a wiki link lands on those words', async ({ shot }) => {
      await addNote(pat.page, t.docId, 'if it rains', 'Made-up note: bring the tarp.');
      await pat.page.waitForTimeout(800);
      const saved = await savedWords(pat.page, t.docId);
      const paint = await painted(pat.page);
      await shot(pat.page, 'note-after-a-link');
      if (!saved.includes('if it rains')) throw new Error(`the note was saved on "${saved[saved.length - 1]}", not "if it rains"`);
      if (!paint.some((x) => x.words === 'if it rains')) throw new Error(`the screen paints ${JSON.stringify(paint.map((x) => x.words))}`);
      return 'saved and painted on "if it rains", right after the [[Made-up Plan B]] link';
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

    await check('hunt', 'Pat\'s comment stays on "old mill" after a line is added above it, on both screens', async ({ shot }) => {
      // Both leave typing so the page shows its painted comments.
      await Promise.all([pat.page, sam.page].map((p) => p.mouse.click(1300, 820)));
      const want = (p) => p.some((x) => x.words === 'old mill' && x.line.includes('by the old mill'));
      let seen = [];
      for (let i = 0; i < 40; i++) {
        seen = await Promise.all([pat.page, sam.page].map(painted));
        if (seen.every(want)) break;
        await pat.page.waitForTimeout(250);
      }
      await sideBySide(t, 'comment-stays-on-its-words', shot);
      const problems = ['Pat', 'Sam'].map((who, i) => (want(seen[i] || []) ? '' : `${who}'s screen paints ${JSON.stringify((seen[i] || []).map((x) => x.words))}`)).filter(Boolean);
      if (problems.length) throw new Error(`after "${AWAY_LINE}" was added on top, the comment slid off "old mill": ${problems.join('; ')}`);
      return 'after a line was added on top, both screens still paint "old mill" inside "by the old mill"';
    });

    await check('hunt', 'when Pat deletes the words a comment was on, the comment says so and paints nothing', async ({ shot }) => {
      const box = await typingBox(pat.page, t.docId);
      await box.click();
      await box.evaluate((el) => {
        const at = el.value.indexOf('if it rains');
        el.setSelectionRange(at, at + 'if it rains'.length);
      });
      await pat.page.keyboard.press('Backspace');
      await bothSee(t, (s) => !s.includes('if it rains'));
      await Promise.all([pat.page, sam.page].map((p) => p.mouse.click(1300, 820)));
      const patFrame = windowFrame(pat.page, t.docId);
      if (!(await commentsOpen(pat.page, t.docId))) await patFrame.getByRole('button', { name: /^Comments/ }).click();
      await patFrame.locator('[data-note-lost]').first().waitFor({ timeout: 10_000 }).catch(() => {});
      await pat.page.waitForTimeout(500);
      const lostCards = await patFrame.locator('[data-note-lost]').count();
      const paint = await Promise.all([pat.page, sam.page].map(painted));
      await sideBySide(t, 'comment-on-deleted-words', shot);
      const problems = [];
      if (lostCards !== 1) problems.push(`Pat sees ${lostCards} comments marked as deleted, not 1`);
      const stray = paint.map((p) => p.map((x) => x.words).filter((w) => w !== 'old mill'));
      if (stray.some((w) => w.length)) problems.push(`the deleted comment is painted on other words: Pat ${JSON.stringify(stray[0])}, Sam ${JSON.stringify(stray[1])}`);
      if (problems.length) throw new Error(problems.join('; '));
      return 'the card says its words were deleted, and neither screen paints it on other words';
    });

    await check('walk', 'a new Document from the Add menu takes typing at once; on Sam\'s screen it opens to read, not in an editor', async ({ shot }) => {
      await pat.page.mouse.click(1300, 820);
      await pat.page.keyboard.press('Control+k');
      await pat.page.keyboard.type('Document');
      await pat.page.keyboard.press('Enter');
      await pat.page.waitForTimeout(1500);
      t.listId = await pat.page.evaluate(() => {
        const st = window.__e2eStore.getState();
        return st.wins.find((w) => w.id === st.activeId && w.kind === 'doc')?.id || null;
      });
      if (!t.listId) throw new Error('Add > Document did not open a Document');
      await pat.page.keyboard.type(LIST, { delay: 15 });
      const seen = await bothSee(t, (s) => s === LIST, 15_000, t.listId);
      await sam.page.waitForTimeout(500);
      const samEditor = await windowFrame(sam.page, t.listId).locator('[data-doc-body] textarea').count();
      await sideBySide(t, 'new-document-typed-at-once', shot);
      if (seen[0] !== LIST) throw new Error(`Pat's typing (no click first) gave "${seen[0]}"`);
      if (seen[1] !== LIST) throw new Error(`Sam has "${seen[1]}"`);
      if (samEditor) throw new Error('Pat\'s new Document opened in an editor on Sam\'s screen');
      return 'Pat typed straight away with no click; Sam reads the same words in the reading view';
    });

    await check('walk', 'one click on the words edits right where you clicked, and Sam gets the change', async ({ shot }) => {
      if (!t.listId) throw new Error('no new Document to click');
      await pat.page.mouse.click(1300, 820);
      await windowFrame(pat.page, t.listId).locator('[data-doc-body] textarea').waitFor({ state: 'detached', timeout: 10_000 });
      const spot = await spotOf(pat.page, t.listId, 'eggs,', 4);
      if (!spot) throw new Error('the words are not on Pat\'s screen');
      await pat.page.mouse.click(spot.x, spot.y);
      await pat.page.keyboard.type(' MILK', { delay: 20 });
      const want = 'eggs MILK, flour.';
      const seen = await bothSee(t, (s) => s.includes(want), 15_000, t.listId);
      await sideBySide(t, 'one-click-edits-where-you-click', shot);
      if (!seen[0].includes(want)) throw new Error(`one click then typing gave "${seen[0]}"`);
      if (!seen[1].includes(want)) throw new Error(`Sam has "${seen[1]}"`);
      return `one click between "eggs" and the comma, then typing, gave "${seen[0]}" on both screens`;
    });

    await check('walk', 'the comments panel is each person\'s own: Pat opens it, Sam\'s stays closed, even after Sam reloads', async ({ shot }) => {
      if (!t.listId) throw new Error('no new Document');
      const before = await commentsOpen(pat.page, t.listId);
      await windowFrame(pat.page, t.listId).getByRole('button', { name: 'Comments', exact: true }).click();
      await windowFrame(pat.page, t.listId).locator('[data-doc-comments]').waitFor({ timeout: 10_000 });
      await pat.page.waitForTimeout(4000);
      const samBefore = await commentsOpen(sam.page, t.listId);
      await openBoard(sam.page, t.workspaceId, t.web);
      await windowFrame(sam.page, t.listId).locator('[data-doc-body]').waitFor({ timeout: 20_000 });
      const samAfter = await commentsOpen(sam.page, t.listId);
      await sideBySide(t, 'comments-are-each-persons-own', shot);
      const problems = [];
      if (before) problems.push('Pat\'s new Document opened with the comments panel showing');
      if (samBefore) problems.push('Pat opening comments opened them on Sam\'s screen');
      if (samAfter) problems.push('after a reload Sam\'s comments panel came up open because Pat opened Pat\'s');
      if (problems.length) throw new Error(problems.join('; '));
      return 'closed by default, opened only on Pat\'s screen, and still closed for Sam after Sam reloads';
    });

    await check('hunt', 'a Document whose file will not load says why, and a click opens no editor that Save could never keep', async ({ shot }) => {
      const id = await spawnWindow(pat.page, 'doc', { title: 'Made-up missing file', fileName: 'made-up-missing.md', filePath: 'made-up/missing-file.md' }, { x: 760, y: 100 }, { w: 520, h: 320 });
      const frame = windowFrame(pat.page, id);
      const error = frame.getByTestId('file-load-error');
      await error.waitFor({ timeout: 15_000 });
      await frame.locator('[data-doc-body]').click();
      await pat.page.waitForTimeout(500);
      const editors = await frame.locator('[data-doc-body] textarea').count();
      const hint = await frame.getByText('Click anywhere to start writing').count();
      const editOff = await frame.getByRole('button', { name: 'Edit', exact: true }).isDisabled();
      await shot(pat.page, 'file-that-will-not-load');
      const problems = [];
      if (editors) problems.push('a click opened an editor on a file that never loaded');
      if (hint) problems.push('it still says "Click anywhere to start writing"');
      if (!editOff) problems.push('the Edit button still works');
      if (problems.length) throw new Error(problems.join('; '));
      const words = error.locator('span');
      const says = (await words.count()) ? await words.first().textContent() : await error.textContent();
      return `it says "${says.trim()}", Edit is off, and a click opens nothing`;
    });
  },
};
