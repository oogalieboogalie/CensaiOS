// The server's log never names a file someone asked for. Pat Example opens a
// made-up project in Files by typing its folder, opens its plans folder and a
// made-up budget note as a Document, and filters Files for the note by part
// of its name. Sam Example's screen shows the same Files window and the same
// Document with the note's words, and Sam filters for the note too. Red
// team: the server's log since then says what was asked (a folder listed, a
// file's words read, a filter) and never names the made-up folder, the file
// or what was filtered for. The board's list of open projects is put back as
// the module found it. All files and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PLANS = 'made-up-plans';
const NOTE = 'made-up-budget.md';
const NOTE_TEXT = 'Made-up budget: forty for the cake, ten for the balloons.';
const FILTER = 'made-up-budg';

const STATE_DIR = process.env.CENSAI_STATE_DIR ? path.resolve(process.env.CENSAI_STATE_DIR) : path.join(ROOT, '.homebase-state');
const OPEN_PROJECTS = path.join(STATE_DIR, 'open-projects.json');

/** Returns a function that puts the board's list of open projects back as it is now. */
function keepOpenProjects() {
  const before = fs.existsSync(OPEN_PROJECTS) ? fs.readFileSync(OPEN_PROJECTS, 'utf8') : null;
  return () => {
    if (before === null) fs.rmSync(OPEN_PROJECTS, { force: true });
    else fs.writeFileSync(OPEN_PROJECTS, before);
  };
}

async function waitFor(ok, page, ms = 10_000) {
  const until = Date.now() + ms;
  for (;;) {
    if (await ok()) return true;
    if (Date.now() > until) return false;
    await page.waitForTimeout(200);
  }
}

const listsText = async (page, id, words) => (await windowFrame(page, id).getByText(words).count()) > 0;
const panOf = (page) => page.evaluate(() => ({ ...window.__e2eStore.getState().pan }));
// For the pictures: the board looks where it did before the note opened, so Files' header shows.
const lookAt = (page, pan) => page.evaluate((p) => window.__e2eStore.getState().setPan(p), pan);

/** The Document for the note, opened from the Files tree on this screen if it is not open yet. */
async function openNote(page, filesId, at) {
  const has = () => page.evaluate((n) => window.__e2eStore.getState().wins
    .find((w) => w.kind === 'doc' && String(w.filePath || '').endsWith(n))?.id || null, NOTE);
  if (!(await has())) {
    await windowFrame(page, filesId).getByText(NOTE).first().click({ timeout: 5_000 });
    await page.waitForFunction((n) => window.__e2eStore.getState().wins
      .some((w) => w.kind === 'doc' && String(w.filePath || '').endsWith(n)), NOTE, { timeout: 10_000 });
  }
  const id = await has();
  await updateWindow(page, id, { ...at, w: 480, h: 320, width: 480, height: 320 });
  return id;
}

/** Types part of the note's name into this screen's Files filter; whether only the note is listed (the plans folder is not). */
async function filterFor(page, filesId) {
  const box = windowFrame(page, filesId).getByPlaceholder('Filter paths...');
  await box.fill(FILTER);
  return waitFor(async () => await listsText(page, filesId, NOTE) && !(await listsText(page, filesId, PLANS)), page);
}

export default {
  id: 'logsNameNoFiles',
  label: "The server's log never names a file someone asked for",
  async run(t) {
    const { pat, sam, check } = t;
    const putBackOpenProjects = keepOpenProjects();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-project-'));
    fs.mkdirSync(path.join(dir, PLANS));
    fs.writeFileSync(path.join(dir, PLANS, NOTE), `${NOTE_TEXT}\n`);
    // Never in any log: the project's folder, the file, what was filtered for or the note's words.
    const named = [path.basename(dir), PLANS, NOTE, FILTER, NOTE_TEXT];
    t.typed.push(...named);
    const logStart = t.serverLog().length;
    let filesId = null;
    let docId = null;
    let home = { x: 0, y: 0 };

    try {
      await check('walk', 'Pat opens a made-up project in Files by typing its folder, then its plans folder and the made-up budget note as a Document', async ({ shot }) => {
        home = await panOf(pat.page);
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        filesId = files.id;
        await updateWindow(pat.page, filesId, { x: 560, y: 120, w: 420, h: 420, width: 420, height: 420 });
        const pathBox = windowFrame(pat.page, filesId).locator('input[type="text"]').first();
        await pathBox.fill(dir);
        await pathBox.press('Enter');
        if (!(await waitFor(() => listsText(pat.page, filesId, PLANS), pat.page, 15_000))) throw new Error("Pat's Files does not list the project");
        await windowFrame(pat.page, filesId).getByText(PLANS).first().click({ timeout: 5_000 });
        if (!(await waitFor(() => listsText(pat.page, filesId, NOTE), pat.page))) throw new Error("Pat's Files does not list the plans folder's note");
        docId = await openNote(pat.page, filesId, { x: 16, y: 64 });
        const shows = await waitFor(() => listsText(pat.page, docId, NOTE_TEXT), pat.page, 15_000);
        await lookAt(pat.page, home);
        await pat.page.mouse.move(8, 8);
        await shot(pat.page, 'pat-opens-the-note');
        if (!shows) throw new Error("the Document opened without the note's words");
        return "the note opens as a Document with its made-up words";
      });

      // The board is shared: the Document Pat opened is on Sam's screen too, so Sam reads it there.
      await check('walk', "Sam's screen shows the same Files window, with the plans folder and the note, and the Document Pat opened with its words", async ({ shot }) => {
        if (!filesId || !docId) throw new Error('Files or the Document did not open in the first step');
        const onSams = (id) => sam.page.waitForFunction((winId) => window.__e2eStore.getState().wins.some((w) => w.id === winId), id, { timeout: 10_000 });
        await onSams(filesId);
        if (!(await waitFor(() => listsText(sam.page, filesId, PLANS), sam.page, 15_000))) throw new Error("Sam's Files does not list the project");
        if (!(await listsText(sam.page, filesId, NOTE))) await windowFrame(sam.page, filesId).getByText(PLANS).first().click({ timeout: 5_000 });
        if (!(await waitFor(() => listsText(sam.page, filesId, NOTE), sam.page))) throw new Error("Sam's Files does not list the note");
        await onSams(docId);
        await updateWindow(sam.page, docId, { x: 16, y: 400, w: 480, h: 320, width: 480, height: 320 });
        const shows = await waitFor(() => listsText(sam.page, docId, NOTE_TEXT), sam.page, 15_000);
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        await sam.page.mouse.move(8, 8);
        await sideBySide(t, 'both-screens-show-the-note', shot);
        if (!shows) throw new Error("the Document on Sam's screen shows no words");
        return "Sam's screen lists the note in Files and shows its made-up words";
      });

      await check('walk', 'Pat and Sam each filter Files by part of the note\'s name, and each screen lists the note', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const found = [];
        for (const p of [pat, sam]) found.push(await filterFor(p.page, filesId));
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        await Promise.all([pat, sam].map((p) => p.page.mouse.move(8, 8)));
        await sideBySide(t, 'both-filter-for-the-note', shot);
        const missing = [pat, sam].filter((_, i) => !found[i]).map((p) => p.who.name);
        if (missing.length) throw new Error(`${missing.join(' and ')}'s filter does not list the note`);
        return 'both filters list the note';
      });

      await check('redteam', "the server's log says what was asked (a folder listed, a file's words read, a filter) and never names the made-up folder, the file or what was filtered for", async () => {
        const added = t.serverLog().slice(logStart).split('\n');
        const asked = added.filter((line) => line.includes('[http]') && line.includes('/api/files/'));
        const expected = {
          'a folder listed': 'GET /api/files/browse?path=[redacted]',
          "a file's words read": 'GET /api/files/content?path=[redacted]',
          'a filter': 'GET /api/files/search?path=[redacted]&q=[redacted]',
        };
        const problems = Object.entries(expected).filter(([, line]) => !asked.some((l) => l.includes(line))).map(([what]) => `no log line for ${what} with its folder hidden`);
        const naming = added.filter((line) => named.some((words) => line.includes(words) || line.includes(encodeURIComponent(words))));
        if (naming.length) problems.push(`${naming.length} log lines name the made-up project, e.g. "${naming[0].replace(/^\S+\s+/, '').slice(0, 140)}"`);
        if (problems.length) throw new Error(problems.join('; '));
        return `${asked.length} Files requests logged, none naming the folder, the note or the filter, e.g. "${asked.find((l) => l.includes('/search'))?.replace(/^.*\[http\]\s*/, '').slice(0, 100)}"`;
      });
    } finally {
      putBackOpenProjects();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
