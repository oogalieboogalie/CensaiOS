// Add (Ctrl+K) finds a window by every name the board shows for it. Pat
// Example and Sam Example each type "Project files", the title Files shows:
// the first row, under Best match, reads "Project files" (its hint says it is
// Files), and Enter opens Files with "Project files" in its header, on both
// screens. A word of it ("project") lists Files by that name too, under
// "Also known as", after the windows whose own name or description says
// project; letters inside a word ("ject") do not. Each
// starting button on the empty board ("Chat with Censai", "Find leads",
// "Browse modules"), typed in Add, opens the window its button opens, and
// each ready-made board chip's name finds that board first. Then every
// window in Add is put on the board the way Add puts it, and whatever name
// its header shows, typed back into Add, opens that same window (headers
// that show what is inside, such as a document's name, are listed apart).
// The Image Generator, opened from Add beside Image, says "Image Generator"
// in its header on both screens, and Image still says "Image". Bug hunt: a module named exactly what was typed still comes first (Image,
// not the Image Generator, whose name starts with it), and a search for
// nothing that exists still offers to make a new module.

import fs from 'node:fs';
import path from 'node:path';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';
import { openBoard, windowFrame } from '../../e2e/board.mjs';

const FILES_TITLE = 'Project files';
const NOTHING = 'made-up gadget for counting clouds';

// Headers that show what is inside the window (a document's, a file's, an
// agent's or a team's name) rather than the window's own name; Add is not
// meant to find a window by those.
const SHOWS_CONTENT = new Set([
  'doc', 'code_editor', 'image', 'chat', 'group', 'workflow', 'weewoo', 'searchEngine',
  'officeDocs', 'officeSheets', 'officeSlides', 'creativePhoto', 'creativeVector', 'creativeVideo',
  'yorPdf', 'yorPhotos', 'yorLayout', 'yorDiagrams', 'yor3d', 'yorCad', 'vaultNotes',
]);

/** Add's rows on this person's screen, top to bottom: { section, id, label, hint }. */
const addRows = (page) => page.evaluate(() => [...document.querySelectorAll('.hb-palette [role="group"]')]
  .flatMap((group) => [...group.querySelectorAll('[data-palette-item]')].map((row) => ({
    section: group.getAttribute('aria-label') || '',
    id: row.getAttribute('data-palette-item'),
    label: row.querySelector('.hb-palette-label')?.textContent || '',
    hint: row.querySelector('.hb-palette-hint')?.textContent || '',
  }))));

/** Opens Add the way a person does and types `words`; returns its rows. */
async function typeInAdd(page, words) {
  await page.mouse.click(1300, 120);
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.querySelector('.hb-palette-input')?.value === '', null, { timeout: 5_000 });
  if (words) await page.keyboard.type(words, { delay: 15 });
  await page.waitForTimeout(300);
  return addRows(page);
}

const closeAdd = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.hb-palette-input'), null, { timeout: 5_000 }).catch(() => {});
};

const clearBoard = async (t) => {
  await t.pat.page.evaluate(() => window.__e2eStore.getState().setWins([]));
  await t.pat.page.waitForTimeout(600);
};

const newWindow = (page, before) => page.evaluate((ids) => {
  const win = window.__e2eStore.getState().wins.find((w) => !ids.includes(w.id));
  return win ? { id: win.id, kind: win.kind } : null;
}, before);

/** What a window's header says, read from the screen. */
async function titleOf(page, id) {
  // Once the window has loaded: until then the frame shows its stand-in title.
  await page.waitForFunction((wid) => {
    const frame = document.querySelector(`[data-win-id="${wid}"]`);
    return frame && !frame.textContent.includes('loading window...');
  }, id, { timeout: 25_000, polling: 250 }).catch(() => {});
  const label = windowFrame(page, id).locator('.hb-win-header .hb-win-label').first();
  await label.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
  return ((await label.textContent({ timeout: 2_000 }).catch(() => '')) || '').trim();
}

// The step's own time limit is 90 seconds: a batch (at most about 30 s) is
// started only in the first 55, so the reading always ends in time.
const READ_FOR_MS = 55_000;
const BATCH = 25;

/**
 * Puts each kind on the board the way Add does (the store's spawnAt with
 * Add's own props for it), waits until each has loaded, and reads what its
 * header says. Returns [{ kind, title }].
 */
async function headersOf(page, kinds) {
  const ids = await page.evaluate(async (list) => {
    const { PROPS_BY_KIND } = await import('/src/lib/modules/addPaletteItems.js');
    const st = window.__e2eStore.getState();
    return list.map((kind) => st.spawnAt(kind, PROPS_BY_KIND[kind] || {}));
  }, kinds);
  const loaded = (list) => list.map((id) => {
    const frame = document.querySelector(`[data-win-id="${id}"]`);
    return Boolean(frame && !frame.textContent.includes('loading window...'));
  });
  await page.waitForFunction((list) => list.every((id) => {
    const frame = document.querySelector(`[data-win-id="${id}"]`);
    return frame && !frame.textContent.includes('loading window...');
  }), ids, { timeout: 25_000, polling: 250 }).catch(() => {});
  await page.waitForTimeout(500);
  const done = await page.evaluate(loaded, ids);
  const titles = await page.evaluate((list) => list.map((id) => {
    const label = document.querySelector(`[data-win-id="${id}"] .hb-win-header .hb-win-label`);
    return (label?.textContent || '').trim();
  }), ids);
  return kinds.map((kind, i) => ({ kind, title: titles[i], loading: !done[i] }));
}

export default {
  id: 'addNames',
  label: 'Add finds a window by every name the board shows',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(NOTHING);

    await check('walk', `both type "${FILES_TITLE}", the title Files shows: the first row reads "${FILES_TITLE}" under Best match, and Enter opens Files on each screen`, async ({ shot }) => {
      const [patRows, samRows] = await Promise.all([pat, sam].map((p) => typeInAdd(p.page, FILES_TITLE)));
      await shot(pat.page, 'project-files-typed-pat');
      await sideBySide(t, 'project-files-typed', shot);
      const problems = [];
      for (const [who, rows] of [['Pat', patRows], ['Sam', samRows]]) {
        const top = rows[0];
        if (!top || top.id !== 'kind:files') problems.push(`${who}'s first row is ${top ? `"${top.label}" (${top.id})` : 'missing'}, not Files`);
        else if (top.section !== 'Best match' || top.label !== FILES_TITLE) problems.push(`${who}'s first row reads "${top.label}" under "${top.section}"`);
        if (top && !top.hint.startsWith('Files')) problems.push(`${who}'s row does not say it is Files (hint "${top.hint}")`);
        if (rows.filter((r) => r.id === 'kind:files').length !== 1) problems.push(`${who} sees Files ${rows.filter((r) => r.id === 'kind:files').length} times`);
        if (rows.at(-1)?.id !== 'make:query') problems.push(`${who}'s last row is not "Make a new module"`);
      }
      const opened = [];
      for (const p of [pat, sam]) {
        const before = await p.page.evaluate(() => window.__e2eStore.getState().wins.map((w) => w.id));
        await p.page.keyboard.press('Enter');
        await p.page.waitForFunction((ids) => window.__e2eStore.getState().wins.some((w) => !ids.includes(w.id)), before, { timeout: 8_000 }).catch(() => {});
        await p.page.waitForTimeout(900);
        opened.push(await newWindow(p.page, before));
      }
      opened.forEach((win, i) => { if (win?.kind !== 'files') problems.push(`Enter opened ${win?.kind || 'nothing'} for ${i ? 'Sam' : 'Pat'}`); });
      // Both new windows reach both screens, each headed with the name typed.
      const titles = [];
      for (const p of [pat, sam]) {
        await p.page.waitForFunction(() => window.__e2eStore.getState().wins.filter((w) => w.kind === 'files').length === 2, null, { timeout: 10_000 }).catch(() => {});
        const ids = await p.page.evaluate(() => window.__e2eStore.getState().wins.filter((w) => w.kind === 'files').map((w) => w.id));
        if (ids.length !== 2) problems.push(`${p === pat ? 'Pat' : 'Sam'} sees ${ids.length} Files windows, not 2`);
        for (const id of ids) titles.push(await titleOf(p.page, id));
      }
      if (titles.some((title) => title !== FILES_TITLE)) problems.push(`the Files headers say ${titles.map((x) => `"${x}"`).join(', ')}`);
      await sideBySide(t, 'project-files-opened', shot);
      if (problems.length) throw new Error(problems.join('; '));
      return `each first row reads "${FILES_TITLE}" (hint "${patRows[0].hint}"); each Enter opened Files, and both screens show both, headed "${FILES_TITLE}"`;
    });

    await check('walk', 'a word of that name ("project") lists Files by that name, after the windows whose own name or description says project', async ({ shot }) => {
      await clearBoard(t);
      const rows = await typeInAdd(pat.page, 'project');
      await shot(pat.page, 'project-typed');
      await closeAdd(pat.page);
      const inside = await typeInAdd(pat.page, 'ject');
      await closeAdd(pat.page);
      const at = rows.findIndex((r) => r.id === 'kind:files');
      const files = rows[at];
      if (!files) throw new Error(`"project" does not list Files (rows: ${rows.map((r) => r.label).join(', ')})`);
      const problems = [];
      if (files.label !== FILES_TITLE || !files.hint.startsWith('Files')) problems.push(`Files reads "${files.label}" ("${files.hint}")`);
      if (files.section !== 'Also known as') problems.push(`Files is under "${files.section}"`);
      const after = rows.slice(at + 1).filter((r) => !['Also known as', 'Ready-made boards', 'Templates', ''].includes(r.section));
      if (after.length) problems.push(`windows found by their own words come after it: ${after.map((r) => r.label).join(', ')}`);
      if (inside.some((r) => r.id === 'kind:files')) problems.push('"ject" (letters inside a word) lists Files too');
      if (problems.length) throw new Error(problems.join('; '));
      return `Files is listed as "${files.label}" ("${files.hint}") under "Also known as", after ${at} rows found by their own words; "ject" does not list it`;
    });

    await check('walk', 'each starting button on the empty board, typed in Add, opens the window its button opens; each ready-made board chip finds its board first', async ({ shot }) => {
      await clearBoard(t);
      const pad = pat.page.locator('[data-testid="launchpad-starts"] button');
      await pad.first().waitFor({ timeout: 10_000 });
      const starts = (await pad.allTextContents()).map((s) => s.trim());
      const chips = (await pat.page.locator('[data-testid="launchpad-templates"] button').allTextContents()).map((s) => s.trim());
      await shot(pat.page, 'empty-board-names');
      const problems = [];
      const done = [];
      for (const name of starts) {
        // "Browse modules" opens Add itself; the window by that name is the module Marketplace.
        let want = 'marketplace';
        if (name !== 'Browse modules') {
          await clearBoard(t);
          const before = await pat.page.evaluate(() => window.__e2eStore.getState().wins.map((w) => w.id));
          await pat.page.locator('[data-testid="launchpad-starts"] button', { hasText: name }).first().click({ timeout: 5_000 });
          await pat.page.waitForTimeout(900);
          want = (await newWindow(pat.page, before))?.kind;
        }
        await clearBoard(t);
        const got = await addFromMenu(pat.page, name);
        if (!want || got.kind !== want) problems.push(`"${name}" in Add opened ${got.kind || 'nothing'}, the button ${want || 'nothing'}`);
        else done.push(`"${name}" → ${got.kind}`);
      }
      for (const chip of chips) {
        const rows = await typeInAdd(pat.page, chip);
        if (chip === 'Real Estate') await shot(pat.page, 'real-estate-typed');
        await closeAdd(pat.page);
        if (rows[0]?.section !== 'Best match' || !rows[0]?.id.startsWith('board:')) problems.push(`the chip "${chip}" finds "${rows[0]?.label}" under "${rows[0]?.section}" first`);
      }
      if (starts.length !== 3) problems.push(`the empty board shows ${starts.length} starting buttons: ${starts.join(', ')}`);
      if (problems.length) throw new Error(problems.join('; '));
      return `${done.join(', ')}; the ${chips.length} board chips (${chips.join(', ')}) each find their board first`;
    });

    let inAdd = [];
    const shown = [];
    // Two halves, each inside the step's time limit. Sam leaves the board
    // meanwhile, so one browser, not two, draws a hundred windows.
    for (const half of [1, 2]) {
      await check('walk', `every window in Add (${half === 1 ? 'first' : 'second'} half), put on the board the way Add puts it: its header is read`, async ({ shot }) => {
        await clearBoard(t);
        if (half === 1) {
          await sam.page.goto('about:blank');
          // Each window once (with nothing typed, Recent repeats a few of them).
          inAdd = [...new Map((await typeInAdd(pat.page, '')).filter((r) => r.id.startsWith('kind:')).map((r) => [r.id, r])).values()];
          await closeAdd(pat.page);
        }
        const mid = Math.ceil(inAdd.length / 2);
        const part = half === 1 ? inAdd.slice(0, mid) : inAdd.slice(mid);
        const read = [];
        const started = Date.now();
        for (let i = 0; i < part.length && Date.now() - started < READ_FOR_MS; i += BATCH) {
          const rows = part.slice(i, i + BATCH);
          read.push(...(await headersOf(pat.page, rows.map((r) => r.id.slice('kind:'.length)))).map((w, j) => ({ ...w, label: rows[j].label })));
          if (i === 0) await shot(pat.page, `windows-${half}`);
          await clearBoard(t);
        }
        shown.push(...read);
        const stuck = read.filter((w) => w.loading).map((w) => w.label);
        if (read.length < part.length) throw new Error(`read ${read.length} of ${part.length} headers in ${Math.round((Date.now() - started) / 1000)} s (still loading: ${stuck.join(', ') || 'none'})`);
        if (stuck.length) throw new Error(`${stuck.length} windows were still loading after 25 s: ${stuck.join(', ')}`);
        const blank = read.filter((w) => !w.title);
        if (blank.length) throw new Error(`${blank.length} windows show no title in their header: ${blank.map((w) => w.label).join(', ')}`);
        const own = read.filter((w) => w.title.toLowerCase() === w.label.toLowerCase()).length;
        return `${read.length} of the ${inAdd.length} windows read; ${own} headers show the row's own name, ${read.length - own} another`;
      });
    }

    // The whole list, for a reader: each window's row and what its header said.
    fs.writeFileSync(path.join(t.outRoot, 'addNames', `${t.report.theme || 'dark'}-headers.json`), JSON.stringify(shown, null, 1));
    const other = shown.filter((w) => w.title && w.title.toLowerCase() !== w.label.toLowerCase());

    await check('walk', 'whatever other name a window\'s header shows, typed in Add, opens that same window', async ({ shot }) => {
      await openBoard(sam.page, t.workspaceId, t.web);
      const names = other.filter((w) => !SHOWS_CONTENT.has(w.kind));
      const problems = [];
      const found = [];
      const ownName = new Map(inAdd.map((r) => [r.label.toLowerCase(), r]));
      for (const w of names) {
        await clearBoard(t);
        // Another module named that comes first; this window is listed after it.
        const named = ownName.get(w.title.toLowerCase());
        if (named && named.id !== `kind:${w.kind}`) {
          const rows = await typeInAdd(pat.page, w.title);
          await closeAdd(pat.page);
          if (rows[0]?.id !== named.id || !rows.some((r) => r.id === `kind:${w.kind}`)) {
            problems.push(`"${w.title}" lists ${rows.map((r) => r.label).join(', ')}, not ${named.label} first and ${w.label} after it`);
          } else found.push(`${w.title} (after ${named.label})`);
          continue;
        }
        const got = await addFromMenu(pat.page, w.title);
        if (w.title === FILES_TITLE) await shot(pat.page, 'files-opened-by-title');
        if (got.kind !== w.kind) problems.push(`"${w.title}" (the header of ${w.label}) opened ${got.kind || 'nothing'}`);
        else found.push(w.title);
      }
      await clearBoard(t);
      if (!names.some((w) => w.title === FILES_TITLE)) problems.push(`Files' header did not say "${FILES_TITLE}"`);
      if (problems.length) throw new Error(problems.join('; '));
      return `${found.length} other names, each opened its window: ${found.join(', ')}`;
    });

    await check('walk', 'headers that show what is inside a window (a document\'s or an agent\'s name) are not names Add finds it by', async () => {
      const content = other.filter((w) => SHOWS_CONTENT.has(w.kind));
      return `${content.length}: ${content.map((w) => `${w.label} "${w.title}"`).join(', ')}`;
    });

    await check('walk', 'the Image Generator, opened from Add beside Image, says "Image Generator" in its header on both screens, and Image still says "Image"', async ({ shot }) => {
      await clearBoard(t);
      const gen = await addFromMenu(pat.page, 'Image Generator');
      const image = await addFromMenu(pat.page, 'Image');
      const problems = [];
      if (gen.kind !== 'genImage') problems.push(`"Image Generator" opened ${gen.kind || 'nothing'}`);
      if (image.kind !== 'image') problems.push(`"Image" opened ${image.kind || 'nothing'}`);
      // Set side by side, in view on both screens, so one picture shows both headers.
      const besideX = await pat.page.evaluate(([a, b]) => {
        const st = window.__e2eStore.getState();
        const first = st.wins.find((w) => w.id === a);
        const x = (first?.w || first?.width || 560) + 40;
        st.onUpdate(a, { x: 0, y: 0 });
        st.onUpdate(b, { x, y: 0 });
        return x;
      }, [gen.id, image.id]);
      for (const p of [pat, sam]) await p.page.evaluate(() => { const st = window.__e2eStore.getState(); st.setZoom(1); st.setPan({ x: 120, y: 90 }); });
      await sam.page.waitForFunction(([id, x]) => window.__e2eStore.getState().wins.find((w) => w.id === id)?.x === x,
        [image.id, besideX], { timeout: 10_000 }).catch(() => problems.push('Sam\'s screen did not get both windows side by side'));
      await pat.page.waitForTimeout(600);
      const said = [];
      for (const [who, p] of [['Pat', pat], ['Sam', sam]]) {
        const [genTitle, imageTitle] = [await titleOf(p.page, gen.id), await titleOf(p.page, image.id)];
        if (genTitle !== 'Image Generator') problems.push(`the Image Generator's header on ${who}'s screen says "${genTitle}"`);
        if (imageTitle !== 'Image') problems.push(`Image's header on ${who}'s screen says "${imageTitle}"`);
        said.push(`${who}: "${genTitle}" and "${imageTitle}"`);
      }
      await shot(pat.page, 'image-generator-beside-image-pat');
      await sideBySide(t, 'image-generator-beside-image', shot);
      if (problems.length) throw new Error(problems.join('; '));
      return `the two headers read ${said.join('; ')}`;
    });

    await check('hunt', 'a module named exactly what was typed still comes first, and a search for nothing that exists still offers to make one', async ({ shot }) => {
      await clearBoard(t);
      const image = await addFromMenu(pat.page, 'Image');
      await clearBoard(t);
      const settings = await addFromMenu(pat.page, 'Settings');
      await clearBoard(t);
      const rows = await typeInAdd(pat.page, NOTHING);
      await shot(pat.page, 'nothing-matches');
      await closeAdd(pat.page);
      const problems = [];
      if (image.kind !== 'image') problems.push(`"Image" opened ${image.kind || 'nothing'}, not the Image window`);
      if (settings.kind !== 'appearance') problems.push(`"Settings" opened ${settings.kind || 'nothing'}`);
      if (rows.length !== 1 || rows[0].id !== 'make:query') problems.push(`a made-up search shows ${rows.map((r) => `"${r.label}"`).join(', ')}`);
      if (problems.length) throw new Error(problems.join('; '));
      return '"Image" opened Image (not the Image Generator), "Settings" opened Settings, and the made-up search offers only "Make a new module"';
    });

    await clearBoard(t);
    // A hundred windows were drawn on this shared board: both leave it, so
    // the next run (the other theme) has the browser to itself.
    await Promise.all([pat, sam].map((p) => p.page.goto('about:blank').catch(() => {})));
  },
};
