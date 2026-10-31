// The owner sees a fix job's waiting request whole (backlog 219). Pat Example
// (the owner) opens a made-up repo on the stand-in GitHub in the GitHub
// window, on a board shared with Sam Example (a teammate). Its pull request
// has conflicts, so Pat taps Fix conflicts and the stand-in Claude Code takes
// it. The agent reads the made-up shop's .env on this computer (not in the
// repo), then asks to print that file, and then to run a command with its
// key. The card on the shared board keeps a teammate's words: Sam sees the
// first request's title alone and [hidden] in the second's key; Pat's own
// screen shows both whole before Pat says no. "Open in Agent Console" opens
// the agent's task, and the Inbox lists the agent waiting for an OK: both
// whole for Pat and [hidden] for Sam; Pat says no from the Inbox and the
// agent stops. Red team: the window's shared state never holds the file's
// path or the key, the server answers Sam with the board's words only, and
// Sam's yes is refused. All repos, files, keys and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readWindow, windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { STANDIN_GITHUB_OWNER } from '../standinGithub.mjs';
import { sideBySide } from '../sideBySide.mjs';

const HIDDEN = '[hidden]';
const NUMBER = 8;
const TITLE = 'Bring the made-up menu up to date';
// A made-up key, so Claude Code counts as signed in for Pat (the stand-in never uses it).
const SIGN_IN = 'made-up-anthropic-key-for-the-fix';
const NOT_MERGED = 'The agent finished without merging main in.';

const agentSteps = (envFile, key) => [
  { read: envFile },
  { say: 'The made-up shop keeps its settings next door.' },
  { bash: `cat ${envFile}`, description: 'Print the made-up shop settings' },
  { bash: `echo made-up call with ${key}`, description: 'Try a made-up call with the key' },
  { say: 'I could not merge it without those.' },
];

async function waitFor(ok, page, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const found = await ok();
    if (found) return found;
    if (Date.now() > until) return null;
    await page.waitForTimeout(250);
  }
}

const textOf = (page, id) => windowFrame(page, id).innerText().catch(() => '');
const requestOn = (page, id) => windowFrame(page, id).locator('.hb-gh-approval').first();
const requestSays = (page, id, words) => waitFor(async () => {
  const shown = await requestOn(page, id).innerText().catch(() => '');
  return shown.includes(words) ? shown : null;
}, page, 45_000);

/** Brings a window into this screen's view the way a person does: its square on the Board map. */
async function bringIntoView(page, id) {
  const title = await page.evaluate((wid) => {
    const win = window.__e2eStore.getState().wins.find((w) => w.id === wid);
    return win?.title || win?.kind || '';
  }, id);
  const square = page.getByTestId('board-map-window').filter({ has: page.locator('title', { hasText: title }) }).first();
  if (!(await square.count())) return false;
  await square.click({ timeout: 5_000 });
  await page.waitForTimeout(900);
  return true;
}

/** On one screen's Inbox, picks the agent waiting for an OK and reads its request. */
async function inboxAsk(page, id) {
  const frame = windowFrame(page, id);
  const row = frame.getByRole('option', { name: /wants your OK/ }).first();
  if (!(await row.waitFor({ timeout: 30_000 }).then(() => true, () => false))) return '';
  await row.click({ timeout: 5_000 });
  const ask = frame.locator('.hb-inbox-approval').first();
  return (await ask.waitFor({ timeout: 20_000 }).then(() => ask.innerText(), () => '')) || '';
}

/** One person's window on its own, big enough to read its words, as a picture. */
async function closeUp(t, page, id, title, shot) {
  const picture = await windowFrame(page, id).screenshot({ type: 'png' });
  const view = await t.browser.newPage({ viewport: { width: 760, height: 760 } });
  await view.setContent(`<style>body{margin:0;padding:12px;background:gray}img{max-width:100%;display:block}</style>
    <img src="data:image/png;base64,${picture.toString('base64')}">`);
  await shot(view, title);
  await view.close();
}

/** Opens the made-up repo in a GitHub window the way a person does, if it shows the picker. */
async function openRepo(page, id, repo) {
  const frame = windowFrame(page, id);
  const box = frame.getByLabel('Repository');
  if (await box.count()) {
    await box.fill(repo);
    await frame.getByRole('button', { name: 'Open' }).click({ timeout: 5_000 });
  }
  return waitFor(async () => (await textOf(page, id)).includes(TITLE), page);
}

export default {
  id: 'githubFixRequest',
  label: "The owner sees a fix job's waiting request whole; the board keeps a teammate's words",
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36);
    const name = `made-up-fix-shop-${run}`;
    const repo = `${STANDIN_GITHUB_OWNER}/${name}`;
    const key = `made-up-fix-key-${run}-0123456789`;
    const shop = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-shop-'));
    const envFile = path.join(shop, '.env');
    fs.writeFileSync(envFile, `MADE_UP_KEY=${key}\nPORT=3001\n`);
    t.github.seed(name, { 'README.md': '# Made-up fix shop\n', 'menu.txt': 'soup\nbread\n' });
    t.github.seedPull(name, { number: NUMBER, title: TITLE, head: 'made-up-menu', files: { 'menu.txt': 'soup\nbread\npie\n' }, conflicts: { 'menu.txt': 'soup\nbread\ncake\n' } });
    fs.writeFileSync(path.join(t.cliData, 'standin-script.json'), JSON.stringify({ match: { 'Fix the merge conflicts on pull request': agentSteps(envFile, key) } }));
    // Never in any log: the made-up key, the sign-in key, or the shop's folder.
    t.typed.push(key, SIGN_IN, path.basename(shop));
    let win = null;
    let jobId = null;
    let consoleId = null;
    let inboxId = null;
    const shared = async () => JSON.stringify((await readWindow(pat.page, win))?.prActivity || {});

    try {
      await check('walk', 'Pat opens the GitHub window from the Add menu and opens a made-up repo: its pull request has conflicts and a Fix conflicts button', async ({ shot }) => {
        const saved = await t.api(pat, 'POST', '/api/keys', { provider: 'anthropic', apiKey: SIGN_IN });
        if (saved.status >= 400) throw new Error(`Pat's made-up Claude Code key was refused (${saved.status})`);
        const opened = await addFromMenu(pat.page, 'GitHub Console');
        if (opened.kind !== 'githubConsole') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not the GitHub window`);
        win = opened.id;
        if (!(await openRepo(pat.page, win, repo))) throw new Error(`Pat's GitHub window does not list "${TITLE}"`);
        const fix = windowFrame(pat.page, win).getByRole('button', { name: 'Fix conflicts' });
        if (!(await fix.count())) throw new Error('the pull request has no Fix conflicts button');
        await shot(pat.page, 'pat-sees-the-conflicts');
        return `pull request ${NUMBER} shows Conflicts and Fix conflicts`;
      });

      await check('walk', "Pat taps Fix conflicts; the agent asks to print the made-up shop's .env: Pat's card shows the whole request, Sam's shows its title alone", async ({ shot }) => {
        if (!win) throw new Error('the GitHub window never opened');
        await windowFrame(pat.page, win).getByRole('button', { name: 'Fix conflicts' }).click({ timeout: 5_000 });
        const activity = (await waitFor(async () => JSON.parse(await shared())[NUMBER]?.jobId && JSON.parse(await shared())[NUMBER], pat.page, 30_000)) || {};
        jobId = activity.jobId || null;
        const mine = await requestSays(pat.page, win, `cat ${envFile}`);
        const there = await sam.page.waitForFunction((id) => window.__e2eStore.getState().wins.some((w) => w.id === id), win, { timeout: 15_000 }).then(() => true, () => false);
        if (!there) throw new Error("the GitHub window is not on Sam's board");
        await openRepo(sam.page, win, repo);
        const theirs = await requestSays(sam.page, win, 'Run a command');
        await closeUp(t, pat.page, win, 'pat-sees-the-request-whole', shot);
        await closeUp(t, sam.page, win, 'sam-sees-its-title-alone', shot);
        await sideBySide(t, 'pat-whole-sam-title-alone', shot);
        if (!mine) throw new Error(`Pat's card does not show the command whole: "${(await requestOn(pat.page, win).innerText().catch(() => '')).slice(0, 80)}"`);
        if (!theirs) throw new Error("Sam's card shows no request");
        if (theirs.includes(shop) || theirs.includes('.env')) throw new Error(`Sam's card shows the file: "${theirs.slice(0, 80)}"`);
        return `Pat's card says "cat <the shop's .env>"; Sam's says "${theirs.split('\n')[0].trim()}"`;
      });

      await check('walk', "Pat says no; the agent asks to run a command with the made-up key: Pat's card shows the key, Sam's shows [hidden]", async ({ shot }) => {
        if (!jobId) throw new Error('the fix never asked');
        await requestOn(pat.page, win).getByRole('button', { name: 'Deny' }).click({ timeout: 5_000 });
        const mine = await requestSays(pat.page, win, key);
        const theirs = await requestSays(sam.page, win, `echo made-up call with ${HIDDEN}`);
        await sideBySide(t, 'pat-sees-the-key-sam-sees-hidden', shot);
        if (!mine) throw new Error("Pat's card does not show the command with the key");
        if (!theirs) throw new Error(`Sam's card does not show [hidden]: "${(await requestOn(sam.page, win).innerText().catch(() => '')).slice(0, 80)}"`);
        if (theirs.includes(key)) throw new Error("Sam's card shows the made-up key");
        return `Pat's card shows the command with the key; Sam's says "echo made-up call with ${HIDDEN}"`;
      });

      await check('redteam', "While it waits, the window on the shared board holds neither the file's path nor the key; the server answers Sam with the board's words and refuses Sam's yes", async () => {
        if (!jobId) throw new Error('the fix never asked');
        const board = await shared();
        if (board.includes(key) || board.includes(shop)) throw new Error("the shared window holds the key or the shop's folder");
        if (!board.includes(HIDDEN)) throw new Error("the shared window's copy of the request has no [hidden]");
        const [forPat, forSam] = await Promise.all([pat, sam].map((who) => t.api(who, 'GET', `/api/github/desk/fix/${jobId}`)));
        if (forSam.status !== 200 || 'whole' in forSam.body) throw new Error(`Sam's answer (${forSam.status}) has the whole requests`);
        if (JSON.stringify(forSam.body).includes(key) || JSON.stringify(forSam.body).includes(shop)) throw new Error("Sam's answer holds the key or the shop's folder");
        if (!JSON.stringify(forPat.body.whole || []).includes(key)) throw new Error("Pat's answer does not hold the whole request");
        const asked = (forSam.body.approvals || [])[0];
        const yes = await t.api(sam, 'POST', `/api/github/desk/fix/${jobId}/approve`, { approvalId: asked?.id || 'made-up', allow: true });
        if (yes.status !== 403) throw new Error(`Sam's yes got ${yes.status}, not 403`);
        return "the shared window says [hidden]; Sam's answer has no whole requests, no key and no folder; Sam's yes gets 403";
      });

      await check('walk', "Pat taps Open in Agent Console: the agent's task opens on both screens, whole for Pat and [hidden] for Sam", async ({ shot }) => {
        const open = windowFrame(pat.page, win).getByRole('button', { name: 'Open in Agent Console' });
        if (!(await open.count())) throw new Error('the card has no Open in Agent Console button');
        const before = await pat.page.evaluate(() => window.__e2eStore.getState().wins.map((w) => w.id));
        await open.click({ timeout: 5_000 });
        consoleId = await waitFor(() => pat.page.evaluate((ids) => window.__e2eStore.getState().wins.find((w) => w.kind === 'agentConsole' && !ids.includes(w.id))?.id || null, before), pat.page);
        if (!consoleId) throw new Error('no Agent Console opened');
        const mine = await waitFor(async () => (await textOf(pat.page, consoleId)).includes(`echo made-up call with ${key}`), pat.page, 30_000);
        const theirs = await waitFor(async () => (await textOf(sam.page, consoleId)).includes(`echo made-up call with ${HIDDEN}`), sam.page, 30_000);
        await closeUp(t, pat.page, consoleId, 'pat-agent-console-shows-it-whole', shot);
        await bringIntoView(sam.page, consoleId);
        await closeUp(t, sam.page, consoleId, 'sam-agent-console-shows-hidden', shot);
        if (!mine) throw new Error("Pat's Agent Console does not show the command with the key");
        if (!theirs) throw new Error("Sam's Agent Console does not show [hidden]");
        if ((await textOf(sam.page, consoleId)).includes(key)) throw new Error("Sam's Agent Console shows the made-up key");
        return "Pat's Agent Console shows the command with the key; Sam's shows [hidden]";
      });

      await check('walk', "Pat opens the Inbox from the Add menu: the agent waiting for an OK shows its command with the key for Pat and [hidden] for Sam", async ({ shot }) => {
        const opened = await addFromMenu(pat.page, 'Inbox');
        if (opened.kind !== 'inbox') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not the Inbox`);
        inboxId = opened.id;
        const there = await sam.page.waitForFunction((id) => window.__e2eStore.getState().wins.some((w) => w.id === id), inboxId, { timeout: 15_000 }).then(() => true, () => false);
        if (!there) throw new Error("the Inbox is not on Sam's board");
        await bringIntoView(sam.page, inboxId);
        const [mine, theirs] = await Promise.all([pat.page, sam.page].map((page) => inboxAsk(page, inboxId)));
        await closeUp(t, pat.page, inboxId, 'pat-inbox-shows-it-whole', shot);
        await sideBySide(t, 'inbox-whole-for-pat-hidden-for-sam', shot);
        if (!mine.includes(`echo made-up call with ${key}`)) throw new Error(`Pat's Inbox does not show the command whole: "${mine.slice(0, 80)}"`);
        if (!theirs.includes(`echo made-up call with ${HIDDEN}`)) throw new Error(`Sam's Inbox does not show [hidden]: "${theirs.slice(0, 80)}"`);
        if (theirs.includes(key)) throw new Error("Sam's Inbox shows the made-up key");
        return `Pat's Inbox says "Allow: Run a command" with the command and its key; Sam's shows [hidden] in the key's place`;
      });

      await check('walk', 'Pat says no in the Inbox; the agent stops without merging and both GitHub cards say so in plain words', async ({ shot }) => {
        if (!inboxId) throw new Error('the Inbox never opened');
        await windowFrame(pat.page, inboxId).locator('.hb-inbox-approval').first().getByRole('button', { name: 'Deny' }).click({ timeout: 5_000 });
        const ended = await waitFor(async () => (await textOf(pat.page, win)).includes(NOT_MERGED) && (await textOf(sam.page, win)).includes(NOT_MERGED), pat.page, 45_000);
        await bringIntoView(sam.page, win);
        await closeUp(t, sam.page, win, 'sam-sees-the-agent-stopped', shot);
        if (!ended) throw new Error(`the cards do not say "${NOT_MERGED}"`);
        if ((await shared()).includes(key)) throw new Error('the shared window holds the made-up key');
        return `both cards say "${NOT_MERGED} Open the Agent Console to see what it did."`;
      });
    } finally {
      await t.api(pat, 'DELETE', '/api/keys/anthropic').catch(() => {});
      fs.rmSync(shop, { recursive: true, force: true });
    }
  },
};
