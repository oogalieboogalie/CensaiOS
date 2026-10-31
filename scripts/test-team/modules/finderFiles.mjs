// The Finder lists the board's open project, not a made-up computer. With no
// project open on the board (as on a new censaiOS), Pat Example's Add > Finder
// says so and offers to open one, with nothing made up in it (no Downloads
// folder, AirDrop, officepc, colour tags or recipe), and Sam Example's screen
// says only the computer's owner opens one. Pat opens a made-up project from
// that offer the way a person does (the folder picker: Home, the project's
// folder, Mount here, which stays inside the window even on a folder of many
// folders): the Finder lists exactly the files in the folder on disk, folders
// first, with their sizes and dates. A double-click opens the made-up note as
// a Document and the made-up code file in the Code editor, each with its
// words, and another double-click brings the open note forward instead of
// opening it twice, gliding the board over to it when it sits off past the
// edge of the screen. A double-click on a folder shows its files, and Back,
// Forward, the path bar and the sidebar move between folders. Sam sees the
// same files in the same Finder (of the made-up key file, only its name),
// browses on their own while Pat's Finder stays put, and opens a file from it.
// Sam's folder picker (the window's project, Mount to another folder) offers
// only the projects open on the board and says so, while Pat's still offers
// every folder censaiOS can reach. Bug hunt: a file added and one deleted outside censaiOS show when Pat comes
// back to the Finder; an empty folder says so; a folder deleted while it is
// open says so in plain words, and Back still works. Red team: Sam's
// double-click on a made-up key file shows Sam none of it; a signed-out
// visitor gets no list, and nobody gets the list of a folder outside the open
// projects; Sam's folder picker is refused Pat's home folder, censaiOS's own
// folder, a folder that is not there, a hidden folder and a link out of the
// project, in the same plain words each time. The board's default project and
// open projects are put back as the module found them. All files and words
// are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openBoard, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { FILE_PROBLEMS } from '../../../shared/files/fileProblems.js';
import { FINDER_WORDS, formatSize } from '../../../src/components/windows/finderFiles/finderFormat.js';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PLAN = 'made-up-plan.md';
const PLAN_TEXT = 'Made-up plan: paint the garden shed on Saturday.';
const TOOL = 'made-up-tool.js';
const TOOL_WORD = 'madeUpCounter';
const TOOL_TEXT = `// Made-up tool\nexport const ${TOOL_WORD} = 0;\n${'// a made-up line to give the file some size\n'.repeat(96)}`;
const PHOTOS = 'made-up-photos';
const LIST = 'made-up-list.md';
const LIST_TEXT = 'Made-up list: rope, lemons and a blue tarp.';
const RECORDING = 'made-up-recording.txt';
const EMPTY = 'made-up-empty';
const OLD = 'made-up-old.md';
const ADDED = 'made-up-added.md';
const KEY = 'made-up-server.key';
const KEY_WORDS = 'not-a-real-made-up-key';
const MADE_UP_COMPUTER = /Downloads|AirDrop|officepc|Brown butter|nectarine|All Tags/;
const GONE = 'This folder is not there any more. It may have been moved or deleted.';
// The folder picker on a teammate's screen (server/routes/files/folders.js).
const PICKER_REFUSAL = "Only this computer's owner can look in that folder.";
const TEAMMATE_NOTE = 'Only projects open on this board are shown.';
const OWNER_NOTE = 'Only folders censaiOS can reach are shown.';

// censaiOS's own folder, where it keeps the board's default project and its
// open projects (server/routes/projects/shared.js), so the module can put them back.
const STATE_DIR = process.env.CENSAI_STATE_DIR ? path.resolve(process.env.CENSAI_STATE_DIR) : path.join(ROOT, '.homebase-state');
const DEFAULT_PROJECT = path.join(STATE_DIR, 'current-project.json');
const KEPT = [DEFAULT_PROJECT, path.join(STATE_DIR, 'open-projects.json')];

/** Returns a function that puts the board's default project and open projects back as they are now. */
function keepProjects() {
  const before = KEPT.map((file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null));
  return () => KEPT.forEach((file, i) => (before[i] === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, before[i])));
}

/** A made-up project in the home folder, where the folder picker can reach it. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.homedir(), 'made-up-finder-'));
  const put = (name, words, when) => {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, words);
    if (when) fs.utimesSync(file, when, when);
  };
  const now = new Date();
  put(PLAN, `${PLAN_TEXT}\n`, new Date(now.getTime() - 5 * 60_000));
  put(TOOL, TOOL_TEXT, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 14, 5));
  put(OLD, 'Made-up old note.\n');
  put(KEY, `MADE-UP KEY ${KEY_WORDS}\n`);
  put(path.join(PHOTOS, LIST), `${LIST_TEXT}\n`);
  put(path.join(PHOTOS, RECORDING), 'made-up '.repeat(187_500), new Date(2026, 2, 14, 10, 3));
  put('.made-up-hidden', 'Made-up hidden file.\n');
  put(path.join('node_modules', 'made-up-package', 'index.js'), 'module.exports = 1;\n');
  fs.mkdirSync(path.join(dir, EMPTY));
  return dir;
}

/** What the Finder should list for a folder: read from disk, leaving out what Files leaves out. */
function onDisk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
    .map((e) => ({ name: e.name, size: e.isDirectory() ? '--' : formatSize(fs.lstatSync(path.join(folder, e.name)).size) }));
}

/** The projects open on the board, as this person's server reads them. */
async function openRoots(t, person) {
  const res = await t.api(person, 'GET', '/api/projects');
  // A GitHub project (as githubReads opens one in the same run) has no folder.
  return (res.body?.projects || []).filter((p) => p.path).map((p) => path.resolve(p.path));
}

/** The Finder's rows on this person's screen, as [name, date, size]. */
const shownRows = (page, id) => windowFrame(page, id).locator('[data-testid="finder-row"]')
  .evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => cell.textContent.trim())));

async function waitForNames(page, id, names, ms = 15_000) {
  const until = Date.now() + ms;
  let seen = [];
  while (Date.now() < until) {
    seen = await shownRows(page, id).catch(() => []);
    if (seen.map(([name]) => name).join('|') === names.join('|')) break;
    await page.waitForTimeout(250);
  }
  return seen;
}

/**
 * Problems if the Finder's rows are not the folder on disk, names and sizes.
 * A teammate (keyNameOnly) sees only the name of the made-up key file.
 */
function listProblems(who, seen, folder, { keyNameOnly = false } = {}) {
  const want = onDisk(folder);
  const names = seen.map(([name]) => name);
  if (names.join('|') !== want.map((w) => w.name).join('|')) {
    return [`${who}'s Finder lists ${names.join(', ') || 'nothing'}, not ${want.map((w) => w.name).join(', ')}`];
  }
  return want.flatMap((w, i) => {
    if (keyNameOnly && w.name === KEY) {
      return seen[i][1] === '--' && seen[i][2] === '--' ? [] : [`${who} sees when ${KEY} changed or its size (${seen[i][1]}, ${seen[i][2]})`];
    }
    return seen[i][2] === w.size ? [] : [`${who}'s ${w.name} shows size "${seen[i][2]}", not "${w.size}"`];
  });
}

const finderText = (page, id, selector) => windowFrame(page, id).locator(selector).allTextContents();
const noteOf = async (page, id) => (await finderText(page, id, '[data-testid="finder-note"] > span')).join(' ').trim();

async function waitForNote(page, id, words, ms = 15_000) {
  const until = Date.now() + ms;
  let seen = '';
  while (Date.now() < until) {
    seen = await noteOf(page, id).catch(() => '');
    if (seen.includes(words)) break;
    await page.waitForTimeout(250);
  }
  return seen;
}

const filesOpen = (page, kind, name) => page.evaluate(([k, n]) => window.__e2eStore.getState().wins
  .filter((w) => w.kind === k && String(w.filePath || '').endsWith(`/${n}`)).map((w) => w.id), [kind, name]);

/** Double-clicks a row; for a file, returns the window it opened (or brought forward), moved to `at` (so no window covers another). */
async function openRow(page, finderId, name, kind, at) {
  await windowFrame(page, finderId).locator('[data-testid="finder-row"]', { hasText: name }).first().dblclick({ timeout: 5_000 });
  if (!kind) return null;
  await page.waitForFunction(([k, n]) => window.__e2eStore.getState().wins
    .some((w) => w.kind === k && String(w.filePath || '').endsWith(`/${n}`)), [kind, name], { timeout: 10_000 });
  const [id] = await filesOpen(page, kind, name);
  if (at) {
    const { w = 520, h = 250 } = at;
    await updateWindow(page, id, { ...at, w, h, width: w, height: h });
  }
  return id;
}

/** The words a Document or Code editor shows: its typing box or code, else its page. */
const shownText = (page, id) => windowFrame(page, id).evaluate((el) => {
  const box = el.querySelector('textarea');
  if (box) return box.value;
  const code = el.querySelector('.cm-content');
  return code ? code.innerText : el.textContent;
});

async function waitForText(page, id, words, ms = 15_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await shownText(page, id).catch(() => '')).includes(words)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

const homeView = (page) => page.evaluate(() => {
  const st = window.__e2eStore.getState();
  st.setPan?.({ x: 0, y: 0 });
  st.setZoom?.(1);
});

const inUse = (page, id) => page.waitForFunction((wid) => window.__e2eStore.getState().activeId === wid, id, { timeout: 5_000 });

/** Whether an element sits wholly inside a window's frame, nothing of it cut off by the frame's edge. */
async function insideFrame(page, id, locator) {
  const [box, frame] = await Promise.all([locator.boundingBox(), windowFrame(page, id).boundingBox()]);
  return Boolean(box && frame && box.x >= frame.x && box.y >= frame.y
    && box.x + box.width <= frame.x + frame.width && box.y + box.height <= frame.y + frame.height);
}

/** Whether a window's frame sits wholly on the screen. */
async function onScreen(page, id) {
  const box = await windowFrame(page, id).boundingBox().catch(() => null);
  const size = page.viewportSize();
  return Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height);
}

async function waitOnScreen(page, id, ms = 5_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await onScreen(page, id)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/**
 * Clicks another window, the way a person turns to it; returns a step that
 * clicks back on the Finder.
 */
async function turnAway(page, finderId, otherId) {
  await homeView(page);
  await windowFrame(page, otherId).locator('.hb-win-header').first().click({ position: { x: 60, y: 12 }, timeout: 10_000 });
  await inUse(page, otherId);
  return async () => {
    await windowFrame(page, finderId).locator('.hb-finder-toolbar-title').click({ timeout: 10_000 });
    await inUse(page, finderId);
  };
}

export default {
  id: 'finderFiles',
  label: "The Finder lists the open project's files",
  async run(t) {
    const { pat, sam, check } = t;
    const putBack = keepProjects();
    const dir = makeProject();
    t.typed.push(PLAN_TEXT, LIST_TEXT, TOOL_WORD, KEY_WORDS);
    let finderId = null;
    let planId = null;
    const ROOT_NAMES = () => onDisk(dir).map((w) => w.name);

    try {
      // A new censaiOS: no default project on the board.
      fs.rmSync(DEFAULT_PROJECT, { force: true });
      await Promise.all([pat, sam].map((p) => openBoard(p.page, t.workspaceId, t.web)));
      for (const p of [pat, sam]) await homeView(p.page);

      await check('walk', 'with no project open on the board, Add > Finder says so and offers to open one, with nothing made up; Sam is told only the owner opens one', async ({ shot }) => {
        const finder = await addFromMenu(pat.page, 'Finder');
        if (finder.kind !== 'finderFiles') throw new Error(`the Add menu opened ${finder.kind || 'nothing'}, not the Finder`);
        finderId = finder.id;
        await updateWindow(pat.page, finderId, { x: 16, y: 64, w: 860, h: 560, width: 860, height: 560 });
        await homeView(pat.page);
        const frame = windowFrame(pat.page, finderId);
        const says = await frame.getByTestId('finder-no-project').innerText({ timeout: 10_000 }).catch(() => '');
        const offer = frame.getByRole('button', { name: FINDER_WORDS.openProject });
        await offer.waitFor({ timeout: 10_000 }).catch(() => {});
        const samSays = await windowFrame(sam.page, finderId).getByTestId('finder-no-project').innerText({ timeout: 10_000 }).catch(() => '');
        await sideBySide(t, 'no-project-yet', shot);
        const problems = [];
        if (!says.includes(FINDER_WORDS.noProject)) problems.push(`Pat's Finder says "${says.trim() || (await frame.innerText()).slice(0, 120)}", not that no project is open`);
        if (!(await offer.count())) problems.push('Pat is not offered to open a project');
        if (MADE_UP_COMPUTER.test(await frame.innerText())) problems.push('it still shows the made-up computer');
        if (!samSays.includes(FINDER_WORDS.ownerOpens)) problems.push(`Sam's screen says "${samSays.trim()}", not that only the owner opens a project`);
        if (await windowFrame(sam.page, finderId).getByRole('button', { name: FINDER_WORDS.openProject }).count()) problems.push('Sam is offered a picker the server would refuse');
        if (problems.length) throw new Error(problems.join('; '));
        return `Pat's says "${FINDER_WORDS.noProject}" with "${FINDER_WORDS.openProject}"; Sam's says "${FINDER_WORDS.ownerOpens}"`;
      });

      await check('walk', 'Pat opens the made-up project from that offer (Home, its folder, Mount here, the picker inside the window even on a folder of many folders): the Finder lists exactly the files in the folder, folders first, with their sizes and dates', async ({ shot }) => {
        if (!finderId) throw new Error('the Finder did not open in the step before');
        const frame = windowFrame(pat.page, finderId);
        await frame.getByRole('button', { name: FINDER_WORDS.openProject }).click({ timeout: 5_000 });
        const picker = frame.getByRole('dialog', { name: 'Mount to a folder' });
        // censaiOS's own folder holds a couple of dozen folders: the picker at its tallest.
        await picker.getByRole('button', { name: 'censaiOS folder', exact: true }).click({ timeout: 10_000 });
        await picker.getByRole('option').nth(11).waitFor({ timeout: 10_000 });
        const mountFits = await insideFrame(pat.page, finderId, picker.getByRole('button', { name: 'Mount here' }));
        await shot(pat.page, 'the-picker-fits-the-window');
        const home = picker.getByRole('button', { name: 'Home', exact: true });
        await home.click({ timeout: 10_000 });
        await picker.getByRole('option', { name: path.basename(dir) }).click({ timeout: 10_000 });
        await picker.locator('.hb-folder-picker-path', { hasText: dir }).waitFor({ timeout: 10_000 });
        await shot(pat.page, 'picking-the-made-up-project');
        await picker.getByRole('button', { name: 'Mount here' }).click({ timeout: 5_000 });
        const seen = await waitForNames(pat.page, finderId, ROOT_NAMES());
        await shot(pat.page, 'the-made-up-project-listed');
        const problems = listProblems('Pat', seen, dir);
        if (!mountFits) problems.push('with a folder of many folders in the picker, Mount here was cut off by the window\'s edge');
        const date = (name) => seen.find(([n]) => n === name)?.[1] || '';
        if (!date(PLAN).startsWith('Today at')) problems.push(`${PLAN}, changed minutes ago, says "${date(PLAN)}"`);
        if (!date(TOOL).startsWith('Yesterday at')) problems.push(`${TOOL}, changed yesterday, says "${date(TOOL)}"`);
        if (seen.some(([name]) => /hidden|node_modules/.test(name))) problems.push('it lists a hidden file or node_modules');
        if (MADE_UP_COMPUTER.test(await frame.innerText())) problems.push('it still shows the made-up computer');
        if (problems.length) throw new Error(problems.join('; '));
        return `${seen.length} entries, as on disk: ${seen.map(([n, d, s]) => `${n} (${s}, ${d})`).join('; ')}`;
      });

      await check('walk', 'a double-click opens the made-up note as a Document and the code file in the Code editor, each with its words; another double-click brings the open note forward instead of opening it twice', async ({ shot }) => {
        planId = await openRow(pat.page, finderId, PLAN, 'doc', { x: 900, y: 64 });
        const toolId = await openRow(pat.page, finderId, TOOL, 'code_editor', { x: 900, y: 330 });
        await homeView(pat.page);
        const problems = [];
        if (!(await waitForText(pat.page, planId, PLAN_TEXT))) problems.push('the Document opened without the note\'s words');
        if (!(await waitForText(pat.page, toolId, TOOL_WORD))) problems.push('the Code editor opened without the file\'s code');
        await openRow(pat.page, finderId, PLAN, 'doc');
        await pat.page.waitForTimeout(500);
        const plans = await filesOpen(pat.page, 'doc', PLAN);
        const active = await pat.page.evaluate(() => window.__e2eStore.getState().activeId);
        if (plans.length !== 1) problems.push(`the note is open in ${plans.length} Documents`);
        if (active !== planId) problems.push('the open note was not brought forward');
        await homeView(pat.page);
        await shot(pat.page, 'note-and-code-open');
        if (problems.length) throw new Error(problems.join('; '));
        return 'both open with their words, and the second double-click brought the same Document forward';
      });

      await check('walk', 'with the open note moved off past the edge of the screen, a double-click on it in the Finder glides the board over until the whole note is on screen', async ({ shot }) => {
        if (!planId) throw new Error('the note did not open in the step before');
        await homeView(pat.page);
        await updateWindow(pat.page, planId, { x: 2300, y: 64 });
        const problems = [];
        if (await onScreen(pat.page, planId)) problems.push('the note was still on screen after it was moved away');
        await openRow(pat.page, finderId, PLAN, 'doc');
        if (!(await waitOnScreen(pat.page, planId))) problems.push('the board did not glide to the note');
        const active = await pat.page.evaluate(() => window.__e2eStore.getState().activeId);
        if (active !== planId) problems.push('the note was not brought forward');
        const plans = await filesOpen(pat.page, 'doc', PLAN);
        if (plans.length !== 1) problems.push(`the note is open in ${plans.length} Documents`);
        await shot(pat.page, 'the-board-glided-to-the-open-note');
        await updateWindow(pat.page, planId, { x: 900, y: 64 });
        await homeView(pat.page);
        if (problems.length) throw new Error(problems.join('; '));
        return 'the note was off past the right edge; the double-click glided the board until all of it was on screen, in front, still one Document';
      });

      await check('walk', 'a double-click on a folder shows its files; Back, Forward, the path bar and the sidebar move between folders', async ({ shot }) => {
        await homeView(pat.page);
        const frame = windowFrame(pat.page, finderId);
        const photos = onDisk(path.join(dir, PHOTOS)).map((w) => w.name);
        const problems = [];
        const expect = async (what, names) => {
          const seen = await waitForNames(pat.page, finderId, names);
          if (seen.map(([n]) => n).join('|') !== names.join('|')) problems.push(`after ${what} it lists ${seen.map(([n]) => n).join(', ') || 'nothing'}`);
          return seen;
        };
        await openRow(pat.page, finderId, PHOTOS);
        const inside = await expect('the double-click', photos);
        problems.push(...listProblems('Pat', inside, path.join(dir, PHOTOS)));
        const recording = inside.find(([n]) => n === RECORDING)?.[1] || '';
        if (!/14/.test(recording) || !/2026/.test(recording)) problems.push(`${RECORDING}, changed on 14 March 2026, says "${recording}"`);
        const title = (await finderText(pat.page, finderId, '.hb-finder-toolbar-title'))[0];
        const crumbs = await finderText(pat.page, finderId, '.hb-finder-crumb');
        if (title !== PHOTOS) problems.push(`the title says "${title}"`);
        if (crumbs.length !== 2 || crumbs[1] !== PHOTOS) problems.push(`the path bar says ${crumbs.join(' > ')}`);
        await shot(pat.page, 'inside-a-folder');
        await frame.getByRole('button', { name: 'Back' }).click();
        await expect('Back', ROOT_NAMES());
        await frame.getByRole('button', { name: 'Forward' }).click();
        await expect('Forward', photos);
        await frame.locator('.hb-finder-crumb').first().click();
        await expect('the path bar', ROOT_NAMES());
        await frame.getByLabel('Finder sidebar').getByRole('button', { name: PHOTOS }).click();
        await expect('the sidebar', photos);
        await frame.locator('.hb-finder-crumb').first().click();
        await expect('the path bar again', ROOT_NAMES());
        if (problems.length) throw new Error(problems.join('; '));
        return `the folder lists ${photos.join(', ')} (${inside.map(([, d, s]) => `${s}, ${d}`).join('; ')}); Back, Forward, the path bar and the sidebar each land on the right folder`;
      });

      await check('walk', 'Sam sees the same files in the same Finder (of the made-up key file, only its name), browses on their own while Pat\'s Finder stays put, and opens a file from it', async ({ shot }) => {
        const problems = listProblems('Sam', await waitForNames(sam.page, finderId, ROOT_NAMES()), dir, { keyNameOnly: true });
        const photos = onDisk(path.join(dir, PHOTOS)).map((w) => w.name);
        await openRow(sam.page, finderId, PHOTOS);
        const samInside = await waitForNames(sam.page, finderId, photos);
        if (samInside.map(([n]) => n).join('|') !== photos.join('|')) problems.push(`Sam's double-click on the folder shows ${samInside.map(([n]) => n).join(', ') || 'nothing'}`);
        await pat.page.waitForTimeout(1500);
        const patNames = (await shownRows(pat.page, finderId)).map(([n]) => n);
        if (patNames.join('|') !== ROOT_NAMES().join('|')) problems.push(`Pat's Finder moved too: it lists ${patNames.join(', ')}`);
        const listId = await openRow(sam.page, finderId, LIST, 'doc', { x: 900, y: 596 });
        await homeView(sam.page);
        if (!(await waitForText(sam.page, listId, LIST_TEXT))) problems.push('Sam\'s Document opened without the list\'s words');
        await sideBySide(t, 'sam-browses-on-their-own', shot);
        await windowFrame(sam.page, finderId).getByRole('button', { name: 'Back' }).click();
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's Finder lists the same ${ROOT_NAMES().length} entries (${KEY} with no date or size), went into ${PHOTOS} while Pat's stayed at the top, and Sam's double-click opened ${LIST} with its words`;
      });

      await check('walk', "Sam's folder picker (the window's project, Mount to another folder) offers only the projects open on the board and says so; Pat's still offers every folder censaiOS can reach", async ({ shot }) => {
        const open = await openRoots(t, sam);
        const seen = {};
        for (const [who, person] of [['Pat', pat], ['Sam', sam]]) {
          await homeView(person.page);
          const frame = windowFrame(person.page, finderId);
          await frame.locator('.hb-win-project-chip').click({ timeout: 5_000 });
          await frame.getByRole('menuitem', { name: 'Mount to another folder…' }).click({ timeout: 5_000 });
          const picker = frame.getByRole('dialog', { name: 'Mount to a folder' });
          await picker.locator('.hb-folder-picker-path', { hasText: dir }).waitFor({ timeout: 10_000 });
          seen[who] = {
            places: await picker.locator('.hb-folder-picker-place').evaluateAll((els) => els.map((el) => ({ name: el.textContent, path: el.title }))),
            note: (await picker.locator('.hb-folder-picker-foot .hb-folder-picker-note').innerText()).trim(),
          };
        }
        await sideBySide(t, 'sams-picker-shows-only-open-projects', shot);
        for (const person of [pat, sam]) await person.page.keyboard.press('Escape');
        const problems = [];
        const sams = seen.Sam.places;
        if (!sams.some((p) => p.path === dir)) problems.push("Sam's picker does not offer the made-up project");
        const extra = sams.filter((p) => !open.includes(p.path)).map((p) => p.name);
        if (extra.length) problems.push(`Sam's picker offers ${extra.join(', ')}, not open on the board`);
        if (seen.Sam.note !== TEAMMATE_NOTE) problems.push(`Sam's picker says "${seen.Sam.note}"`);
        const pats = seen.Pat.places.map((p) => p.name);
        if (!pats.includes('Home')) problems.push(`Pat's picker offers only ${pats.join(', ')}, without Home`);
        if (seen.Pat.note !== OWNER_NOTE) problems.push(`Pat's picker says "${seen.Pat.note}"`);
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's offers ${sams.map((p) => p.name).join(', ')} with "${TEAMMATE_NOTE}"; Pat's offers ${pats.join(', ')} with "${OWNER_NOTE}"`;
      });

      await check('hunt', 'a file added and one deleted outside censaiOS show when Pat comes back to the Finder', async ({ shot }) => {
        if (!planId) throw new Error('the note did not open in the steps before');
        const back = await turnAway(pat.page, finderId, planId);
        fs.writeFileSync(path.join(dir, ADDED), 'Made-up added note.\n');
        fs.rmSync(path.join(dir, OLD), { force: true });
        await back();
        const seen = await waitForNames(pat.page, finderId, ROOT_NAMES());
        await shot(pat.page, 'outside-changes-shown');
        const problems = listProblems('Pat', seen, dir);
        if (problems.length) throw new Error(problems.join('; '));
        return `it lists ${ADDED} and no longer ${OLD}, with nothing pressed but the window`;
      });

      await check('hunt', 'an empty folder says so; a folder deleted while it is open says so in plain words, and Back still works', async ({ shot }) => {
        await openRow(pat.page, finderId, EMPTY);
        const empty = await waitForNote(pat.page, finderId, FINDER_WORDS.empty);
        const back = await turnAway(pat.page, finderId, planId);
        fs.rmSync(path.join(dir, EMPTY), { recursive: true, force: true });
        await back();
        const gone = await waitForNote(pat.page, finderId, GONE);
        await shot(pat.page, 'a-folder-that-is-gone');
        const problems = [];
        if (!empty.includes(FINDER_WORDS.empty)) problems.push(`the empty folder says "${empty}"`);
        if (!gone.includes(GONE)) problems.push(`the deleted folder says "${gone}"`);
        if (/ENOENT|doesn't exist|status \d|made-up-finder-/.test(gone)) problems.push('its words are technical or name the folder\'s path');
        await windowFrame(pat.page, finderId).getByRole('button', { name: 'Back' }).click();
        const seen = await waitForNames(pat.page, finderId, ROOT_NAMES());
        problems.push(...listProblems('Pat', seen, dir));
        if (problems.length) throw new Error(problems.join('; '));
        return `"${FINDER_WORDS.empty}", then "${GONE}"; Back lists the project again, without the deleted folder`;
      });

      await check('redteam', 'Sam\'s double-click on a made-up key file shows Sam none of it, only that the computer\'s owner opens it', async ({ shot }) => {
        const keyId = await openRow(sam.page, finderId, KEY, 'doc', { x: 260, y: 640, w: 600, h: 230 });
        await homeView(sam.page);
        const box = windowFrame(sam.page, keyId).getByTestId('file-load-error');
        const says = (await box.innerText({ timeout: 15_000 }).catch(() => '')).trim();
        await shot(sam.page, 'sam-and-the-key-file');
        const problems = [];
        if (!says.includes(FILE_PROBLEMS.ownerOnly)) problems.push(`Sam's window says "${says}"`);
        if ((await shownText(sam.page, keyId)).includes(KEY_WORDS)) problems.push('the made-up key shows on Sam\'s screen');
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's window says "${says.split('\n')[0]}" and shows none of the file`;
      });

      await check('redteam', "Sam's folder picker is refused Pat's home folder, censaiOS's own folder, a folder that is not there, a hidden folder and a link out of the project, in the same plain words each time; Pat's still lists them", async () => {
        const hidden = path.join(dir, '.made-up-logins');
        const link = path.join(dir, 'made-up-link-out');
        fs.mkdirSync(path.join(hidden, 'made-up-inner'), { recursive: true });
        fs.symlinkSync(os.homedir(), link, 'dir');
        try {
          const open = await openRoots(t, sam);
          const inOpen = (folder) => open.some((root) => folder === root || folder.startsWith(`${root}${path.sep}`));
          // A folder open on the board (censaiOS's own, when a module before opened it) is Sam's to look in.
          const asks = [
            ["Pat's home folder", os.homedir()],
            ["censaiOS's own folder", ROOT],
            ['a folder that is not there', path.join(os.homedir(), 'made-up-not-there')],
            ['/etc', '/etc'],
          ].filter(([, folder]) => !inOpen(folder)).concat([
            ['a hidden folder in the project', hidden],
            ['a folder inside it', path.join(hidden, 'made-up-inner')],
            ['a link out of the project', link],
          ]);
          const problems = [];
          for (const [what, folder] of asks) {
            const res = await t.api(sam, 'GET', `/api/files/folders?path=${encodeURIComponent(folder)}`);
            if (res.status !== 403 || res.body?.error !== PICKER_REFUSAL) problems.push(`Sam asking for ${what} got ${res.status} "${res.body?.error || res.text.slice(0, 80)}"`);
            const keys = Object.keys(res.body || {}).sort().join(',');
            if (keys !== 'code,error,openProjectsOnly,places,reason') problems.push(`Sam's answer for ${what} carries ${keys}`);
            const others = (res.body?.places || []).filter((p) => !open.includes(p.path));
            if (others.length) problems.push(`Sam's answer for ${what} names ${others.length} folder(s) not open on the board`);
            if (res.text.includes('made-up-inner')) problems.push(`Sam's answer for ${what} names a folder inside the hidden one`);
          }
          const patHome = await t.api(pat, 'GET', `/api/files/folders?path=${encodeURIComponent(os.homedir())}`);
          if (patHome.status !== 200 || !patHome.body?.folders?.some((f) => f.path === dir)) problems.push(`Pat's picker could not list the home folder (${patHome.status})`);
          if (problems.length) throw new Error(problems.join('; '));
          return `${asks.map(([what]) => what).join(', ')}: each "${PICKER_REFUSAL}" with only the open projects; Pat's picker still lists the home folder`;
        } finally {
          fs.rmSync(link, { force: true });
          fs.rmSync(hidden, { recursive: true, force: true });
        }
      });

      await check('redteam', 'a signed-out visitor gets no list, and nobody gets the list of a folder outside the open projects', async () => {
        const visitor = { ctx: t.signedOut };
        const asks = [
          ['a visitor', visitor, dir],
          ['Pat', pat, '/etc'],
          ['Sam', sam, '/etc'],
          ['Sam', sam, os.homedir()],
        ];
        const problems = [];
        for (const [who, person, folder] of asks) {
          const res = await t.api(person, 'GET', `/api/files/browse?path=${encodeURIComponent(folder)}&details=1`);
          if (res.status < 400) problems.push(`${who} got the list of ${folder === dir ? 'the project' : folder} (${res.status})`);
          if (/made-up-plan|passwd|hostname/.test(res.text)) problems.push(`${who}'s answer names files in it`);
        }
        if (problems.length) throw new Error(problems.join('; '));
        return 'refused each time, naming no file';
      });
    } finally {
      putBack();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
