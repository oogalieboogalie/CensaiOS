// A coding agent never shows a teammate a key it read in a file only this
// computer's owner opens. Pat Example (the owner) opens a made-up shop
// project in Files and starts a task in the Agent Console with the stand-in
// Claude Code (tests/fixtures/cli-agents/standin-agent.mjs, run from a
// made-up script): it reads .env, says the made-up key, writes it into
// config.js and prints that, searches a production .env it never opens, adds
// a remote with a made-up token, and prints a key file it names in quotes
// (`cat "certs/server (1).pem"`). Pat allows each step. Sam Example's
// screen shows the same task with [hidden] in place of each key and a note
// saying why: in what the agent said, its steps, its summary and the Changes
// tab; the quoted key file's step shows Sam only its title, with a note
// saying why, and Pat what it printed (backlog 222). Both screens show the
// settings MADE_UP_KEY and NEXT_PUBLIC_SITE_NAME whole in what the agent
// said, with its _made-up_ in italics. Pat opens
// config.js in the Code Editor from the console: the window on the shared
// board, on both screens and as the server keeps the board, holds [hidden] in
// place of the key, with a note saying why, while Pat's console still shows
// the key (backlog 216). Pat hands the
// changes to Codex (the same stand-in) for a review, which prints config.js
// and repeats the key: Sam sees [hidden] there too, and the console the
// hand-off opened names the same project as the first one (backlog 217). Red team:
// Sam asks the server for both tasks, the task list, the requests, the
// changes, config.js and the Inbox, and no answer holds a made-up key; Pat's
// answer holds them, except config.js asked for the board. All files, keys
// and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

const KEY = 'made-up-key-0123456789';
const OTHER = 'made-up-production-4242';
const TOKEN = 'made-up-token-777';
const PEM = 'made-up-pem-5150';
const SECRETS = [KEY, OTHER, TOKEN, PEM];
// A key file the agent names in quotes, its name split by a space and brackets (backlog 222).
const PEM_FILE = 'certs/server (1).pem';
const PEM_TITLE = 'Show the made-up certificate copy';
const HIDDEN = '[hidden]';
const ASK = 'Put the made-up key in config.js';
// The agent's last words name two settings with _ in them and slant one word,
// as `_made-up_` (backlog 215); on screen they read as SAID with "made-up" slanted.
const SETTINGS = 'MADE_UP_KEY and NEXT_PUBLIC_SITE_NAME stay as they were';
const SAID = `${SETTINGS} in the made-up shop.`;
const STEPS = [
  { read: '.env' },
  { say: `The made-up key in .env is ${KEY}. I will put it in config.js.` },
  { write: 'config.js', content: `export const madeUpKey = '${KEY}';\n` },
  { bash: 'cat config.js', description: 'Show config.js' },
  { bash: 'grep -rn MADE_UP_PRODUCTION .', description: 'Find the production setting' },
  { say: `The production one is ${OTHER}.` },
  { bash: `git remote add made-up https://made-up-user:${TOKEN}@example.invalid/made-up.git && git remote -v`, description: 'Add the made-up remote' },
  { bash: `cat "${PEM_FILE}"`, description: PEM_TITLE },
  { say: `Done: config.js holds ${KEY}, and the remote uses ${TOKEN}. ${SETTINGS} in the _made-up_ shop.` },
];
// Handed off for a review, the stand-in prints config.js from the changes it was given and talks about it.
const REVIEW = [
  { bash: 'cat config.js', description: 'Look at config.js' },
  { say: `config.js sets madeUpKey to ${KEY}, which looks right.` },
];

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

/** A made-up shop repo with a .env, a production .env and a copy of a key file, committed so the agent's worktree has them. */
function madeUpShop() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-shop-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'pat@example.invalid');
  git('config', 'user.name', 'Pat Example');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Made-up shop\n');
  fs.writeFileSync(path.join(dir, '.env'), `MADE_UP_KEY=${KEY}\nNEXT_PUBLIC_SITE_NAME=Made-up Shop\nPORT=3001\n`);
  fs.writeFileSync(path.join(dir, '.env.production'), `MADE_UP_PRODUCTION_KEY=${OTHER}\n`);
  fs.mkdirSync(path.join(dir, path.dirname(PEM_FILE)));
  fs.writeFileSync(path.join(dir, PEM_FILE), `made-up certificate copy\nMADE_UP_PEM_PASSWORD=${PEM}\n`);
  git('add', '.');
  git('commit', '-qm', 'made-up start');
  return dir;
}

async function waitFor(ok, page, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    if (await ok()) return true;
    if (Date.now() > until) return false;
    await page.waitForTimeout(250);
  }
}

const textOf = (page, id) => windowFrame(page, id).innerText().catch(() => '');
const named = (text) => SECRETS.filter((word) => text.includes(word));
const panOf = (page) => page.evaluate(() => ({ ...window.__e2eStore.getState().pan }));
/** The Agent Console the hand-off opened on the board (its window and task), or null. */
const reviewConsole = (page, first) => page.waitForFunction((id) => {
  const win = window.__e2eStore.getState().wins.find((w) => w.kind === 'agentConsole' && w.taskId && w.taskId !== id);
  return win ? { id: win.id, taskId: win.taskId } : null;
}, first, { timeout: 15_000 }).then((found) => found.jsonValue()).catch(() => null);
const lookAt = (page, pan) => page.evaluate((p) => window.__e2eStore.getState().setPan(p), pan);

/** The window `id` as the server keeps the board now (its newest point in history), as `who` asks; null if it has none. */
async function savedWindow(t, who, id) {
  const list = await t.api(who, 'GET', `/api/workspaces/${t.workspaceId}/history`);
  if (list.status !== 200 || !list.body?.latestSeq) return null;
  const at = await t.api(who, 'GET', `/api/workspaces/${t.workspaceId}/history/${list.body.latestSeq}`);
  return at.body?.board?.wins?.find((w) => w.id === id) || null;
}

/** The project a window's header names: the folder it works in and the name shown. */
async function projectNamed(page, id) {
  const chip = windowFrame(page, id).locator('.hb-win-project-chip').first();
  const path = await chip.getAttribute('data-window-project', { timeout: 5_000 }).catch(() => '');
  return { path: path || '', name: (await chip.innerText({ timeout: 5_000 }).catch(() => '')).trim() };
}

/** Closes a window with its own close button, the way a person does. */
async function closeWindow(page, id) {
  await windowFrame(page, id).locator('[data-window-control="close"]').click({ timeout: 5_000 });
  await page.waitForFunction((wid) => !window.__e2eStore.getState().wins.some((w) => w.id === wid), id, { timeout: 5_000 });
}

/** One person's window on its own, big enough to read its words, as a picture. */
async function closeUp(t, page, id, title, shot) {
  const picture = await windowFrame(page, id).screenshot({ type: 'png' });
  const view = await t.browser.newPage({ viewport: { width: 700, height: 740 } });
  await view.setContent(`<style>body{margin:0;padding:12px;background:gray}img{max-width:100%;display:block}</style>
    <img src="data:image/png;base64,${picture.toString('base64')}">`);
  await shot(view, title);
  await view.close();
}

/** Pat allows each step as the agent asks, until the task's summary shows; how many were allowed, or -1. */
async function allowUntilDone(page, id, ms = 90_000) {
  const frame = windowFrame(page, id);
  const until = Date.now() + ms;
  let allowed = 0;
  while (Date.now() < until) {
    if (await frame.getByTestId('agent-summary').count()) return allowed;
    const allow = frame.getByTestId('permission-allow').first();
    if (await allow.count() && await allow.isEnabled().catch(() => false)) {
      await allow.click({ timeout: 5_000 }).then(() => { allowed += 1; }).catch(() => {});
      await page.waitForTimeout(500);
    } else {
      await page.waitForTimeout(300);
    }
  }
  return -1;
}

export default {
  id: 'agentHiddenWords',
  label: "A coding agent never shows a teammate a key from a file only the owner opens",
  async run(t) {
    const { pat, sam, check } = t;
    const putBackOpenProjects = keepOpenProjects();
    const dir = madeUpShop();
    const script = path.join(t.cliData, 'standin-script.json');
    fs.writeFileSync(script, JSON.stringify({ match: { review: REVIEW }, default: STEPS }));
    // Never in any log: the project's folder, the task, or a made-up key.
    t.typed.push(path.basename(dir), ASK, ...SECRETS);
    let consoleId = null;
    let taskId = null;
    let reviewTaskId = null;
    let reviewId = null;
    let home = { x: 0, y: 0 };

    try {
      await check('walk', 'Pat opens a made-up shop project in Files, starts a task in the Agent Console with the stand-in Claude Code, and allows each step', async ({ shot }) => {
        home = await panOf(pat.page);
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        await updateWindow(pat.page, files.id, { x: 700, y: 64, w: 380, h: 300, width: 380, height: 300 });
        const pathBox = windowFrame(pat.page, files.id).locator('input[type="text"]').first();
        await pathBox.fill(dir);
        await pathBox.press('Enter');
        if (!(await waitFor(async () => (await textOf(pat.page, files.id)).includes('README.md'), pat.page))) throw new Error("Pat's Files does not list the made-up shop");
        const opened = await addFromMenu(pat.page, 'Agent Console');
        if (opened.kind !== 'agentConsole') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not the Agent Console`);
        consoleId = opened.id;
        await updateWindow(pat.page, consoleId, { x: 16, y: 64, w: 660, h: 700, width: 660, height: 700 });
        const frame = windowFrame(pat.page, consoleId);
        await frame.getByTestId('pick-claudecode').click({ timeout: 10_000 });
        await frame.locator('#ac-folder').selectOption(dir, { timeout: 10_000 });
        await frame.locator('#ac-task').fill(ASK);
        await frame.getByTestId('agent-start').click();
        const allowed = await allowUntilDone(pat.page, consoleId);
        taskId = await pat.page.evaluate((id) => window.__e2eStore.getState().wins.find((w) => w.id === id)?.taskId || null, consoleId);
        await lookAt(pat.page, home);
        await pat.page.mouse.move(8, 8);
        await shot(pat.page, 'pat-sees-the-keys');
        if (allowed < 0) throw new Error("the stand-in's task did not finish on Pat's screen");
        const seen = named(await textOf(pat.page, consoleId));
        if (!seen.includes(KEY)) throw new Error("Pat's console does not show the made-up key the agent said");
        return `Pat allowed ${allowed} steps; Pat's console shows ${seen.length} of the ${SECRETS.length} made-up keys where the agent put them`;
      });

      await check('walk', "Sam's screen shows the same task with [hidden] where the agent says or prints a made-up key, and a note saying why", async ({ shot }) => {
        if (!consoleId || !taskId) throw new Error('the task did not start in the first step');
        await sam.page.waitForFunction((id) => window.__e2eStore.getState().wins.some((w) => w.id === id), consoleId, { timeout: 10_000 });
        const said = `The made-up key in .env is ${HIDDEN}. I will put it in config.js.`;
        const shows = await waitFor(async () => (await textOf(sam.page, consoleId)).includes(said), sam.page, 20_000);
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        await Promise.all([pat, sam].map((p) => p.page.mouse.move(8, 8)));
        await sideBySide(t, 'pat-sees-the-key-sam-sees-hidden', shot);
        const text = await textOf(sam.page, consoleId);
        const frame = windowFrame(sam.page, consoleId);
        const notes = await frame.getByTestId('step-hidden-words').count();
        const problems = [];
        if (!shows) problems.push(`Sam's console does not say "${said}"`);
        if (named(text).length) problems.push(`Sam's console shows ${named(text).length} made-up keys`);
        if (!text.includes(`The production one is ${HIDDEN}.`)) problems.push("Sam's console does not hide the production key the agent found by searching");
        if (notes < 3) problems.push(`Sam's console has ${notes} notes saying why a word shows as [hidden], not 3 or more`);
        if (!(await frame.getByTestId('step-owner-only').count())) problems.push("Sam's console does not say the .env read is the owner's");
        // Whether the names keep their "_" on screen is the next step's.
        if (!text.replace(/_/g, '').includes(SETTINGS.replace(/_/g, ''))) problems.push("Sam's console hides the settings' names too");
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's console shows [hidden] in place of each key, with ${notes} notes saying why, and the settings' names as they are`;
      });

      await check('walk', `The agent prints a key file it names in quotes (cat "${PEM_FILE}"): Sam's screen shows only that step's title and a note saying why, and Pat's shows what it printed`, async ({ shot }) => {
        if (!consoleId) throw new Error('the Agent Console did not open in the first step');
        const card = (page) => windowFrame(page, consoleId).locator('article.ac-step').filter({ has: page.locator('.ac-step-title', { hasText: PEM_TITLE }) }).first();
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        const seen = {};
        for (const [who, p] of [['Pat', pat], ['Sam', sam]]) {
          const step = card(p.page);
          await step.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
          // Each opens what the step printed, as a person does to read it.
          const output = step.getByRole('button', { name: /^Output/ });
          if (await output.count()) await output.click({ timeout: 5_000 }).catch(() => {});
          seen[who] = { text: await step.innerText({ timeout: 5_000 }).catch(() => ''), note: await step.getByTestId('step-owner-only').count() };
          await p.page.mouse.move(8, 8);
        }
        await sideBySide(t, 'a-key-file-named-in-quotes-shows-sam-only-its-title', shot);
        for (const [who, p] of [['Pat', pat], ['Sam', sam]]) await closeUp(t, p.page, consoleId, `${who.toLowerCase()}-sees-the-quoted-key-file-step`, shot);
        const problems = [];
        if (!seen.Pat.text.includes(PEM)) problems.push(`Pat's step "${PEM_TITLE}" does not show what it printed`);
        if (!seen.Sam.text.includes(PEM_TITLE)) problems.push(`Sam's console has no step "${PEM_TITLE}"`);
        if (seen.Sam.text.includes(PEM)) problems.push(`Sam's step "${PEM_TITLE}" shows the key file's made-up password`);
        if (seen.Sam.text.includes(PEM_FILE)) problems.push(`Sam's step "${PEM_TITLE}" shows its command`);
        if (!seen.Sam.note) problems.push(`Sam's step "${PEM_TITLE}" does not say it is the owner's`);
        if ((await textOf(sam.page, consoleId)).includes(PEM)) problems.push("Sam's console shows the key file's made-up password");
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's step "${PEM_TITLE}" shows its title and a note saying why, with no command or output; Pat's shows the made-up password it printed`;
      });

      await check('walk', 'Pat and Sam read MADE_UP_KEY and NEXT_PUBLIC_SITE_NAME whole in what the agent said, and "made-up" slanted', async ({ shot }) => {
        if (!consoleId) throw new Error('the Agent Console did not open in the first step');
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        const problems = [];
        const seen = [];
        for (const [who, p] of [['Pat', pat], ['Sam', sam]]) {
          const times = (await textOf(p.page, consoleId)).split(SAID).length - 1;
          const slanted = await windowFrame(p.page, consoleId).locator('em').allInnerTexts().catch(() => []);
          await p.page.mouse.move(8, 8);
          await closeUp(t, p.page, consoleId, `${who.toLowerCase()}-reads-the-settings-whole`, shot);
          if (!times) problems.push(`${who}'s console does not say "${SAID}"`);
          if (!slanted.includes('made-up')) problems.push(`${who}'s console does not slant "made-up" (slanted: ${slanted.map((w) => `"${w}"`).join(', ') || 'nothing'})`);
          seen.push(`${who} ${times}`);
        }
        if (problems.length) throw new Error(problems.join('; '));
        return `both consoles say "${SAID}" (${seen.join(', ')} times: the step and the summary) with "made-up" slanted`;
      });

      await check('walk', "Sam's summary and Changes tab show [hidden] in place of the key, and Pat's show the key", async ({ shot }) => {
        if (!consoleId) throw new Error('the Agent Console did not open in the first step');
        const samFrame = windowFrame(sam.page, consoleId);
        const summary = await samFrame.getByTestId('agent-summary').innerText({ timeout: 10_000 }).catch(() => '');
        const why = await samFrame.getByTestId('summary-hidden-words').count();
        await Promise.all([pat, sam].map((p) => windowFrame(p.page, consoleId).getByTestId('tab-changes').click({ timeout: 5_000 })));
        const line = `export const madeUpKey = '${HIDDEN}';`;
        const samChanges = await waitFor(async () => (await textOf(sam.page, consoleId)).includes(line), sam.page);
        const patChanges = await waitFor(async () => (await textOf(pat.page, consoleId)).includes(`export const madeUpKey = '${KEY}';`), pat.page);
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        await Promise.all([pat, sam].map((p) => p.page.mouse.move(8, 8)));
        await sideBySide(t, 'both-open-the-changes', shot);
        const problems = [];
        if (!summary.includes(HIDDEN) || named(summary).length) problems.push(`Sam's summary reads "${summary.slice(0, 120)}"`);
        if (!why) problems.push("Sam's summary does not say why a word shows as [hidden]");
        if (!samChanges) problems.push(`Sam's Changes tab does not show "${line}"`);
        if (named(await textOf(sam.page, consoleId)).length) problems.push("Sam's Changes tab shows a made-up key");
        if (!patChanges) problems.push("Pat's Changes tab does not show the made-up key in config.js");
        if (problems.length) throw new Error(problems.join('; '));
        return "Sam's summary and Changes tab show [hidden]; Pat's Changes tab shows the key";
      });

      await check('walk', "Pat opens config.js in the Code Editor from the console; the window on the shared board shows [hidden] in place of the key on both screens, and Pat's console still shows the key", async ({ shot }) => {
        if (!consoleId) throw new Error('the Agent Console did not open in the first step');
        // The Changes tab is open on both screens from the step before.
        await windowFrame(pat.page, consoleId).getByRole('button', { name: 'Open config.js in Code Editor' }).click({ timeout: 10_000 });
        const editorId = await pat.page.waitForFunction(() => window.__e2eStore.getState().wins.find((w) => w.kind === 'code_editor' && w.fileName === 'config.js')?.id || null, null, { timeout: 15_000 })
          .then((found) => found.jsonValue()).catch(() => null);
        if (!editorId) throw new Error("Open in Code Editor put no Code Editor window for config.js on Pat's board");
        await updateWindow(pat.page, editorId, { x: 700, y: 380, w: 620, h: 300, width: 620, height: 300 });
        const line = `export const madeUpKey = '${HIDDEN}';`;
        const problems = [];
        for (const [who, p] of [['Pat', pat], ['Sam', sam]]) {
          const shows = await waitFor(async () => (await textOf(p.page, editorId)).includes(line), p.page, 20_000);
          const words = await p.page.evaluate((id) => window.__e2eStore.getState().wins.find((w) => w.id === id)?.code ?? null, editorId);
          if (!shows) problems.push(`${who}'s Code Editor window does not show "${line}"`);
          if (words === null || !words.includes(line) || named(words).length) problems.push(`the window's words on ${who}'s board read "${String(words).trim().slice(0, 80)}"`);
          if (named(await textOf(p.page, editorId)).length) problems.push(`${who}'s Code Editor window shows the made-up key`);
          if (!(await windowFrame(p.page, editorId).getByTestId('code-hidden-words').count())) problems.push(`${who}'s Code Editor window does not say why a word shows as [hidden]`);
        }
        let saved = null;
        await waitFor(async () => { saved = await savedWindow(t, sam, editorId); return Boolean(saved?.code); }, sam.page, 10_000);
        if (!saved?.code?.includes(line) || named(JSON.stringify(saved)).length) problems.push(`the board as the server keeps it has the window's words as "${String(saved?.code ?? 'nothing').trim().slice(0, 80)}"`);
        const patKey = (await textOf(pat.page, consoleId)).includes(`export const madeUpKey = '${KEY}';`);
        if (!patKey) problems.push("Pat's console no longer shows the made-up key in config.js");
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        await Promise.all([pat, sam].map((p) => p.page.mouse.move(8, 8)));
        await sideBySide(t, 'the-code-editor-on-the-board-hides-the-key', shot);
        for (const [who, p] of [['Pat', pat], ['Sam', sam]]) await closeUp(t, p.page, editorId, `${who.toLowerCase()}-code-editor-window`, shot);
        // Put away, so the hand-off's console opens where it did before.
        await closeWindow(pat.page, editorId).catch(() => problems.push("Pat could not close the Code Editor window"));
        if (problems.length) throw new Error(problems.join('; '));
        return "the Code Editor window for config.js shows [hidden] in place of the key on Pat's and Sam's screens and as the server keeps the board, with a note saying why; Pat's console still shows the key";
      });

      await check('walk', "Pat hands the changes to Codex for a review; Sam's screen shows [hidden] where the review repeats the key", async ({ shot }) => {
        if (!consoleId || !taskId) throw new Error('the task did not start in the first step');
        const frame = windowFrame(pat.page, consoleId);
        await frame.getByTestId('agent-handoff-open').click({ timeout: 10_000 });
        await frame.getByTestId('agent-handoff-send').click({ timeout: 10_000 });
        const review = await reviewConsole(pat.page, taskId);
        if (!review) throw new Error("the hand-off did not open a second Agent Console on Pat's board");
        reviewTaskId = review.taskId;
        reviewId = review.id;
        await updateWindow(pat.page, review.id, { x: 700, y: 64, w: 640, h: 700, width: 640, height: 700 });
        const said = `config.js sets madeUpKey to ${HIDDEN}, which looks right.`;
        const patShows = await waitFor(async () => (await textOf(pat.page, review.id)).includes(`config.js sets madeUpKey to ${KEY}`), pat.page, 30_000);
        const samShows = await waitFor(async () => (await textOf(sam.page, review.id)).includes(said), sam.page, 20_000);
        await Promise.all([pat, sam].map((p) => lookAt(p.page, home)));
        await Promise.all([pat, sam].map((p) => p.page.mouse.move(8, 8)));
        await sideBySide(t, 'the-review-hides-the-key-from-sam', shot);
        const text = await textOf(sam.page, review.id);
        const notes = await windowFrame(sam.page, review.id).getByTestId('step-hidden-words').count();
        const problems = [];
        if (!patShows) problems.push("Pat's review console does not show the made-up key the review repeats");
        if (!samShows) problems.push(`Sam's review console does not say "${said}"`);
        if (named(text).length) problems.push(`Sam's review console shows ${named(text).length} made-up keys`);
        if (notes < 2) problems.push(`Sam's review console has ${notes} notes saying why a word shows as [hidden], not 2 or more`);
        if (problems.length) throw new Error(problems.join('; '));
        return `The review ran in Codex; Sam's review console shows [hidden] in place of the key, with ${notes} notes saying why; Pat's shows the key`;
      });

      await check('walk', 'The console the hand-off opened names the same project as the first one in its header, on both screens', async ({ shot }) => {
        if (!consoleId || !reviewId) throw new Error('the hand-off did not open a second console in the step before');
        const problems = [];
        const seen = [];
        for (const [who, p] of [['Pat', pat], ['Sam', sam]]) {
          const first = await projectNamed(p.page, consoleId);
          const second = await projectNamed(p.page, reviewId);
          if (!first.path) problems.push(`${who}'s first console names "${first.name || 'nothing'}"`);
          if (second.path !== first.path || second.name !== first.name) problems.push(`${who}'s review console names "${second.name || 'nothing'}", not "${first.name}"`);
          seen.push(`${who} "${second.name}"`);
          await p.page.mouse.move(8, 8);
          await closeUp(t, p.page, reviewId, `${who.toLowerCase()}-review-console-names-the-project`, shot);
        }
        if (problems.length) throw new Error(problems.join('; '));
        return `both consoles name the made-up shop's folder in their headers (${seen.join(', ')})`;
      });

      await check('redteam', "Sam asks the server for both tasks, the task list, the requests, the changes, config.js and the Inbox, and no answer holds a made-up key", async () => {
        if (!taskId) throw new Error('the task did not start in the first step');
        const routes = [
          '/api/cli-agents/tasks', '/api/cli-agents/permissions?status=all', '/api/inbox',
          ...[taskId, reviewTaskId].filter(Boolean).flatMap((id) => [
            `/api/cli-agents/tasks/${id}`, `/api/cli-agents/tasks/${id}/changes`, `/api/cli-agents/tasks/${id}/changes?board=1`,
            `/api/cli-agents/tasks/${id}/file?path=config.js`, `/api/cli-agents/tasks/${id}/file?path=config.js&board=1`, `/api/cli-agents/tasks/${id}/raw`,
          ]),
        ];
        const problems = [];
        for (const route of routes) {
          const res = await t.api(sam, 'GET', route);
          if (res.status !== 200) problems.push(`${route} answered ${res.status}`);
          else if (named(res.text).length) problems.push(`${route} holds ${named(res.text).length} made-up keys`);
        }
        const own = await t.api(pat, 'GET', `/api/cli-agents/tasks/${taskId}`);
        if (named(own.text).length !== SECRETS.length) problems.push(`Pat's answer holds ${named(own.text).length} of the ${SECRETS.length} made-up keys`);
        // What Open in Code Editor puts on the board is the teammate's words, also when Pat asks.
        const board = await t.api(pat, 'GET', `/api/cli-agents/tasks/${taskId}/file?path=config.js&board=1`);
        if (board.status !== 200 || named(board.text).length || !board.body?.content?.includes(HIDDEN)) problems.push(`Pat's config.js for the board answered ${board.status} with ${named(board.text).length} made-up keys`);
        if (problems.length) throw new Error(problems.join('; '));
        return `${routes.length} answers to Sam hold no made-up key; Pat's holds all ${SECRETS.length}, and Pat's config.js for the board holds [hidden]`;
      });
    } finally {
      for (const id of [reviewTaskId, taskId].filter(Boolean)) await t.api(pat, 'DELETE', `/api/cli-agents/tasks/${id}`).catch(() => {});
      putBackOpenProjects();
      fs.rmSync(script, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
