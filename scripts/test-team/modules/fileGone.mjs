// A file that will not open says why. Pat Example opens a made-up project in
// Files (with no default project set, as on a new censaiOS): Files lists it,
// its made-up note opens as a Document and its made-up code file in the Code
// editor, each with its words. Pat adds a line to the note, saves, closes it
// and opens it again from Files: the saved words show. Pat closes the note
// again and both files are deleted outside censaiOS, the way another program
// would: opening the note again from Files (which still lists it) says it is
// not there any more instead of showing its old words, and after a reload
// Pat's and Sam Example's windows say so too, and nothing can be typed or
// saved. The files are put back and "Try again" opens each one. Bug hunt: a
// Document on a file that was never there says it is not there, a file
// outside the projects open on this board says so, and a folder opened as a
// file says it is a folder, and a file in a censaiOS folder of keys and
// logins (a made-up one in the made-up project) says it does not open on the
// board, never the server's own words. Red team: the server answers a missing
// file with 404 and plain words (not 500, ENOENT or its folders), a file
// outside the open projects gets the same answer whether or not it exists,
// and no file in a censaiOS folder of keys and logins opens for Pat or Sam:
// the made-up one, and this censaiOS's own, whose words are never reported.
// The board's list of open projects is put back as the module found it. All
// files and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openBoard, spawnWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { FILE_PROBLEMS } from '../../../shared/files/fileProblems.js';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';
import { note } from '../report.mjs';

const NOTE = 'made-up-picnic.md';
const NOTE_TEXT = 'Made-up note: the picnic moves to the old mill on Friday.';
const NOTE_ADDED = 'Made-up line: bring the lemonade.';
const CODE = 'made-up-tool.js';
const CODE_WORD = 'madeUpGreeting';
const CODE_TEXT = `// Made-up tool\nexport const ${CODE_WORD} = 'hello from a made-up file';\n`;
const { missing: MISSING, outside: OUTSIDE, folder: FOLDER, secret: SECRET } = FILE_PROBLEMS;
const TECHNICAL = /status \d|ENOENT|EISDIR|no such file|Access denied|Failed to load|undefined/i;

// censaiOS's own folder of keys, logins and lists, where it keeps the
// projects opened on this board (as server/routes/projects/shared.js does),
// so the module can put that list back.
const STATE_DIR = process.env.CENSAI_STATE_DIR ? path.resolve(process.env.CENSAI_STATE_DIR) : path.join(ROOT, '.homebase-state');
const OPEN_PROJECTS = path.join(STATE_DIR, 'open-projects.json');
const KEY_WORDS = 'not-a-real-made-up-key';

/** A made-up file in a censaiOS folder of keys and logins inside the made-up project, made if missing. */
function madeUpKeys(dir) {
  const keys = path.join(dir, '.homebase-state', 'made-up-keys.env');
  fs.mkdirSync(path.dirname(keys), { recursive: true });
  if (!fs.existsSync(keys)) fs.writeFileSync(keys, `MADE_UP_KEY=${KEY_WORDS}\n`);
  return keys;
}

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

async function waitForText(page, id, words, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await shownText(page, id).catch(() => '');
    if (seen.includes(words)) return true;
    if (Date.now() > until) return false;
    await page.waitForTimeout(250);
  }
}

/** The plain-words banner (without its button), or '' when the window shows none within `ms`. */
async function banner(page, id, ms = 15_000) {
  const box = windowFrame(page, id).getByTestId('file-load-error');
  if (!(await box.waitFor({ timeout: ms }).then(() => true, () => false))) return '';
  const words = box.locator('span');
  return ((await words.count()) ? await words.first().textContent() : await box.textContent()).trim();
}

const sayWhat = (text) => (text ? `"${text}"` : 'nothing');

/** Problems with a banner that should say `want` and nothing technical. */
function bannerProblems(who, text, want) {
  const problems = [];
  if (!text.includes(want)) problems.push(`${who} sees ${sayWhat(text)}, not "${want}"`);
  if (TECHNICAL.test(text)) problems.push(`${who}'s message is in technical words`);
  return problems;
}

/** Problems if this window still offers Save or takes typing. */
async function editingProblems(page, id, what) {
  const frame = windowFrame(page, id);
  const problems = [];
  const save = frame.getByRole('button', { name: 'Save' });
  if ((await save.count()) && !(await save.first().isDisabled())) problems.push(`the ${what}'s Save still works`);
  const box = frame.locator('textarea, .cm-content');
  const locked = (el) => (el.tagName === 'TEXTAREA' ? el.readOnly : el.getAttribute('contenteditable') !== 'true');
  if ((await box.count()) && !(await box.first().evaluate(locked))) problems.push(`the ${what} still takes typing`);
  return problems;
}

/** Puts the view back where the module started it (a window opened in a free spot pans the board there). */
const homeView = (page) => page.evaluate(() => {
  const st = window.__e2eStore.getState();
  st.setPan?.({ x: 0, y: 0 });
  st.setZoom?.(1);
});

/** Reloads each person's board, with the view where the module started it. */
async function reload(t, people) {
  await Promise.all(people.map((p) => openBoard(p.page, t.workspaceId, t.web)));
  for (const p of people) await homeView(p.page);
}

async function tryAgain(page, id) {
  const button = windowFrame(page, id).getByRole('button', { name: 'Try again' });
  if (!(await button.count())) return false;
  await button.click();
  return true;
}

/**
 * Clicks a file in the Files tree; returns the window it opened, moved to `at`
 * so it leaves the tree (and the next file in it) in sight.
 */
async function openFromTree(page, filesId, name, kind, at) {
  // A row reads "📄 name", so the name is matched inside it.
  await windowFrame(page, filesId).getByText(name).first().click({ timeout: 5_000 });
  await page.waitForFunction(([k, n]) => window.__e2eStore.getState().wins
    .some((w) => w.kind === k && String(w.filePath || '').endsWith(n)), [kind, name], { timeout: 10_000 });
  const id = await winOf(page, kind, name);
  await updateWindow(page, id, { ...at, w: 500, h: 400, width: 500, height: 400 });
  await homeView(page);
  return id;
}

/** Closes a window with its own close button, the way a person does. */
async function closeWindow(page, id) {
  await windowFrame(page, id).locator('[data-window-control="close"]').click({ timeout: 5_000 });
  await page.waitForFunction((wid) => !window.__e2eStore.getState().wins.some((w) => w.id === wid), id, { timeout: 5_000 });
}

/** Types `line` at the end of the Document and presses Save; true once the file on disk has it. */
async function addLineAndSave(page, id, line, file) {
  const frame = windowFrame(page, id);
  const box = frame.locator('textarea').first();
  // A Document that is not being edited starts editing where its words are clicked.
  if (!(await box.count())) await frame.locator('[data-doc-body]').first().click();
  await box.click({ timeout: 5_000 });
  await page.keyboard.press('Control+End');
  await page.keyboard.type(line, { delay: 10 });
  await frame.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 5_000 });
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    if (fs.readFileSync(file, 'utf8').includes(line)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

export default {
  id: 'fileGone',
  label: 'A file that will not open says why',
  async run(t) {
    const { pat, sam, check } = t;
    const putBackOpenProjects = keepOpenProjects();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-project-'));
    const notePath = path.join(dir, NOTE);
    const codePath = path.join(dir, CODE);
    fs.writeFileSync(notePath, `${NOTE_TEXT}\n`);
    fs.writeFileSync(codePath, CODE_TEXT);
    t.typed.push(NOTE_TEXT, NOTE_ADDED, CODE_WORD);
    let filesId = null;
    let docId = null;
    let codeId = null;

    try {
      await check('walk', 'Pat opens a made-up project in Files: its note opens as a Document and its code file in the Code editor, each with its words', async ({ shot }) => {
        const current = await t.api(pat, 'GET', '/api/current-project');
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        filesId = files.id;
        const frame = windowFrame(pat.page, files.id);
        const pathBox = frame.locator('input[type="text"]').first();
        await pathBox.fill(dir);
        await pathBox.press('Enter');
        const listed = await frame.getByText(NOTE).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
        await shot(pat.page, 'files-shows-the-made-up-project');
        if (!listed) {
          const said = await frame.getByTestId('tree-folder-note').first().textContent().catch(() => '');
          throw new Error(`Files does not list the project's files${said ? `; it says "${said.trim()}"` : ''}`);
        }
        docId = await openFromTree(pat.page, files.id, NOTE, 'doc', { x: 16, y: 64 });
        if (!(await waitForText(pat.page, docId, NOTE_TEXT))) throw new Error('the Document opened without the note\'s words');
        codeId = await openFromTree(pat.page, files.id, CODE, 'code_editor', { x: 924, y: 64 });
        if (!(await waitForText(pat.page, codeId, CODE_WORD))) throw new Error('the Code editor opened without the file\'s code');
        await shot(pat.page, 'both-files-open');
        const done = 'the note opens as a Document and the code file in the Code editor, both with their made-up words';
        if (current.body?.project) return note(`${done}; but this censaiOS already has a default project, so the new-censaiOS case (none yet) was not tried`);
        return `${done}, with no default project set`;
      });

      await check('walk', 'Pat adds a line to the note, saves, closes it and opens it again from Files: it shows the saved words', async ({ shot }) => {
        if (!docId || !filesId) throw new Error('the note did not open in the step before');
        if (!(await addLineAndSave(pat.page, docId, NOTE_ADDED, notePath))) throw new Error('Save did not put the new line in the file');
        await closeWindow(pat.page, docId);
        docId = await openFromTree(pat.page, filesId, NOTE, 'doc', { x: 16, y: 64 });
        const shows = await waitForText(pat.page, docId, NOTE_ADDED);
        await shot(pat.page, 'saved-words-after-opening-again');
        if (!shows) throw new Error(`opened again, the note shows "${(await shownText(pat.page, docId)).trim()}", not the saved line`);
        return 'opened again, the note shows the line Pat saved';
      });

      await check('walk', 'Pat closes the note and both files are deleted outside censaiOS: opening the note again from Files (which still lists it) says it is not there any more, not its old words', async ({ shot }) => {
        if (!docId || !filesId) throw new Error('the note did not open in the steps before');
        await closeWindow(pat.page, docId);
        fs.rmSync(notePath, { force: true });
        fs.rmSync(codePath, { force: true });
        docId = await openFromTree(pat.page, filesId, NOTE, 'doc', { x: 16, y: 64 });
        const says = await banner(pat.page, docId);
        await shot(pat.page, 'opened-again-after-delete');
        const problems = bannerProblems('Pat', says, MISSING);
        if (await waitForText(pat.page, docId, NOTE_TEXT, 1_000)) problems.push('the note\'s old words show anyway');
        problems.push(...await editingProblems(pat.page, docId, 'Document'));
        if (problems.length) throw new Error(problems.join('; '));
        return `it says "${says}", shows no old words and takes no typing`;
      });

      await check('walk', 'after a reload the Document and the Code editor say the file is not there any more on Pat\'s and Sam\'s screens, and nothing can be typed or saved', async ({ shot }) => {
        if (!docId || !codeId) throw new Error('the files did not open in the steps before');
        fs.rmSync(notePath, { force: true });
        fs.rmSync(codePath, { force: true });
        await reload(t, [pat, sam]);
        const problems = [];
        const seen = [];
        for (const [id, what] of [[docId, 'Document'], [codeId, 'Code editor']]) {
          for (const p of [pat, sam]) {
            const says = await banner(p.page, id);
            seen.push(says);
            problems.push(...bannerProblems(`${p.who.name}'s ${what}`, says, MISSING));
            problems.push(...await editingProblems(p.page, id, `${p.who.name}'s ${what}`));
          }
        }
        await sideBySide(t, 'both-see-the-files-are-gone', shot);
        if (problems.length) throw new Error(problems.join('; '));
        return `all four windows say "${seen[0]}"; Save is off and nothing takes typing`;
      });

      await check('walk', 'the files are put back, and "Try again" opens each one with its words', async ({ shot }) => {
        if (!docId || !codeId) throw new Error('the files did not open in the first step');
        fs.writeFileSync(notePath, `${NOTE_TEXT}\n`);
        fs.writeFileSync(codePath, CODE_TEXT);
        const problems = [];
        for (const [id, words, what] of [[docId, NOTE_TEXT, 'Document'], [codeId, CODE_WORD, 'Code editor']]) {
          if (!(await tryAgain(pat.page, id))) problems.push(`the ${what} has no "Try again" button`);
          else if (!(await waitForText(pat.page, id, words))) problems.push(`after "Try again" the ${what}'s words did not come back`);
          else if (await windowFrame(pat.page, id).getByTestId('file-load-error').count()) problems.push(`the ${what} still says the file is gone`);
        }
        await shot(pat.page, 'files-back-after-try-again');
        if (problems.length) throw new Error(problems.join('; '));
        return 'both windows show their words again and the message is gone';
      });

      await check('hunt', 'a Document on a file that was never there says it is not there, not "status 500"', async ({ shot }) => {
        const never = path.join(dir, 'made-up-never-there.md');
        const id = await spawnWindow(pat.page, 'doc', { title: 'Made-up missing file', fileName: path.basename(never), filePath: never }, { x: 120, y: 120 }, { w: 520, h: 260 });
        const says = await banner(pat.page, id);
        await shot(pat.page, 'a-missing-file');
        const problems = bannerProblems('Pat', says, MISSING);
        if (problems.length) throw new Error(problems.join('; '));
        return `it says "${says}"`;
      });

      await check('hunt', 'a file outside the projects open on this board says so in plain words, and how to open it', async ({ shot }) => {
        const id = await spawnWindow(pat.page, 'doc', { title: 'Made-up outside file', fileName: 'hostname', filePath: '/etc/hostname' }, { x: 700, y: 420 }, { w: 520, h: 260 });
        const says = await banner(pat.page, id);
        await shot(pat.page, 'outside-the-open-projects');
        const problems = bannerProblems('Pat', says, OUTSIDE);
        if (await waitForText(pat.page, id, os.hostname(), 1_000)) problems.push('the file\'s contents show anyway');
        if (problems.length) throw new Error(problems.join('; '));
        return `it says "${says}"`;
      });

      await check('hunt', 'a folder opened as a file says it is a folder, with no "Try again" that could never help', async ({ shot }) => {
        const id = await spawnWindow(pat.page, 'doc', { title: 'Made-up folder', fileName: path.basename(dir), filePath: dir }, { x: 160, y: 460 }, { w: 480, h: 240 });
        const says = await banner(pat.page, id);
        await shot(pat.page, 'a-folder-opened-as-a-file');
        const problems = bannerProblems('Pat', says, FOLDER);
        if (await windowFrame(pat.page, id).getByRole('button', { name: 'Try again' }).count()) problems.push('it offers "Try again"');
        if (problems.length) throw new Error(problems.join('; '));
        return `it says "${says}" and offers no "Try again"`;
      });

      await check('hunt', "a Document on a file in a censaiOS folder of keys and logins says it does not open on the board, and shows none of it", async ({ shot }) => {
        const keys = madeUpKeys(dir);
        const id = await spawnWindow(pat.page, 'doc', { title: 'Made-up keys file', fileName: path.basename(keys), filePath: keys }, { x: 660, y: 120 }, { w: 520, h: 260 });
        const says = await banner(pat.page, id);
        await shot(pat.page, 'censaios-own-keys-folder');
        const problems = bannerProblems('Pat', says, SECRET);
        if (await waitForText(pat.page, id, KEY_WORDS, 1_000)) problems.push('the file\'s words show anyway');
        if (await windowFrame(pat.page, id).getByRole('button', { name: 'Try again' }).count()) problems.push('it offers "Try again"');
        if (problems.length) throw new Error(problems.join('; '));
        return `it says "${says}", shows none of the file and offers no "Try again"`;
      });

      await check('redteam', 'the server answers a missing file with 404 and plain words, for Pat and for Sam, never 500, ENOENT or its own folders', async () => {
        const gone = path.join(dir, 'made-up-gone.md');
        const problems = [];
        for (const p of [pat, sam]) {
          const res = await t.api(p, 'GET', `/api/files/content?path=${encodeURIComponent(gone)}`);
          const body = res.text || '';
          if (res.status !== 404) problems.push(`${p.who.name} got ${res.status}, not 404`);
          if (res.body?.error !== MISSING) problems.push(`${p.who.name} got ${body.slice(0, 120)}`);
          if (/ENOENT|no such file/i.test(body) || body.includes(dir)) problems.push(`${p.who.name}'s answer names the server's error or folders`);
        }
        if (problems.length) throw new Error(problems.join('; '));
        return `404 with "${MISSING}" for both`;
      });

      await check('redteam', 'a file outside the open projects gets the same answer whether or not it exists', async () => {
        const there = await t.api(pat, 'GET', `/api/files/content?path=${encodeURIComponent('/etc/hostname')}`);
        const notThere = await t.api(pat, 'GET', `/api/files/content?path=${encodeURIComponent('/etc/made-up-not-there')}`);
        const problems = [];
        if (there.status !== 403 || notThere.status !== 403) problems.push(`answers were ${there.status} and ${notThere.status}, not 403 and 403`);
        if (there.text !== notThere.text) problems.push('the two answers differ, so they tell which file exists');
        if (there.body?.content) problems.push('the file\'s contents came back');
        if (problems.length) throw new Error(problems.join('; '));
        return `both 403 with "${there.body?.error}"`;
      });

      await check('redteam', "no file in a censaiOS folder of keys and logins opens, for Pat or for Sam, whether or not it is there", async () => {
        const madeUp = path.dirname(madeUpKeys(dir));
        const problems = [];
        for (const p of [pat, sam]) {
          // The made-up folder is inside an open project: refused for what it is.
          for (const name of ['made-up-keys.env', 'made-up-not-there.env']) {
            const res = await t.api(p, 'GET', `/api/files/content?path=${encodeURIComponent(path.join(madeUp, name))}`);
            const gotWords = res.body?.content !== undefined;
            if (res.status !== 403 || res.body?.reason !== 'secret' || gotWords) {
              problems.push(`${p.who.name} asking for the made-up ${name} got ${res.status} ${res.body?.reason || 'with no reason'}${gotWords ? ' and the file\'s words' : ''}`);
            }
          }
          // This censaiOS's own may also be outside every open project; any
          // refusal will do. Only the status is reported: its words may be real keys.
          for (const name of ['open-projects.json', 'generated-secrets.env', 'made-up-not-there.json']) {
            const res = await t.api(p, 'GET', `/api/files/content?path=${encodeURIComponent(path.join(STATE_DIR, name))}`);
            const gotWords = res.body?.content !== undefined;
            if (res.status !== 403 || gotWords) problems.push(`${p.who.name} asking for this censaiOS's own ${name} got ${res.status}${gotWords ? ' with the file\'s words' : ''}`);
          }
        }
        if (problems.length) throw new Error(problems.join('; '));
        return `403 for every file, for both, with "${SECRET}" for the made-up ones`;
      });
    } finally {
      putBackOpenProjects();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
