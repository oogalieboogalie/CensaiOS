// With no project open, censaiOS's own folder is this computer's owner's. A
// new censaiOS has no project open, and Files then falls back to censaiOS's
// own folder (the folder it runs from). Pat Example owns the computer and Sam
// Example is a teammate on the same board, which has no project open. Walk:
// Sam types censaiOS's own folder into Files: Sam's screen says only this
// computer's owner can open it and lists none of it, with no versions bar,
// while Pat's screen lists it in the same window. A made-up note in
// censaiOS's own folder, opened by its path the way an agent opens one, shows
// Pat its words with a line saying they stay on Pat's screen, and tells Sam it
// is not in a project open on this board; its words reach neither Sam's
// screen nor Sam's copy of the board. Bug hunt: Sam's search in that window
// gets the same plain refusal while Pat's finds the note; once censaiOS's
// own folder is among the projects open on the board (as when Pat opens it
// as a project), Sam's Try again opens the note and Sam's Files lists the
// folder, like any project open on the board. Red team:
// Sam's own requests in censaiOS's own folder (a list, a list again, a read,
// a picture, a search, backlinks, the versions bar) are refused, the same
// whether or not the file is there, naming nothing in it, while Pat's are
// answered. The board's default project and open projects are put back as
// the module found them, and the made-up note is removed. All people, files
// and words are made up.

import fs from 'node:fs';
import path from 'node:path';
import { openBoard, readWindow, spawnWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { FILE_PROBLEMS, OFF_BOARD_NOTE } from '../../../shared/files/fileProblems.js';
import { addFromMenu } from '../addMenu.mjs';

// What a teammate's Files says there (server/routes/files/pathUtils.js).
const OWNER_FOLDER = "Only this computer's owner can open this folder.";
const NOTE = 'made-up-app-folder-note.md';
const NOTE_TEXT = "Made-up note in censaiOS's own folder: water the ferns on Friday.";
const NOTE_PATH = path.join(ROOT, NOTE);
// What a teammate's screen and answers never name: what is in censaiOS's own folder.
const APP_FILES = /package\.json|docker-compose|made-up-app-folder-note|ferns/;

// censaiOS's own folder of state, where it keeps the board's default project
// and its open projects (server/routes/projects/shared.js), so the module can put them back.
const STATE_DIR = process.env.CENSAI_STATE_DIR ? path.resolve(process.env.CENSAI_STATE_DIR) : path.join(ROOT, '.homebase-state');
const DEFAULT_PROJECT = path.join(STATE_DIR, 'current-project.json');
const OPEN_PROJECTS = path.join(STATE_DIR, 'open-projects.json');

/** Returns a function that puts the board's default project and open projects back as they are now. */
function keepProjects() {
  const kept = [DEFAULT_PROJECT, OPEN_PROJECTS].map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null]);
  return () => kept.forEach(([file, was]) => (was === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, was)));
}

/** What one Files window shows on this screen: the names in its tree, its notes, whether it has a versions bar, and all its words. */
const listed = (page, id) => windowFrame(page, id).evaluate((el) => ({
  rows: [...el.querySelectorAll('div[title="click to expand"] > span, div[title="Click to open · drag to canvas"] > span')]
    .map((s) => s.textContent.trim().replace(/^\S+ /, '')).filter(Boolean),
  notes: [...el.querySelectorAll('[data-testid="tree-folder-note"]')].map((n) => n.textContent.trim()),
  versions: Boolean(el.querySelector('[data-testid="project-versions"]')),
  words: el.innerText,
})).catch(() => ({ rows: [], notes: [], versions: false, words: '' }));

/** Waits until `ok(list)` holds on this screen, for `ms` at most; what it shows then. */
async function until(page, id, ok, ms = 15_000) {
  const end = Date.now() + ms;
  let seen = await listed(page, id);
  while (!ok(seen) && Date.now() < end) {
    await page.waitForTimeout(250);
    seen = await listed(page, id);
  }
  return seen;
}

/** The rows below the folder Sam typed in: the files and folders in it. */
const inside = (seen) => seen.rows.filter((name) => name !== path.basename(ROOT));

/** The words a Document shows: its typing box, else its page. */
const shownText = (page, id) => windowFrame(page, id).evaluate((el) => el.querySelector('textarea')?.value
  ?? el.querySelector('[data-doc-body]')?.textContent ?? '').catch(() => '');

async function waitForText(page, id, words, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    if ((await shownText(page, id)).includes(words)) return true;
    if (Date.now() > end) return false;
    await page.waitForTimeout(250);
  }
}

/** The plain-words banner of a window that could not open its file (without its button), or ''. */
async function banner(page, id, ms = 15_000) {
  const box = windowFrame(page, id).getByTestId('file-load-error');
  if (!(await box.waitFor({ timeout: ms }).then(() => true, () => false))) return '';
  const words = box.locator('span');
  return ((await words.count()) ? await words.first().textContent() : await box.textContent()).trim();
}

/**
 * Pat's and Sam's copies of one window in one picture, Pat on the left. A
 * Files window is shown down to its versions bar, which lists censaiOS's own
 * code history: in these pictures, only made-up words.
 */
async function bothWindows(t, id, title, shot) {
  const boxes = await Promise.all([t.pat.page, t.sam.page].map(async (page) => {
    const frame = await windowFrame(page, id).boundingBox();
    const bar = windowFrame(page, id).locator('[data-testid="project-versions"]').first();
    const top = (await bar.count()) ? (await bar.boundingBox())?.y : null;
    return { frame, height: top ? top - frame.y : frame.height };
  }));
  const height = Math.min(...boxes.map((b) => b.height));
  const [a, b] = await Promise.all([t.pat.page, t.sam.page].map((page, i) => page.screenshot({ type: 'png', clip: { ...boxes[i].frame, height } })));
  const view = await t.browser.newPage({ viewport: { width: 1240, height: 700 } });
  const img = (buf, who) => `<figure><figcaption>${who}</figcaption><img src="data:image/png;base64,${buf.toString('base64')}"></figure>`;
  await view.setContent(`<style>body{margin:0;display:flex;gap:16px;padding:16px;background:gray;font:14px sans-serif}
    figure{margin:0;flex:1}img{width:100%;display:block}figcaption{padding:4px 0}</style>${img(a, "Pat's screen")}${img(b, "Sam's screen")}`);
  await shot(view, title);
  await view.close();
}

const query = (route, params) => `${route}?${new URLSearchParams(params)}`;

export default {
  id: 'appFolderFiles',
  label: "With no project open, censaiOS's own folder is this computer's owner's",
  async run(t) {
    const { pat, sam, check } = t;
    const putBack = keepProjects();
    t.typed.push(NOTE_TEXT);
    let filesId = null;
    let noteId = null;

    try {
      // A new censaiOS: no project open on the board.
      fs.rmSync(DEFAULT_PROJECT, { force: true });
      fs.rmSync(OPEN_PROJECTS, { force: true });
      fs.writeFileSync(NOTE_PATH, `${NOTE_TEXT}\n`);
      await Promise.all([pat, sam].map((p) => openBoard(p.page, t.workspaceId, t.web)));

      await check('walk', "with no project open, Sam types censaiOS's own folder into Files: Sam's screen says only this computer's owner can open it and lists none of it, with no versions bar, while Pat's screen lists it in the same window", async ({ shot }) => {
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        filesId = files.id;
        await updateWindow(pat.page, filesId, { x: 40, y: 60, w: 520, h: 560, width: 520, height: 560 });
        const box = windowFrame(sam.page, filesId).locator('input[type="text"]').first();
        await box.fill(ROOT, { timeout: 10_000 });
        await box.press('Enter');
        const samSaw = await until(sam.page, filesId, (l) => l.notes.some((n) => n.includes(OWNER_FOLDER)));
        const patSaw = await until(pat.page, filesId, (l) => l.rows.includes('package.json') && l.versions);
        await bothWindows(t, filesId, 'sam-is-refused-censaios-own-folder', shot);
        const problems = [];
        if (!samSaw.notes.some((n) => n.includes(OWNER_FOLDER))) problems.push(`Sam's Files says ${samSaw.notes.length ? `"${samSaw.notes.join(' / ')}"` : 'nothing'}, not "${OWNER_FOLDER}"`);
        if (inside(samSaw).length) problems.push(`Sam's Files lists ${inside(samSaw).slice(0, 6).join(', ')}`);
        if (samSaw.versions) problems.push("Sam's Files shows the versions bar of censaiOS's own folder");
        if (!patSaw.rows.includes('package.json')) problems.push(`Pat's screen lists ${inside(patSaw).slice(0, 6).join(', ') || 'nothing'}, not censaiOS's own folder`);
        if (!patSaw.versions) problems.push("Pat's screen shows no versions bar for it");
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's says "${OWNER_FOLDER}" and lists nothing in it; Pat's lists ${inside(patSaw).length} entries, with its versions bar`;
      });

      await check('walk', "a made-up note in censaiOS's own folder, opened by its path the way an agent opens one, shows Pat its words with a line saying they stay on Pat's screen, and tells Sam it is not in a project open on this board", async ({ shot }) => {
        noteId = await spawnWindow(pat.page, 'doc', { title: NOTE, fileName: NOTE, filePath: NOTE_PATH }, { x: 600, y: 60 }, { w: 480, h: 300 });
        const patHas = await waitForText(pat.page, noteId, NOTE_TEXT);
        const patLine = await windowFrame(pat.page, noteId).getByTestId('off-board-note').innerText({ timeout: 10_000 }).catch(() => '');
        const samSays = await banner(sam.page, noteId);
        await sam.page.waitForTimeout(2_000);
        const samScreen = await sam.page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('textarea, input')].map((el) => el.value)].join('\n'));
        const samBoard = JSON.stringify(await readWindow(sam.page, noteId));
        await bothWindows(t, noteId, 'the-note-stays-on-pats-screen', shot);
        const problems = [];
        if (!patHas) problems.push(`Pat's note shows "${(await shownText(pat.page, noteId)).slice(0, 80)}", not its words`);
        if (!patLine.includes(OFF_BOARD_NOTE)) problems.push(`Pat's note says ${patLine ? `"${patLine.trim()}"` : 'nothing'} about its words staying on Pat's screen`);
        if (!samSays.includes(FILE_PROBLEMS.outside)) problems.push(`Sam's note says ${samSays ? `"${samSays}"` : 'nothing'}, not "${FILE_PROBLEMS.outside}"`);
        if (samScreen.includes(NOTE_TEXT)) problems.push("the note's words are on Sam's screen");
        if (samBoard.includes(NOTE_TEXT)) problems.push("the note's words are in Sam's copy of the board");
        if (problems.length) throw new Error(problems.join('; '));
        return `Pat's shows the words with "${OFF_BOARD_NOTE}"; Sam's says "${FILE_PROBLEMS.outside}"`;
      });

      await check('hunt', "Sam's search in that Files window gets the same plain refusal, while Pat's finds the made-up note", async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const asked = sam.page.waitForResponse((r) => r.url().includes('/api/files/search'), { timeout: 10_000 }).catch(() => null);
        await windowFrame(sam.page, filesId).getByPlaceholder('Filter paths...').fill('made-up-app', { timeout: 10_000 });
        await windowFrame(pat.page, filesId).getByPlaceholder('Filter paths...').fill('made-up-app', { timeout: 10_000 });
        const answer = await asked;
        const samSaw = await until(sam.page, filesId, (l) => l.words.includes(OWNER_FOLDER) && !l.notes.length);
        const patSaw = await until(pat.page, filesId, (l) => l.rows.includes(NOTE));
        await bothWindows(t, filesId, 'searching-censaios-own-folder', shot);
        const problems = [];
        if (answer?.status() !== 403) problems.push(`Sam's search was answered ${answer ? answer.status() : 'never'}, not refused`);
        if (!samSaw.words.includes(OWNER_FOLDER)) problems.push(`Sam's search says "${samSaw.words.slice(0, 120)}", not "${OWNER_FOLDER}"`);
        if (APP_FILES.test(samSaw.rows.join(' '))) problems.push(`Sam's search lists ${samSaw.rows.join(', ')}`);
        if (!patSaw.rows.includes(NOTE)) problems.push(`Pat's search lists ${patSaw.rows.join(', ') || 'nothing'}, not the made-up note`);
        for (const p of [pat, sam]) await windowFrame(p.page, filesId).getByPlaceholder('Filter paths...').fill('').catch(() => {});
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's says "${OWNER_FOLDER}" (403); Pat's finds ${NOTE}`;
      });

      await check('redteam', "Sam's own requests in censaiOS's own folder are refused, the same whether or not the file is there, naming nothing in it, while Pat's are answered", async () => {
        const asks = [
          ['the folder Files starts in', query('/api/files/browse', {})],
          ['its top folder', query('/api/files/browse', { path: ROOT, details: '1' })],
          ['a folder in it, listed again', query('/api/files/relist', { path: path.join(ROOT, 'server') })],
          ['the made-up note', query('/api/files/content', { path: NOTE_PATH })],
          ['a picture', query('/api/files/image', { path: path.join(ROOT, 'made-up-picture.png') })],
          ['a search', query('/api/files/search', { q: 'package' })],
          ['a search in it', query('/api/files/search', { q: 'package', path: ROOT })],
          ["the note's backlinks", query('/api/files/backlinks', { path: NOTE_PATH })],
          ['its versions bar', query('/api/project-git/status', { path: ROOT })],
        ];
        const problems = [];
        for (const [what, url] of asks) {
          const res = await t.api(sam, 'GET', url);
          if (res.status !== 403) problems.push(`Sam got ${what} (${res.status})`);
          if (APP_FILES.test(res.text)) problems.push(`Sam's answer for ${what} names something in it`);
        }
        const there = await t.api(sam, 'GET', query('/api/files/content', { path: NOTE_PATH }));
        const gone = await t.api(sam, 'GET', query('/api/files/content', { path: path.join(ROOT, 'made-up-not-there.md') }));
        if (there.status !== gone.status || there.text !== gone.text) problems.push(`Sam's answer for a file that is there (${there.status}) differs from one that is not (${gone.status})`);
        const owner = [
          ['its top folder', query('/api/files/browse', { path: ROOT }), (r) => r.text.includes('package.json')],
          ['the made-up note', query('/api/files/content', { path: NOTE_PATH }), (r) => r.body?.content?.includes(NOTE_TEXT) && r.body?.ownerOnly === true],
          ['a search', query('/api/files/search', { q: 'made-up-app' }), (r) => r.text.includes(NOTE)],
          ['its versions bar', query('/api/project-git/status', { path: ROOT }), () => true],
        ];
        for (const [what, url, ok] of owner) {
          const res = await t.api(pat, 'GET', url);
          if (res.status !== 200 || !ok(res)) problems.push(`Pat did not get ${what} (${res.status})`);
        }
        if (problems.length) throw new Error(problems.join('; '));
        return `all ${asks.length} of Sam's refused (403), naming nothing, and the same answer for a file that is not there; Pat's ${owner.length} answered`;
      });

      await check('hunt', "once censaiOS's own folder is among the projects open on the board (as when Pat opens it as a project), Sam's Try again opens the note and Sam's Files lists the folder, like any project open on the board", async ({ shot }) => {
        if (!filesId || !noteId) throw new Error('Files or the note did not open in the steps before');
        // Opening it as a project adds it to this list. The module writes the
        // list itself: opening it also writes a project brief into censaiOS's
        // own folder (.team/PROJECT.md), which would change this checkout.
        fs.mkdirSync(STATE_DIR, { recursive: true });
        fs.writeFileSync(OPEN_PROJECTS, JSON.stringify([ROOT]));
        await windowFrame(sam.page, noteId).getByRole('button', { name: 'Try again' }).click({ timeout: 10_000 });
        const samHas = await waitForText(sam.page, noteId, NOTE_TEXT);
        // Coming back to Files lists a folder it was refused again (src/components/files/useCatchUp.js).
        await windowFrame(sam.page, filesId).locator('.hb-win-header').first().click({ position: { x: 60, y: 12 }, timeout: 10_000 });
        const samSaw = await until(sam.page, filesId, (l) => l.rows.includes('package.json'));
        await bothWindows(t, noteId, 'once-pat-opens-it-sams-note-opens', shot);
        await bothWindows(t, filesId, 'once-pat-opens-it-sams-files-lists-it', shot);
        const problems = [];
        if (!samHas) problems.push(`Sam's note shows "${(await shownText(sam.page, noteId)).slice(0, 80)}", not its words`);
        if (!samSaw.rows.includes('package.json')) problems.push(`Sam's Files still says ${samSaw.notes.join(' / ') || 'nothing'}`);
        if (problems.length) throw new Error(problems.join('; '));
        return "Sam's note shows its words and Sam's Files lists censaiOS's own folder";
      });
    } finally {
      putBack();
      fs.rmSync(NOTE_PATH, { force: true });
    }
  },
};
