// A project's files that hold keys open only for this computer's owner. Pat
// Example (the owner) opens a made-up project in Files on a board shared with
// Sam Example (a teammate): Files lists its ordinary files and none of its
// hidden ones (.env, .git). Pat opens made-up.env in the Code editor and the
// made-up key file as a Document: Pat sees their made-up keys, with a line
// saying they stay on Pat's screen (and no Preview, which would copy them onto
// the board), and on Sam's screen the same windows say only this computer's
// owner opens them, with no key and no "Try again", before and after a
// reload. A line Pat types into the key file stays off Sam's board, and Pat's
// Save still works. A link out of the project opens for Pat and is outside
// the project on Sam's screen. Bug hunt: the made-up .env.example and an
// ordinary note still open for Sam; key files a cloud service, a framework
// and Terraform name (serviceAccountKey.json, opened from Files, secrets.yml,
// an .auto.tfvars, Terraform's state and a values file handed to it) show Pat
// their words and Sam the plain words, while the look-alikes
// secrets.example.json and prod.tfvars.example open for Sam; a .env asked for through a link, and a
// file in the hidden .git folder opened by its path the way an agent opens
// one, show Pat their words and Sam the plain words; a settings file in a
// hidden folder that Pat formats stays off Sam's board; a plan in a hidden
// folder opened as Step cards says why it makes no cards, for Pat too, while
// an ordinary plan still turns into cards both see. Red team: Sam's own
// requests for each made-up file that holds keys get one plain answer whether
// or not the file is there, never its words; a link out of the project and
// its folder stay outside it for Sam; Sam cannot list or search the hidden or
// linked-out folders; Step cards never read a key file's words, and a hidden
// folder's only for Pat; an agent given the project reads Sam its ordinary
// note but gives Sam plain words for the key files, never their words, while
// it reads Pat the key; off a board (a chat sent with no board) the same
// agent gives Sam plain words even for the ordinary note, and reads it to
// Pat; the live preview beside a chat gives plain words for
// the link to the .env and a page in a hidden folder, whoever's agent asks,
// and shows an ordinary page without what it would pull in from the .env or
// the hidden folder; a link to the server's own settings
// (/proc/self/environ) opens for no one; and the refusals are logged without
// a file's name, path or words. No made-up key ever reaches Sam's screen or
// Sam's copy of the board. The board's list of open projects is put back as
// the module found it. All files and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openBoard, readWindow, spawnWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { FILE_PROBLEMS, OFF_BOARD_NOTE, PREVIEW_OFF_BOARD, STEPS_OFF_BOARD } from '../../../shared/files/fileProblems.js';
import { addFromMenu } from '../addMenu.mjs';
import { fileAsk } from '../standinFileAsk.mjs';
import { sideBySide } from '../sideBySide.mjs';

// Every made-up key carries this, so one search finds any of them anywhere.
const KEY = `not-a-real-made-up-key-${Date.now().toString(36)}`;
const NOTE = 'made-up-plan.md';
const NOTE_TEXT = 'Made-up note: the plan for the shared board.';
const ENV = 'made-up.env';
const KEY_FILE = 'made-up-server.key';
const LINK = 'made-up-link.md';
const OUT_LINK = 'made-up-outside-link.md';
const OUT_FOLDER = 'made-up-elsewhere';
const SETTINGS_LINK = 'made-up-settings.md';
const HIDDEN_SETTINGS = ['.made-up', 'settings.json'];
const HIDDEN_PAGE = ['.made-up', 'page.html'];
const HIDDEN_PLAN = ['.made-up', 'steps.todo'];
const PLAN = 'made-up-steps.todo';
// A copy and a backup of files that hold keys hold the same keys.
const BACKUPS = ['made-up-server.key.bak', '.env~'];
// Key files a cloud service, a framework and Terraform name (the values it reads by
// itself, the state it writes them into, values handed to it), and look-alike examples.
const SERVICE_KEY = 'serviceAccountKey.json';
const MORE_KEYS = [['config', 'secrets.yml', 'secrets'], ['infra', 'made-up.auto.tfvars', 'tfvars'], ['infra', 'terraform.tfstate', 'tfstate'], ['infra', 'prod.tfvars', 'prod-tfvars']];
const LOOK_ALIKE = ['config', 'secrets.example.json'];
const TERRAFORM_LOOK_ALIKE = ['infra', 'prod.tfvars.example'];
const PAGE = 'made-up-page.html';
const PAGE_TEXT = 'Made-up page for the live preview';
// No underscores: the Document shows Markdown, where they would turn into slanted words.
const PAT_LINE = `Made-up second line ${KEY}-typed`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const { ownerOnly: OWNER_ONLY, outside: OUTSIDE } = FILE_PROBLEMS;
// Off a board no project is shared with anyone (server/tools/rbac/ownerOnlyReads.js).
const PROJECT_OFF_BOARD = "Only this computer's owner's agents work in its projects outside a board.";
const TECHNICAL = /status \d|ENOENT|EACCES|no such file|Access denied|Failed to load|undefined/i;

// Where this censaiOS keeps the projects opened on its board (as
// server/routes/projects/shared.js does), so the module can put that list back.
const STATE_DIR = process.env.CENSAI_STATE_DIR ? path.resolve(process.env.CENSAI_STATE_DIR) : path.join(ROOT, '.homebase-state');
const OPEN_PROJECTS = path.join(STATE_DIR, 'open-projects.json');

function keepOpenProjects() {
  const before = fs.existsSync(OPEN_PROJECTS) ? fs.readFileSync(OPEN_PROJECTS, 'utf8') : null;
  return () => {
    if (before === null) fs.rmSync(OPEN_PROJECTS, { force: true });
    else fs.writeFileSync(OPEN_PROJECTS, before);
  };
}

/** A made-up plan file with one card of one step, as Step cards read one. */
const stepsFile = (card) => ['censaiOS to-do file', 'Title: Made-up steps', '', `== Card 1: ${card}`, 'Goal: Made-up goal.', '',
  '-- Step 1: Made-up step', 'Made-up words for the step.', '[ ] ask the made-up step is done', ''].join('\n');

/** The made-up project, and a made-up folder outside it that two of its links lead to. */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-project-')));
  const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-elsewhere-')));
  const write = (file, words) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, words);
  };
  write(path.join(dir, NOTE), `${NOTE_TEXT}\n`);
  write(path.join(dir, ENV), `MADE_UP_KEY=${KEY}-env\n`);
  write(path.join(dir, '.env'), `MADE_UP_KEY=${KEY}-dotenv\n`);
  write(path.join(dir, '.env.example'), 'MADE_UP_KEY=\n');
  for (const name of BACKUPS) write(path.join(dir, name), `MADE_UP_KEY=${KEY}-backup\n`);
  write(path.join(dir, SERVICE_KEY), `{"made_up_key":"${KEY}-service"}\n`);
  for (const [folder, name, kind] of MORE_KEYS) write(path.join(dir, folder, name), `made_up_key: ${KEY}-${kind}\n`);
  write(path.join(dir, ...LOOK_ALIKE), '{"made_up_key":""}\n');
  write(path.join(dir, ...TERRAFORM_LOOK_ALIKE), 'made_up_password = ""\n');
  write(path.join(dir, KEY_FILE), `MADE-UP PRIVATE KEY ${KEY}-pem\n`);
  write(path.join(dir, '.git', 'config'), `[remote "origin"]\n  url = https://${KEY}-token@example.invalid/made-up.git\n`);
  write(path.join(dir, ...HIDDEN_SETTINGS), `{"madeUp":"${KEY}-json","alsoMadeUp":true}\n`);
  write(path.join(dir, ...HIDDEN_PAGE), `<h1>Made-up hidden page ${KEY}-page</h1>\n`);
  write(path.join(dir, '.made-up', 'style.css'), `h1::after{content:"${KEY}-css"}\n`);
  write(path.join(dir, PAGE), `<link rel="stylesheet" href=".made-up/style.css"><script src="${ENV}"></script><h1>${PAGE_TEXT}</h1>\n`);
  write(path.join(dir, ...HIDDEN_PLAN), stepsFile(`Made-up hidden card ${KEY}-todo`));
  write(path.join(dir, PLAN), stepsFile('Made-up card for everyone'));
  write(path.join(elsewhere, 'outside-note.md'), `Made-up words outside the project ${KEY}-outside\n`);
  write(path.join(elsewhere, 'picture.png'), PNG);
  fs.symlinkSync(path.join(dir, '.env'), path.join(dir, LINK));
  fs.symlinkSync(elsewhere, path.join(dir, OUT_FOLDER));
  fs.symlinkSync(path.join(elsewhere, 'outside-note.md'), path.join(dir, OUT_LINK));
  if (process.platform === 'linux') fs.symlinkSync('/proc/self/environ', path.join(dir, SETTINGS_LINK));
  return { dir, elsewhere, at: (...parts) => path.join(dir, ...parts) };
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
    if ((await shownText(page, id).catch(() => '')).includes(words)) return true;
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

/** Problems with Sam's view of a window that should say `want`: other words, technical words, "Try again". */
async function samProblems(page, id, what, want) {
  const says = await banner(page, id);
  const problems = [];
  if (!says.includes(want)) problems.push(`Sam's ${what} says ${says ? `"${says}"` : 'nothing'}, not "${want}"`);
  if (TECHNICAL.test(says)) problems.push(`Sam's ${what} says it in technical words`);
  if (await windowFrame(page, id).getByRole('button', { name: 'Try again' }).count()) problems.push(`Sam's ${what} offers "Try again", which can never help`);
  return { says, problems };
}

/** Which made-up keys `text` holds, by the file each came from (env, pem, typed, ...). */
const keysIn = (text) => [...new Set([...text.matchAll(new RegExp(`${KEY}-([a-z]+)`, 'g'))].map((m) => m[1]))].join(', ');

/** Where a made-up key shows for this person: on their screen, or in their copy of the shared board. */
async function keyShows(page) {
  const where = [];
  const screen = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('textarea, input')].map((el) => el.value)].join('\n'));
  if (screen.includes(KEY)) where.push(`on the screen (${keysIn(screen)})`);
  const board = await page.evaluate(() => JSON.stringify(window.__e2eStore.getState().wins));
  if (board.includes(KEY)) where.push(`in the board's copy of the windows (${keysIn(board)})`);
  return where;
}

/** Watches Sam's browser for `ms` (the board shares a change within a second or two); where a key showed, or []. */
async function keyReachesSam(t, ms = 5_000) {
  const until = Date.now() + ms;
  for (;;) {
    const where = await keyShows(t.sam.page);
    if (where.length || Date.now() > until) return where;
    await t.sam.page.waitForTimeout(500);
  }
}

const homeView = (page) => page.evaluate(() => {
  const st = window.__e2eStore.getState();
  st.setPan?.({ x: 0, y: 0 });
  st.setZoom?.(1);
});

/** Moves both people's view so the board's point (x, y) sits at the top left. */
async function lookAt(t, x, y) {
  for (const p of [t.pat, t.sam]) await p.page.evaluate(([px, py]) => window.__e2eStore.getState().setPan?.({ x: px, y: py }), [24 - x, 64 - y]);
}

let asks = 0;
/** Asks Atlas in a chat as `who`: what its file tool answered (from the stand-in model's log), and the chat's own reply. */
async function askAtlas(t, who, words, extra = {}) {
  // Numbered, so one person's answers are never read as another's.
  const said = `${words} (made-up ask ${asks += 1})`;
  t.typed.push(said);
  const res = await t.api(who, 'POST', '/api/chat', { agentId: 'atlas', workspaceId: t.workspaceId, stream: false, messages: [{ from: 'me', text: said }], ...extra });
  const results = t.model.recent().filter((r) => JSON.stringify(r.messages).includes(JSON.stringify(said).slice(1, -1)))
    .flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => String(m.content || '')));
  return { results, raw: res.text, status: res.status };
}

/** The board's copy of the chat's live preview window, as `page` holds it, or null. */
const previewOf = (page, chatId) => page.evaluate((id) => window.__e2eStore.getState().wins
  .find((w) => w.kind === 'htmlPreview' && w.chatId === id) || null, chatId);

async function reload(t) {
  await Promise.all([t.pat, t.sam].map((p) => openBoard(p.page, t.workspaceId, t.web)));
  for (const p of [t.pat, t.sam]) await homeView(p.page);
}

/** Clicks a file in Pat's Files tree; returns the window it opened, moved to `at`. */
async function openFromTree(page, filesId, name, kind, at) {
  await windowFrame(page, filesId).getByText(name, { exact: false }).first().click({ timeout: 5_000 });
  await page.waitForFunction(([k, n]) => window.__e2eStore.getState().wins
    .some((w) => w.kind === k && String(w.filePath || '').endsWith(n)), [kind, name], { timeout: 10_000 });
  const id = await winOf(page, kind, name);
  await updateWindow(page, id, { ...at, w: 460, h: 330, width: 460, height: 330 });
  await homeView(page);
  return id;
}

/** Types `line` at the end of the Document and presses Save; true once the file on disk has it. */
async function addLineAndSave(page, id, line, file) {
  const frame = windowFrame(page, id);
  const box = frame.locator('textarea').first();
  if (!(await box.count())) await frame.locator('[data-doc-body]').first().click();
  await box.click({ timeout: 5_000 });
  await page.keyboard.press('Control+End');
  await page.keyboard.type(`\n${line}`, { delay: 10 });
  await frame.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 5_000 });
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    if (fs.readFileSync(file, 'utf8').includes(line)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** Problems with Pat's window for a file only the owner opens: no line saying it stays on Pat's screen, or a Preview button. */
async function ownerNoteProblems(page, id, what) {
  const frame = windowFrame(page, id);
  const note = await frame.getByTestId('off-board-note').textContent({ timeout: 5_000 }).catch(() => '');
  const problems = [];
  if (!note.includes(OFF_BOARD_NOTE)) problems.push(`Pat's ${what} does not say its words stay on Pat's screen`);
  if (await frame.getByRole('button', { name: 'Preview', exact: true }).count()) problems.push(`Pat's ${what} offers Preview, which would copy the words onto the board`);
  return problems;
}

const fail = (problems, done) => {
  if (problems.length) throw new Error(problems.join('; '));
  return done;
};

export default {
  id: 'secretFiles',
  label: "A project's files that hold keys open only for this computer's owner",
  async run(t) {
    const { pat, sam, check } = t;
    const putBackOpenProjects = keepOpenProjects();
    const { dir, elsewhere, at } = makeProject();
    const logStart = t.serverLog().length;
    // The made-up key, and the made-up folders typed into Files and asked for:
    // the harness checks the logs never hold them.
    t.typed.push(KEY, path.basename(dir), path.basename(elsewhere));
    const get = (who, url) => t.api(who, 'GET', url);
    const read = (who, file) => get(who, `/api/files/content?path=${encodeURIComponent(file)}`);
    let filesId = null;
    let envId = null;
    let keyId = null;
    let projectId = null;

    try {
      await check('walk', 'Pat opens the made-up project in Files: it lists the ordinary files and none of the hidden ones (.env, .git)', async ({ shot }) => {
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        filesId = files.id;
        await updateWindow(pat.page, filesId, { x: 16, y: 64, w: 460, h: 400, width: 460, height: 400 });
        await homeView(pat.page);
        const frame = windowFrame(pat.page, filesId);
        const pathBox = frame.locator('input[type="text"]').first();
        await pathBox.fill(dir);
        await pathBox.press('Enter');
        const listed = await frame.getByText(ENV).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
        await shot(pat.page, 'files-lists-the-made-up-project');
        const shown = await frame.innerText();
        const problems = [];
        if (!listed) problems.push(`Files does not list ${ENV}`);
        for (const name of [NOTE, KEY_FILE, LINK]) if (!shown.includes(name)) problems.push(`Files does not list ${name}`);
        for (const name of ['.env.example', '.git']) if (shown.includes(name)) problems.push(`Files lists the hidden ${name}`);
        return fail(problems, `Files lists ${NOTE}, ${ENV}, ${KEY_FILE} and ${LINK}, and no hidden file`);
      });

      await check('walk', `Pat opens ${ENV} from Files: Pat's Code editor shows its made-up key, and on Sam's screen the same window says only this computer's owner opens it, with no key and no "Try again"`, async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the step before');
        envId = await openFromTree(pat.page, filesId, ENV, 'code_editor', { x: 492, y: 64 });
        const patSees = await waitForText(pat.page, envId, `${KEY}-env`);
        const { says, problems } = await samProblems(sam.page, envId, 'Code editor', OWNER_ONLY);
        problems.push(...await ownerNoteProblems(pat.page, envId, 'Code editor'));
        if (await windowFrame(sam.page, envId).getByTestId('off-board-note').count()) problems.push("Sam's window shows the owner's line");
        const leaked = await keyReachesSam(t);
        await sideBySide(t, 'pat-sees-the-key-sam-sees-plain-words', shot);
        if (!patSees) problems.unshift("Pat's Code editor does not show the file's made-up key");
        if (leaked.length) problems.push(`the made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `Pat sees the made-up key; Sam's window says "${says}", and no key is on Sam's screen or board`);
      });

      await check('walk', `Pat opens ${KEY_FILE} as a Document, adds a line and saves: the file has it, and neither the key nor Pat's line reaches Sam, whose window says only the owner opens it`, async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        keyId = await openFromTree(pat.page, filesId, KEY_FILE, 'doc', { x: 968, y: 64 });
        const problems = [];
        if (!(await waitForText(pat.page, keyId, `${KEY}-pem`))) problems.push("Pat's Document does not show the made-up key");
        else if (!(await addLineAndSave(pat.page, keyId, PAT_LINE, at(KEY_FILE)))) problems.push("Pat's Save did not put the line in the file");
        problems.push(...await ownerNoteProblems(pat.page, keyId, 'Document'));
        const sam1 = await samProblems(sam.page, keyId, 'Document', OWNER_ONLY);
        problems.push(...sam1.problems);
        const leaked = await keyReachesSam(t);
        await sideBySide(t, 'pat-types-in-the-key-file-sam-sees-plain-words', shot);
        if (leaked.length) problems.push(`the made-up key or Pat's line reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `Pat's line is saved in the file; Sam's window says "${sam1.says}", and nothing of it reached Sam`);
      });

      await check('walk', "after a reload Pat's windows still show the made-up keys, and Sam's still say only the owner opens them, with no key anywhere for Sam", async ({ shot }) => {
        if (!envId || !keyId) throw new Error('the windows did not open in the steps before');
        await reload(t);
        const problems = [];
        if (!(await waitForText(pat.page, envId, `${KEY}-env`))) problems.push("Pat's Code editor lost the made-up key");
        if (!(await waitForText(pat.page, keyId, PAT_LINE))) problems.push("Pat's Document does not show the saved line");
        for (const [id, what] of [[envId, 'Code editor'], [keyId, 'Document']]) problems.push(...(await samProblems(sam.page, id, what, OWNER_ONLY)).problems);
        const leaked = await keyReachesSam(t, 3_000);
        await sideBySide(t, 'after-a-reload', shot);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, 'after a reload Pat sees both files and Sam sees the plain words in both windows, with no key');
      });

      await check('walk', "a link in the project that leads out of it opens for Pat, and is outside the project on Sam's screen", async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const id = await openFromTree(pat.page, filesId, OUT_LINK, 'doc', { x: 492, y: 410 });
        const problems = [];
        if (!(await waitForText(pat.page, id, `${KEY}-outside`))) problems.push("Pat's Document does not show the words the link leads to");
        const sam1 = await samProblems(sam.page, id, 'Document', OUTSIDE);
        problems.push(...sam1.problems.filter((p) => !p.includes('Try again')));
        const leaked = await keyReachesSam(t, 3_000);
        await sideBySide(t, 'a-link-out-of-the-project', shot);
        if (leaked.length) problems.push(`the words outside the project reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `Pat reads it; Sam's window says "${sam1.says}"`);
      });

      await check('hunt', 'the made-up .env.example and an ordinary note still open for Sam with their words: only files that hold keys are kept for the owner', async ({ shot }) => {
        const exampleId = await spawnWindow(sam.page, 'code_editor', { title: '.env.example', fileName: '.env.example', filePath: at('.env.example'), language: 'text' }, { x: 968, y: 410 }, { w: 420, h: 220 });
        const noteId = await spawnWindow(sam.page, 'doc', { title: NOTE, fileName: NOTE, filePath: at(NOTE) }, { x: 968, y: 640 }, { w: 420, h: 200 });
        const problems = [];
        if (!(await waitForText(sam.page, exampleId, 'MADE_UP_KEY='))) problems.push("Sam's .env.example does not show its words");
        if (!(await waitForText(sam.page, noteId, NOTE_TEXT))) problems.push("Sam's note does not show its words");
        await shot(sam.page, 'sam-opens-the-example-and-the-note');
        return fail(problems, 'both open for Sam with their made-up words');
      });

      await check('hunt', `key files a cloud service, a framework and Terraform name (${SERVICE_KEY} opened from Files, ${MORE_KEYS.map(([, name]) => name).join(', ')}) show Pat their words and Sam the plain words, while the look-alikes ${LOOK_ALIKE[1]} and ${TERRAFORM_LOOK_ALIKE[1]} open for Sam`, async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const opened = [[await openFromTree(pat.page, filesId, SERVICE_KEY, 'code_editor', { x: 16, y: 1400 }), SERVICE_KEY, 'service']];
        for (const [index, [folder, name, kind]] of MORE_KEYS.entries()) {
          const where = { x: 492, y: 1400 + index * 180 };
          opened.push([await spawnWindow(pat.page, 'code_editor', { title: name, fileName: name, filePath: at(folder, name), language: 'text' }, where, { w: 460, h: 160 }), name, kind]);
        }
        const exampleId = await spawnWindow(sam.page, 'code_editor', { title: LOOK_ALIKE[1], fileName: LOOK_ALIKE[1], filePath: at(...LOOK_ALIKE), language: 'json' }, { x: 968, y: 1400 }, { w: 420, h: 200 });
        const terraformExampleId = await spawnWindow(sam.page, 'code_editor', { title: TERRAFORM_LOOK_ALIKE[1], fileName: TERRAFORM_LOOK_ALIKE[1], filePath: at(...TERRAFORM_LOOK_ALIKE), language: 'text' }, { x: 968, y: 1620 }, { w: 420, h: 200 });
        const problems = [];
        for (const [id, name, kind] of opened) {
          if (!(await waitForText(pat.page, id, `${KEY}-${kind}`))) problems.push(`Pat's ${name} window does not show its made-up key`);
          problems.push(...(await samProblems(sam.page, id, `${name} window`, OWNER_ONLY)).problems);
        }
        if (!(await waitForText(sam.page, exampleId, '"made_up_key":""'))) problems.push(`Sam's ${LOOK_ALIKE[1]} does not show its words`);
        if (!(await waitForText(sam.page, terraformExampleId, 'made_up_password = ""'))) problems.push(`Sam's ${TERRAFORM_LOOK_ALIKE[1]} does not show its words`);
        const leaked = await keyReachesSam(t);
        await lookAt(t, 0, 1380);
        await sideBySide(t, 'key-files-a-service-names', shot);
        await homeView(pat.page);
        await homeView(sam.page);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `Pat reads all ${opened.length}; Sam's windows say "${OWNER_ONLY}", ${LOOK_ALIKE[1]} and ${TERRAFORM_LOOK_ALIKE[1]} open for Sam, and no key reached Sam`);
      });

      await check('hunt', `a .env asked for through a link (${LINK}), and a file in the hidden .git folder opened by its path the way an agent opens one, show Pat their words and Sam the plain words`, async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const linkId = await openFromTree(pat.page, filesId, LINK, 'doc', { x: 16, y: 480 });
        const gitId = await spawnWindow(pat.page, 'code_editor', { title: 'config', fileName: 'config', filePath: at('.git', 'config'), language: 'text' }, { x: 16, y: 840 }, { w: 460, h: 200 });
        const problems = [];
        if (!(await waitForText(pat.page, linkId, `${KEY}-dotenv`))) problems.push("Pat's link window does not show the .env's made-up key");
        if (!(await waitForText(pat.page, gitId, `${KEY}-token`))) problems.push("Pat's .git/config window does not show its made-up token");
        for (const [id, what] of [[linkId, 'link window'], [gitId, '.git/config window']]) problems.push(...(await samProblems(sam.page, id, what, OWNER_ONLY)).problems);
        const leaked = await keyReachesSam(t);
        await sideBySide(t, 'a-link-to-the-env-and-the-git-folder', shot);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, 'Pat reads both; Sam sees the plain words in both, and no key');
      });

      await check('hunt', "Pat formats a made-up settings file in a hidden folder: it is formatted on Pat's screen, and none of it reaches Sam", async ({ shot }) => {
        // Over Sam's .env.example, done with: lower down the board's own buttons sit over its Format button.
        const id = await spawnWindow(pat.page, 'code_editor', { title: 'settings.json', fileName: 'settings.json', filePath: at(...HIDDEN_SETTINGS), language: 'json' }, { x: 968, y: 410 }, { w: 460, h: 220 });
        const problems = [];
        if (!(await waitForText(pat.page, id, `${KEY}-json`))) problems.push("Pat's window does not show the settings file");
        else {
          await windowFrame(pat.page, id).getByRole('button', { name: 'Format', exact: true }).click({ timeout: 5_000 });
          if (!(await waitForText(pat.page, id, `"madeUp": "${KEY}-json"`))) problems.push("Pat's Format did not format the file");
        }
        problems.push(...(await samProblems(sam.page, id, 'settings window', OWNER_ONLY)).problems);
        const leaked = await keyReachesSam(t);
        await sideBySide(t, 'pat-formats-a-hidden-settings-file', shot);
        if (leaked.length) problems.push(`the made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, "Pat sees it formatted; Sam's window says only the owner opens it, and no key reached Sam");
      });

      await check('hunt', "Pat opens a made-up plan in a hidden folder as Step cards: Pat's window says why it makes no cards, and nothing of it reaches the board; an ordinary plan still turns into cards Sam sees", async ({ shot }) => {
        const hiddenId = await spawnWindow(pat.page, 'stepCards', { title: 'steps.todo', fileName: 'steps.todo', filePath: at(...HIDDEN_PLAN) }, { x: 16, y: 1080 }, { w: 460, h: 300 });
        const plainId = await spawnWindow(pat.page, 'stepCards', { title: PLAN, fileName: PLAN, filePath: at(PLAN) }, { x: 492, y: 1080 }, { w: 460, h: 300 });
        const problems = [];
        const says = (await windowFrame(pat.page, hiddenId).locator('.hb-sc-alert').textContent({ timeout: 15_000 }).catch(() => '')).trim();
        if (says !== STEPS_OFF_BOARD) problems.push(`Pat's Step cards for the hidden plan say ${says ? `"${says}"` : 'nothing'}, not why they make no cards`);
        const until = Date.now() + 15_000;
        let samCards = [];
        while (Date.now() < until && !samCards.length) {
          samCards = (await readWindow(sam.page, plainId))?.cards || [];
          if (!samCards.length) await sam.page.waitForTimeout(300);
        }
        if (!samCards.some((c) => String(c.title).includes('Made-up card for everyone'))) problems.push("the ordinary plan's card did not reach Sam's Step cards");
        for (const [who, page] of [['Pat', pat.page], ['Sam', sam.page]]) {
          if (((await readWindow(page, hiddenId))?.cards || []).length) problems.push(`${who}'s copy of the board holds cards from the hidden plan`);
          const board = await page.evaluate(() => JSON.stringify(window.__e2eStore.getState().wins));
          if (board.includes(`${KEY}-todo`)) problems.push(`${who}'s copy of the board holds the hidden plan's made-up key`);
        }
        const leaked = await keyReachesSam(t, 3_000);
        await lookAt(t, 0, 1060);
        await sideBySide(t, 'a-plan-in-a-hidden-folder-makes-no-cards', shot);
        await homeView(pat.page);
        await homeView(sam.page);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `Pat's window says "${says}" and makes no cards; the ordinary plan's card is on Sam's screen; no key on the board`);
      });

      await check('redteam', "Sam's own requests for each made-up file that holds keys, a copy and a backup of one too, get one plain answer whether or not the file is there, never its words; Pat's open", async () => {
        const problems = [];
        let first = null;
        const there = [ENV, '.env', KEY_FILE, path.join('.git', 'config'), LINK, ...BACKUPS, SERVICE_KEY, ...MORE_KEYS.map(([folder, name]) => path.join(folder, name))];
        const notThere = ['.env.local', 'made-up-not-there.pem', path.join('.git', 'made-up-not-there'), path.join('config', 'secrets.yaml')];
        for (const name of [...there, ...notThere]) {
          const res = await read(sam, at(name));
          first ||= res.text;
          if (res.status !== 403 || res.body?.reason !== 'ownerOnly') problems.push(`Sam asking for ${name} got ${res.status} ${res.body?.reason || 'with no reason'}`);
          if (res.text.includes(KEY)) problems.push(`Sam asking for ${name} got its made-up key`);
          else if (res.text !== first) problems.push(`Sam's answer for ${name} differs, so it tells which file is there`);
        }
        for (const name of there) {
          const res = await read(pat, at(name));
          if (res.status !== 200 || !String(res.body?.content).includes(KEY)) problems.push(`Pat asking for ${name} got ${res.status}`);
        }
        return fail(problems, `Sam gets 403 with "${OWNER_ONLY}" for all ${there.length + notThere.length}, there or not; Pat opens the ${there.length} that are there`);
      });

      await check('redteam', 'a link out of the project, and the folder it leads to, are outside it for Sam, there or not, pictures too; Pat opens them', async () => {
        const problems = [];
        const asked = [at(OUT_LINK), at(OUT_FOLDER, 'outside-note.md'), at(OUT_FOLDER, 'made-up-not-there.md')];
        for (const file of asked) {
          const res = await read(sam, file);
          if (res.status !== 403 || res.body?.reason !== 'outside' || res.text.includes(KEY)) problems.push(`Sam asking for ${path.relative(dir, file)} got ${res.status} ${res.body?.reason || ''}`.trim());
        }
        for (const file of asked.slice(0, 2)) {
          const res = await read(pat, file);
          if (res.status !== 200 || !String(res.body?.content).includes(KEY)) problems.push(`Pat asking for ${path.relative(dir, file)} got ${res.status}`);
        }
        const picture = `/api/files/image?path=${encodeURIComponent(at(OUT_FOLDER, 'picture.png'))}`;
        const samPicture = await get(sam, picture);
        const patPicture = await get(pat, picture);
        if (samPicture.status !== 403) problems.push(`Sam asking for a picture through the link got ${samPicture.status}`);
        if (patPicture.status !== 200) problems.push(`Pat asking for a picture through the link got ${patPicture.status}`);
        return fail(problems, 'Sam gets 403 "outside" for all three and the picture; Pat opens the two that are there and the picture');
      });

      await check('redteam', 'Sam cannot list the hidden .git folder or the linked-out folder, or search in it; Pat can, and no one is shown a hidden file in a listing', async () => {
        const browse = (who, folder) => get(who, `/api/files/browse?path=${encodeURIComponent(folder)}`);
        const problems = [];
        const git = await browse(sam, at('.git'));
        if (git.status !== 403 || git.text.includes('config')) problems.push(`Sam listing .git got ${git.status}${git.text.includes('config') ? ' and its files' : ''}`);
        const out = await browse(sam, at(OUT_FOLDER));
        if (out.status !== 403 || out.text.includes('outside-note')) problems.push(`Sam listing the linked-out folder got ${out.status}`);
        const search = await get(sam, `/api/files/search?q=outside&path=${encodeURIComponent(at(OUT_FOLDER))}`);
        if (search.status !== 403 || search.text.includes('outside-note')) problems.push(`Sam searching the linked-out folder got ${search.status}`);
        const patOut = await browse(pat, at(OUT_FOLDER));
        if (!(patOut.body?.children || []).some((c) => c.name === 'outside-note.md')) problems.push(`Pat listing the linked-out folder got ${patOut.status} without its note`);
        for (const who of [pat, sam]) {
          const names = ((await browse(who, dir)).body?.children || []).map((c) => c.name);
          if (names.some((n) => n.startsWith('.'))) problems.push(`${who.who.name}'s listing of the project shows a hidden file`);
        }
        return fail(problems, 'Sam gets 403 for both folders and the search; Pat lists the linked-out folder; no listing shows a hidden file');
      });

      await check('redteam', "Step cards never read a key file's words, for anyone, and read a file in a hidden folder only for Pat", async () => {
        const checks = [
          { id: 'env', kind: 'file', path: ENV, says: 'MADE_UP_KEY' },
          { id: 'git', kind: 'file', path: '.git/config', says: 'url' },
          { id: 'note', kind: 'file', path: NOTE, says: 'Made-up note' },
        ];
        const ask = async (who) => {
          const res = await t.api(who, 'POST', '/api/step-cards/check', { folder: dir, step: { title: 'Made-up step' }, checks });
          return Object.fromEntries((res.body?.results || []).map((r) => [r.id, r]));
        };
        const [asSam, asPat] = [await ask(sam), await ask(pat)];
        const problems = [];
        if (asSam.env?.ok !== null || asPat.env?.ok !== null) problems.push(`the key file check came back ${asSam.env?.ok} for Sam and ${asPat.env?.ok} for Pat, not unread for both`);
        if (asSam.git?.ok !== null) problems.push(`the .git/config check came back ${asSam.git?.ok} for Sam, not unread`);
        if (asPat.git?.ok !== true) problems.push(`the .git/config check came back ${asPat.git?.ok} for Pat, not read`);
        if (asSam.note?.ok !== true || asPat.note?.ok !== true) problems.push('the ordinary note check did not pass for both');
        return fail(problems, `the key file is unread for both ("${asSam.env?.line}"), .git/config is read for Pat only ("${asSam.git?.line}" for Sam), the note passes for both`);
      });

      await check('redteam', "an agent given the made-up project reads Sam its ordinary note, but for the .env, the key file, .git/config and the link to the .env gives Sam plain words, never a key; for Pat it reads the .env", async () => {
        const opened = await t.api(pat, 'POST', '/api/projects/open', { path: dir });
        const project = opened.body?.project;
        if (!project?.id) throw new Error(`Pat could not open the made-up project for agents (${opened.status})`);
        // As when Pat wires Atlas to the project's window on the board.
        const given = await t.api(pat, 'PUT', `/api/workspaces/${encodeURIComponent(t.workspaceId)}/agent-projects/${encodeURIComponent(project.id)}`, { memberships: [{ agentId: 'atlas', permission: 'read' }], sourceId: 'made-up-board' });
        if (given.status !== 200) throw new Error(`Atlas could not be given the made-up project (${given.status})`);
        projectId = project.id;
        const askAgent = (who, rel) => askAtlas(t, who, fileAsk(project.id, rel));
        const problems = [];
        const said = (results) => (results.length ? `"${results.at(-1).slice(0, 90)}"` : 'no answer from its file tool');
        for (const rel of [ENV, KEY_FILE, path.join('.git', 'config'), LINK]) {
          const { results, raw } = await askAgent(sam, rel);
          if (raw.includes(KEY) || results.some((r) => r.includes(KEY))) problems.push(`Sam's agent got a made-up key from ${rel}`);
          else if (!results.some((r) => r.includes(OWNER_ONLY))) problems.push(`Sam's agent reading ${rel} got ${said(results)}, not "${OWNER_ONLY}"`);
        }
        const note = await askAgent(sam, NOTE);
        if (!note.results.some((r) => r.includes(NOTE_TEXT))) problems.push(`Sam's agent reading ${NOTE} got ${said(note.results)}`);
        const pats = await askAgent(pat, ENV);
        if (!pats.results.some((r) => r.includes(`${KEY}-env`))) problems.push(`Pat's agent reading ${ENV} got ${said(pats.results)}`);
        return fail(problems, `Sam's agent reads ${NOTE} and gets "${OWNER_ONLY}" for the other four, with no key; Pat's agent reads ${ENV}`);
      });

      await check('redteam', "off a board (a chat sent with no board, as Sam's own browser can send one), the same agent gives Sam plain words for the ordinary note, asked by the project's id or by its folder, never its words; for Pat it reads the note", async () => {
        if (!projectId) throw new Error('the made-up project did not open for agents in the step before');
        const problems = [];
        const said = (results) => (results.length ? `"${results.at(-1).slice(0, 90)}"` : 'no answer from its file tool');
        // Leaving the board out of the request, as a chat sent from outside one does.
        const offBoard = (who, project) => askAtlas(t, who, fileAsk(project, NOTE), { workspaceId: undefined });
        for (const [how, project] of [["the project's id", projectId], ['its folder', dir]]) {
          const { results, raw } = await offBoard(sam, project);
          if (raw.includes(NOTE_TEXT) || results.some((r) => r.includes(NOTE_TEXT))) problems.push(`Sam's agent got the note asked by ${how}`);
          else if (!results.some((r) => r.includes(PROJECT_OFF_BOARD))) problems.push(`Sam's agent asked by ${how} got ${said(results)}`);
        }
        const pats = await offBoard(pat, projectId);
        if (!pats.results.some((r) => r.includes(NOTE_TEXT))) problems.push(`Pat's agent got ${said(pats.results)}`);
        return fail(problems, `Sam's agent gets "${PROJECT_OFF_BOARD}" both ways, with no words of the note; Pat's agent reads ${NOTE}`);
      });

      await check('redteam', "the live preview beside a chat gives plain words for the link to the .env and a page in a hidden folder, whoever's agent asks; an ordinary page shows without what it would pull in from the .env or the hidden folder", async ({ shot }) => {
        if (!projectId) throw new Error('the made-up project was not given to Atlas in the step before');
        const chatId = await spawnWindow(pat.page, 'chat', { agentId: 'atlas' }, { x: 968, y: 1080 }, { w: 400, h: 420 });
        // The server puts the preview beside the chat once it has the chat window, which reaches it as it reaches Sam.
        await sam.page.waitForFunction((id) => window.__e2eStore.getState().wins.some((w) => w.id === id), chatId, { timeout: 15_000 });
        const show = (who, rel) => askAtlas(t, who, fileAsk(projectId, rel, 'project_window'), { windowId: chatId });
        const problems = [];
        const said = (results) => (results.length ? `"${results.at(-1).slice(0, 90)}"` : 'no answer from the preview tool');
        for (const [who, name, rel] of [[sam, 'Sam', LINK], [sam, 'Sam', path.join(...HIDDEN_PAGE)], [pat, 'Pat', LINK], [pat, 'Pat', path.join(...HIDDEN_PAGE)]]) {
          const { results, raw } = await show(who, rel);
          if (raw.includes(KEY) || results.some((r) => r.includes(KEY))) problems.push(`${name}'s agent got a made-up key showing ${rel}`);
          else if (!results.some((r) => r.includes(PREVIEW_OFF_BOARD))) problems.push(`${name}'s agent showing ${rel} got ${said(results)}, not "${PREVIEW_OFF_BOARD}"`);
        }
        if (await previewOf(sam.page, chatId)) problems.push('a preview window opened for a file only Pat opens');
        const page = await show(sam, PAGE);
        if (!page.results.some((r) => r.startsWith('Opened the live preview'))) problems.push(`Sam's agent showing ${PAGE} got ${said(page.results)}`);
        const until = Date.now() + 10_000;
        let preview = null;
        while (Date.now() < until && !preview) {
          preview = await previewOf(sam.page, chatId);
          if (!preview) await sam.page.waitForTimeout(300);
        }
        if (!String(preview?.html || '').includes(PAGE_TEXT)) problems.push(`the preview on Sam's screen does not show ${PAGE}`);
        const board = await pat.page.evaluate(() => JSON.stringify(window.__e2eStore.getState().wins));
        if (board.includes(KEY)) problems.push(`Pat's copy of the board holds a made-up key (${keysIn(board)})`);
        const leaked = await keyReachesSam(t, 3_000);
        await lookAt(t, 944, 1060);
        await sideBySide(t, 'the-live-preview-shows-no-file-only-pat-opens', shot);
        await homeView(pat.page);
        await homeView(sam.page);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `both agents get "${PREVIEW_OFF_BOARD.slice(0, 60)}…" for the link to the .env and the hidden page; ${PAGE} shows for Sam with no key in it`);
      });

      await check('redteam', "a link in the project to the server's own settings (/proc/self/environ) opens for no one", async () => {
        if (process.platform !== 'linux') return 'not tried: this computer has no /proc';
        const problems = [];
        for (const who of [pat, sam]) {
          const res = await read(who, at(SETTINGS_LINK));
          if (res.status !== 403 || res.body?.reason !== 'secret' || /PATH=|NODE_ENV=/.test(res.text)) problems.push(`${who.who.name} got ${res.status} ${res.body?.reason || ''}`.trim());
        }
        return fail(problems, `403 with "${FILE_PROBLEMS.secret}" for Pat and Sam`);
      });

      await check('redteam', "the refusals are logged without a file's name, its path or its words, and no made-up key is in the log", async () => {
        const added = t.serverLog().slice(logStart);
        const refusals = added.split('\n').filter((line) => line.includes('not the owner'));
        const problems = [];
        if (!refusals.length) problems.push('the server log has no line for the refusals at all');
        for (const [what, words] of [['the project folder', dir], ['the folder outside it', elsewhere], ['a file name', ENV], ['a file name', KEY_FILE], ['a file name', 'outside-note'], ['a folder name', OUT_FOLDER],
          ['a file name', SERVICE_KEY], ...MORE_KEYS.map(([, name]) => ['a file name', name])]) {
          if (refusals.some((line) => line.includes(words) || line.includes(encodeURIComponent(words)))) problems.push(`a refusal line names ${what}`);
        }
        if (added.includes(KEY)) problems.push('a made-up key is in the server log');
        return fail(problems, `${refusals.length} refusal lines (for example "${refusals[0]?.replace(/^\S+\s+/, '').slice(0, 90)}"), none naming a file, a folder or a key`);
      });

      // A project's id is made from its folder's name, lower case (shared-<name>),
      // so the log is searched in any case.
      await check('redteam', "the request log keeps Pat's project save with its method, route and status, and never the made-up project's name in any case", async () => {
        const lines = t.serverLog().slice(logStart).split('\n');
        const name = path.basename(dir).toLowerCase();
        const saves = lines.filter((line) => /PUT \/api\/workspaces\/[^/\s]+\/agent-projects\/\S+ 200 \d+ms/.test(line));
        const named = lines.filter((line) => line.toLowerCase().includes(name));
        const problems = [];
        if (!saves.length) problems.push('the request log has no line for the project save');
        if (named.length) problems.push(`${named.length} log line(s) carry the made-up project's name, for example "${named[0].replace(/^\S+\s+/, '').slice(0, 120)}"`);
        return fail(problems, `the save is logged as "${saves[0]?.replace(/^.*?(PUT )/, '$1').slice(0, 100)}", and no line carries the project's name`);
      });
    } finally {
      putBackOpenProjects();
      for (const folder of [dir, elsewhere]) fs.rmSync(folder, { recursive: true, force: true });
    }
  },
};
