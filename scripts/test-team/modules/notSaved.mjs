// A Save that did not save says so. Pat Example opens a made-up project in
// Files and, from its notes folder, a made-up note as a Document and a
// made-up code file in the Code editor. A line Pat adds to the note saves.
// Then the notes folder is moved away outside censaiOS, the way another
// program would: Pat types a line in each window and presses Save, and each
// says in plain words that the file was not saved and why, with the typed
// line still on screen. The folder is put back and Save keeps every line.
// Sam Example, a teammate, types in the note and presses Save: Sam's window
// says only this computer's owner can save files, Sam's line stays on Sam's
// screen and the file is unchanged; Close takes the words away and leaves
// the line. Bug hunt: the code file replaced by a folder outside censaiOS
// says so in plain words, never the server's own, and Files' New file with
// the name of a file already there says so and leaves that file as it was.
// Red team: Sam's save sent straight to the server is refused and writes
// nothing; a save outside the open projects writes nothing; a save into a
// folder that is gone answers 404 in plain words, never the server's folders.
// The board's list of open projects is put back as the module found it. All
// files and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import * as fileProblems from '../../../shared/files/fileProblems.js';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SAVE = fileProblems.SAVE_PROBLEMS || {};
const notSaved = (name, why) => fileProblems.notSavedWords?.(name, why) ?? `(no plain words for ${name})`;
const NOTE = 'made-up-plan.md';
const NOTE_TEXT = 'Made-up plan: the bake sale is on Saturday.';
const LIST = 'made-up-list.md';
const LIST_TEXT = 'Made-up list: cups, plates and napkins.';
const CODE = 'made-up-tool.js';
const CODE_WORD = 'madeUpGreeting';
const CODE_TEXT = `// Made-up tool\nexport const ${CODE_WORD} = 'hello from a made-up file';\n`;
const LINES = {
  saved: 'Made-up line: bring the cake stand.',
  away: 'Made-up line typed while its folder was away.',
  codeAway: '// made-up line typed while its folder was away',
  sam: 'Made-up line typed on the teammate screen.',
};
const TECHNICAL = /status \d|ENOENT|EISDIR|EACCES|no such file|illegal operation|Access denied|the server said|undefined/i;

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

const winOf = (page, kind, name) => page.evaluate(([k, n]) => window.__e2eStore.getState().wins
  .find((w) => w.kind === k && String(w.filePath || '').endsWith(n))?.id || null, [kind, name]);

/** The words a Document or Code editor shows: its typing box or code, else its page. */
const shownText = (page, id) => windowFrame(page, id).evaluate((el) => {
  const box = el.querySelector('textarea');
  if (box) return box.value;
  const code = el.querySelector('.cm-content');
  return code ? code.innerText : (el.querySelector('[data-doc-body]')?.textContent || '');
});

async function waitFor(ok, page, ms = 10_000) {
  const until = Date.now() + ms;
  for (;;) {
    if (await ok()) return true;
    if (Date.now() > until) return false;
    await page.waitForTimeout(200);
  }
}

/** Clicks a file (or folder) in the Files tree; a file's window is moved to `at`. */
async function openFromTree(page, filesId, name, kind, at) {
  await windowFrame(page, filesId).getByText(name).first().click({ timeout: 5_000 });
  if (!kind) return null;
  await page.waitForFunction(([k, n]) => window.__e2eStore.getState().wins
    .some((w) => w.kind === k && String(w.filePath || '').endsWith(n)), [kind, name], { timeout: 10_000 });
  const id = await winOf(page, kind, name);
  await updateWindow(page, id, { ...at, w: 500, h: 400, width: 500, height: 400 });
  return id;
}

/** Types `line` on a new line at the end of a Document or the Code editor. */
async function typeAtEnd(page, id, line) {
  const frame = windowFrame(page, id);
  const code = frame.locator('.cm-content');
  if (await code.count()) {
    await code.first().click({ timeout: 5_000 });
  } else {
    // A Document that is not being edited starts editing where its words are clicked.
    if (!(await frame.locator('textarea').count())) await frame.locator('[data-doc-body]').first().click();
    await frame.locator('textarea').first().click({ timeout: 5_000 });
  }
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(line, { delay: 10 });
}

const pressSave = (page, id) => windowFrame(page, id).getByRole('button', { name: 'Save', exact: true }).click({ timeout: 5_000 });

/** What the window says about its last save (its words, not its Close button), or ''. */
const saveSays = (page, id) => windowFrame(page, id).locator('[data-testid$="save-note"]').first()
  .evaluate((el) => (el.querySelector('span') || el).textContent, null, { timeout: 500 }).then((s) => s.trim(), () => '');

/** Waits for the window to say something about saving that `ok` accepts; what it said. */
async function sayingOf(page, id, ok = (s) => s !== '', ms = 10_000) {
  let said = '';
  await waitFor(async () => ok(said = await saveSays(page, id)), page, ms);
  return said;
}

const sayWhat = (text) => (text ? `"${text}"` : 'nothing');

/** Problems with a save message that should read `want`. */
function sayingProblems(who, said, want, dir) {
  const problems = [];
  if (said !== want) problems.push(`${who} says ${sayWhat(said)}, not "${want}"`);
  if (TECHNICAL.test(said)) problems.push(`${who}'s message is in technical words`);
  if (said.includes(dir) || said.includes(os.tmpdir())) problems.push(`${who}'s message names the server's folders`);
  return problems;
}

const fileHas = (file, words) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(words);

export default {
  id: 'notSaved',
  label: 'A Save that did not save says so',
  async run(t) {
    const { pat, sam, check } = t;
    const putBackOpenProjects = keepOpenProjects();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-project-'));
    const notes = path.join(dir, 'notes');
    const away = `${dir}-notes-moved-away`;
    const notePath = path.join(notes, NOTE);
    const codePath = path.join(notes, CODE);
    const listPath = path.join(dir, LIST);
    fs.mkdirSync(notes);
    fs.writeFileSync(notePath, `${NOTE_TEXT}\n`);
    fs.writeFileSync(codePath, CODE_TEXT);
    fs.writeFileSync(listPath, `${LIST_TEXT}\n`);
    // The made-up folder is typed into Files: the harness checks no log names it either.
    t.typed.push(NOTE_TEXT, CODE_WORD, LIST_TEXT, ...Object.values(LINES), path.basename(dir));
    let filesId = null;
    let docId = null;
    let codeId = null;

    try {
      await check('walk', 'Pat opens a made-up project in Files and, from its notes folder, the note as a Document and the code file in the Code editor', async ({ shot }) => {
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        filesId = files.id;
        await updateWindow(pat.page, files.id, { x: 540, y: 480, w: 360, h: 380, width: 360, height: 380 });
        const pathBox = windowFrame(pat.page, files.id).locator('input[type="text"]').first();
        await pathBox.fill(dir);
        await pathBox.press('Enter');
        await openFromTree(pat.page, files.id, 'notes');
        if (!(await waitFor(async () => (await windowFrame(pat.page, files.id).getByText(NOTE).count()) > 0, pat.page))) {
          throw new Error('Files does not list the notes folder\'s files');
        }
        docId = await openFromTree(pat.page, files.id, NOTE, 'doc', { x: 16, y: 64 });
        codeId = await openFromTree(pat.page, files.id, CODE, 'code_editor', { x: 924, y: 64 });
        const shows = await waitFor(async () => (await shownText(pat.page, docId)).includes(NOTE_TEXT)
          && (await shownText(pat.page, codeId)).includes(CODE_WORD), pat.page, 15_000);
        await pat.page.mouse.move(8, 8);
        await shot(pat.page, 'both-files-open');
        if (!shows) throw new Error('the windows opened without their files\' words');
        return 'the note opens as a Document and the code file in the Code editor, each with its made-up words';
      });

      await check('walk', 'Pat adds a line to the note and presses Save: the file has it, and nothing says it was not saved', async () => {
        if (!docId) throw new Error('the note did not open in the step before');
        await typeAtEnd(pat.page, docId, LINES.saved);
        await pressSave(pat.page, docId);
        const saved = await waitFor(async () => fileHas(notePath, LINES.saved), pat.page);
        const said = await saveSays(pat.page, docId);
        if (!saved) throw new Error('Save did not put the line in the file');
        if (/not saved/i.test(said)) throw new Error(`the Document says ${sayWhat(said)}`);
        return 'the line is in the file on disk';
      });

      await check('walk', 'the notes folder is moved away outside censaiOS; Pat types a line in each window and presses Save: each says in plain words it was not saved and why, and the line stays on screen', async ({ shot }) => {
        if (!docId || !codeId) throw new Error('the files did not open in the first step');
        fs.renameSync(notes, away);
        const problems = [];
        const seen = [];
        for (const [id, name, line, what] of [[docId, NOTE, LINES.away, 'Document'], [codeId, CODE, LINES.codeAway, 'Code editor']]) {
          await typeAtEnd(pat.page, id, line);
          await pressSave(pat.page, id);
          const said = await sayingOf(pat.page, id, (s) => s !== '' && !/^saved/i.test(s));
          seen.push(said);
          problems.push(...sayingProblems(`Pat's ${what}`, said, notSaved(name, SAVE.gone), dir));
          if (!(await shownText(pat.page, id)).includes(line)) problems.push(`Pat's ${what} lost the line typed`);
        }
        await pat.page.mouse.move(8, 8);
        await shot(pat.page, 'not-saved-folder-moved-away');
        if (fs.existsSync(notes)) problems.push('the notes folder came back by itself');
        if (problems.length) throw new Error(problems.join('; '));
        return `the Document says "${seen[0]}"; the Code editor says "${seen[1]}"`;
      });

      await check('walk', 'the folder is put back and Save keeps every line: the one saved before and the ones typed while it was away', async ({ shot }) => {
        if (!docId || !codeId) throw new Error('the files did not open in the first step');
        if (fs.existsSync(away)) fs.renameSync(away, notes);
        await pressSave(pat.page, docId);
        await pressSave(pat.page, codeId);
        const problems = [];
        if (!(await waitFor(async () => fileHas(notePath, LINES.saved) && fileHas(notePath, LINES.away), pat.page))) problems.push('the note on disk is missing a line');
        if (!(await waitFor(async () => fileHas(codePath, LINES.codeAway), pat.page))) problems.push('the code file on disk is missing the line typed while its folder was away');
        const docSays = await sayingOf(pat.page, docId, (s) => !/not saved/i.test(s), 5_000);
        const codeSays = await sayingOf(pat.page, codeId, (s) => /^saved/i.test(s), 5_000);
        await pat.page.mouse.move(8, 8);
        await shot(pat.page, 'saved-after-folder-back');
        if (/not saved/i.test(docSays)) problems.push(`the Document still says ${sayWhat(docSays)}`);
        if (!/^saved/i.test(codeSays)) problems.push(`the Code editor says ${sayWhat(codeSays)}, not that it saved`);
        if (problems.length) throw new Error(problems.join('; '));
        return `both files have every line; the Code editor says "${codeSays}"`;
      });

      await check('walk', 'Sam, a teammate, types a line in the note and presses Save: Sam\'s window says only this computer\'s owner can save, the line stays on Sam\'s screen, and the file is unchanged', async ({ shot }) => {
        if (!docId) throw new Error('the note did not open in the first step');
        await sam.page.waitForFunction((id) => window.__e2eStore.getState().wins.some((w) => w.id === id), docId, { timeout: 10_000 });
        const before = fs.readFileSync(notePath, 'utf8');
        await typeAtEnd(sam.page, docId, LINES.sam);
        await pressSave(sam.page, docId);
        const said = await sayingOf(sam.page, docId);
        await sam.page.mouse.move(8, 8);
        await sideBySide(t, 'sam-told-only-the-owner-saves', shot);
        const problems = sayingProblems("Sam's Document", said, notSaved(NOTE, SAVE.ownerOnly), dir);
        if (!(await shownText(sam.page, docId)).includes(LINES.sam)) problems.push("Sam's line is gone from Sam's screen");
        if (fs.readFileSync(notePath, 'utf8') !== before) problems.push('the file on disk changed');
        // A teammate's Save never works, so Close is how the words go away.
        const close = windowFrame(sam.page, docId).locator('[data-testid="file-save-note"]').getByRole('button', { name: 'Close' });
        if (!(await close.count())) problems.push("Sam's note has no Close button");
        else {
          await close.click();
          if (await saveSays(sam.page, docId)) problems.push('Close did not take the words away');
          if (!(await shownText(sam.page, docId)).includes(LINES.sam)) problems.push("Close took Sam's line away too");
        }
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's Document says "${said}", and the file on disk is as it was; Close takes the words away and leaves Sam's line`;
      });

      await check('hunt', 'the code file replaced by a folder outside censaiOS: Save says so in plain words, never the server\'s own', async ({ shot }) => {
        if (!codeId) throw new Error('the code file did not open in the first step');
        const kept = fs.readFileSync(codePath, 'utf8');
        fs.rmSync(codePath);
        fs.mkdirSync(codePath);
        try {
          await pressSave(pat.page, codeId);
          const said = await sayingOf(pat.page, codeId, (s) => s !== '' && !/^saved/i.test(s));
          await pat.page.mouse.move(8, 8);
          await shot(pat.page, 'code-file-became-a-folder');
          const problems = sayingProblems("Pat's Code editor", said, notSaved(CODE, SAVE.folder), dir);
          if (problems.length) throw new Error(problems.join('; '));
          return `the Code editor says "${said}"`;
        } finally {
          fs.rmSync(codePath, { recursive: true, force: true });
          fs.writeFileSync(codePath, kept);
        }
      });

      await check('hunt', 'Files\' New file with the name of a file already there says so, and that file keeps its words', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const frame = windowFrame(pat.page, filesId);
        await frame.getByRole('button', { name: '+ File' }).click({ timeout: 5_000 });
        const box = frame.getByPlaceholder('New file name…');
        await box.fill(LIST);
        await box.press('Enter');
        const said = await waitFor(async () => (await frame.getByText(SAVE.exists || '(no plain words)').count()) > 0, pat.page, 5_000);
        await pat.page.mouse.move(8, 8);
        await shot(pat.page, 'new-file-name-already-there');
        const problems = [];
        if (fs.readFileSync(listPath, 'utf8') !== `${LIST_TEXT}\n`) problems.push(`the file already there now reads "${fs.readFileSync(listPath, 'utf8').trim()}"`);
        if (!said) problems.push(`Files does not say "${SAVE.exists}"`);
        if (await winOf(pat.page, 'doc', LIST)) problems.push('a Document opened on it as if it were new');
        const cancel = frame.getByText('✕').first();
        if (await cancel.count()) await cancel.click().catch(() => {});
        if (problems.length) throw new Error(problems.join('; '));
        return `Files says "${SAVE.exists}" and the file keeps its words`;
      });

      await check('redteam', 'Sam\'s save sent straight to the server is refused and writes nothing', async () => {
        const before = fs.readFileSync(notePath, 'utf8');
        const res = await t.api(sam, 'PUT', '/api/files/content', { path: notePath, content: 'Made-up words sent straight to the server.' });
        const problems = [];
        if (res.status !== 403) problems.push(`the server answered ${res.status}, not 403`);
        if (fs.readFileSync(notePath, 'utf8') !== before) problems.push('the file on disk changed');
        if ((res.text || '').includes(dir)) problems.push('the answer names the project\'s folder');
        if (problems.length) throw new Error(problems.join('; '));
        return 'refused with 403; the file is unchanged';
      });

      await check('redteam', 'a save outside the projects open on this board writes nothing and names no folder', async () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-elsewhere-'));
        try {
          const file = path.join(outside, 'made-up-outside.md');
          const res = await t.api(pat, 'PUT', '/api/files/content', { path: file, content: 'Made-up words for outside.' });
          const problems = [];
          if (res.status < 400) problems.push(`the server answered ${res.status}`);
          if (fs.existsSync(file)) problems.push('the file was written');
          if ((res.text || '').includes(outside)) problems.push('the answer names the folder');
          if (problems.length) throw new Error(problems.join('; '));
          return `refused with ${res.status}; nothing was written`;
        } finally {
          fs.rmSync(outside, { recursive: true, force: true });
        }
      });

      await check('redteam', 'a save into a folder that is gone answers 404 in plain words, never 500 or the server\'s folders', async () => {
        const file = path.join(dir, 'made-up-gone-folder', 'made-up-note.md');
        const res = await t.api(pat, 'PUT', '/api/files/content', { path: file, content: 'Made-up words for a gone folder.' });
        const said = String(res.body?.error ?? '');
        const problems = [];
        if (res.status !== 404) problems.push(`the server answered ${res.status}, not 404`);
        if ((res.text || '').includes(dir)) problems.push('the answer names the server\'s folders');
        if (TECHNICAL.test(said)) problems.push(`the answer is in technical words (${said.slice(0, 60)})`);
        if (fs.existsSync(path.dirname(file))) problems.push('the gone folder was made');
        if (problems.length) throw new Error(problems.join('; '));
        return `404, "${said}"`;
      });
    } finally {
      putBackOpenProjects();
      for (const folder of [dir, away]) fs.rmSync(folder, { recursive: true, force: true });
    }
  },
};
