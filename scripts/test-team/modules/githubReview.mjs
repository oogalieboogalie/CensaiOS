// The GitHub window's review team never sends GitHub a key a reviewer read in
// a file only this computer's owner opens (backlog 218). Pat Example (the
// owner) opens a made-up repo on the stand-in GitHub in the GitHub window and
// has the stand-in Claude Code review its pull request. The reviewer reads
// the made-up shop's .env on this computer (not in the repo), asks to run a
// command with its key, and names the key in its summary and a finding. Pat
// sees that request whole and says no; the review's summary and finding show
// [hidden] in the key's place, with a note saying why, and the review Pat
// posts reaches the made-up GitHub with [hidden], never the key. Sam Example
// (a teammate) sees the same GitHub window on the shared board and nothing of
// Pat's review. Red team: Sam asks the server for the review, its post and
// its requests and gets nothing; the reviewer's own task keeps the key for
// Pat and shows Sam [hidden]. All repos, files, keys and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { STANDIN_GITHUB_OWNER } from '../standinGithub.mjs';
import { sideBySide } from '../sideBySide.mjs';

const HIDDEN = '[hidden]';
const NUMBER = 7;
const TITLE = 'Log the made-up key at start';
// A made-up key, so Claude Code counts as signed in for Pat (the stand-in never uses it).
const SIGN_IN = 'made-up-anthropic-key-for-the-review';

function reviewerSteps(envFile, key) {
  const answer = {
    summary: `Adds a log line. It prints MADE_UP_KEY, which is ${key} on this computer.`,
    findings: [
      { path: 'app.js', line: 2, severity: 'high', title: `app.js prints the key ${key}`, explanation: `Line 2 logs process.env.MADE_UP_KEY, so ${key} lands in every log.`, suggestion: `Log that the key is set, never ${key} itself.` },
    ],
  };
  return [
    { read: envFile },
    { say: `The made-up shop's .env has MADE_UP_KEY=${key}.` },
    { bash: `echo made-up call with ${key}`, description: 'Try a made-up call with the key' },
    { say: `I read it.\n\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`` },
  ];
}

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
const panelOf = (page, id) => windowFrame(page, id).locator(`[data-review-pr="${NUMBER}"]`).first();

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
  id: 'githubReview',
  label: "The GitHub window's review team never sends GitHub a key from a file only the owner opens",
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36);
    const name = `made-up-review-shop-${run}`;
    const repo = `${STANDIN_GITHUB_OWNER}/${name}`;
    const key = `made-up-review-key-${run}-0123456789`;
    const shop = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-shop-'));
    fs.writeFileSync(path.join(shop, '.env'), `MADE_UP_KEY=${key}\nPORT=3001\n`);
    t.github.seed(name, { 'README.md': '# Made-up review shop\n', 'app.js': 'export const shop = "Made-up Shop";\n' });
    t.github.seedPull(name, { number: NUMBER, title: TITLE, head: 'made-up-log', files: { 'app.js': 'export const shop = "Made-up Shop";\nconsole.log(process.env.MADE_UP_KEY);\n' } });
    fs.writeFileSync(path.join(t.cliData, 'standin-script.json'), JSON.stringify({ match: { 'review pull request': reviewerSteps(path.join(shop, '.env'), key) } }));
    // Never in any log: the made-up key, the sign-in key, or the shop's folder.
    t.typed.push(key, SIGN_IN, path.basename(shop));
    let win = null;
    let review = null;

    try {
      await check('walk', 'Pat opens the GitHub window from the Add menu, opens a made-up repo and sees its pull request', async ({ shot }) => {
        const saved = await t.api(pat, 'POST', '/api/keys', { provider: 'anthropic', apiKey: SIGN_IN });
        if (saved.status >= 400) throw new Error(`Pat's made-up Claude Code key was refused (${saved.status})`);
        const opened = await addFromMenu(pat.page, 'GitHub Console');
        if (opened.kind !== 'githubConsole') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not the GitHub window`);
        win = opened.id;
        if (!(await openRepo(pat.page, win, repo))) throw new Error(`Pat's GitHub window does not list "${TITLE}"`);
        await shot(pat.page, 'pat-sees-the-pull-request');
        return `the GitHub window lists pull request ${NUMBER} of the made-up repo`;
      });

      await check('walk', 'Pat has the stand-in Claude Code review it; asked to run a command with a made-up key, Pat sees the request whole and says no', async ({ shot }) => {
        if (!win) throw new Error('the GitHub window never opened');
        const frame = windowFrame(pat.page, win);
        await frame.getByRole('button', { name: 'Review' }).first().click({ timeout: 5_000 });
        const pick = frame.getByRole('checkbox', { name: 'Claude Code' });
        await pick.waitFor({ timeout: 10_000 });
        if (!(await pick.isEnabled())) throw new Error('Claude Code is not ready to review for Pat');
        if (!(await pick.isChecked())) await pick.check();
        for (const other of await frame.locator('.hb-gh-review-chip input:checked').all()) {
          if (!(await other.evaluate((el) => el.parentElement?.textContent?.trim() === 'Claude Code'))) await other.uncheck();
        }
        const started = pat.page.waitForResponse((res) => res.url().endsWith('/api/github/desk/review') && res.request().method() === 'POST', { timeout: 30_000 });
        await frame.getByRole('button', { name: /^Review with 1 reviewer$/ }).click({ timeout: 5_000 });
        review = (await (await started).json()).review;
        if (!review?.id) throw new Error('the review did not start');
        const asked = panelOf(pat.page, win).locator('.hb-gh-approval').first();
        if (!(await asked.waitFor({ timeout: 45_000 }).then(() => true, () => false))) throw new Error("the reviewer's request never showed for Pat");
        const words = await asked.innerText();
        if (!words.includes(key)) throw new Error(`Pat's request does not show the command whole: "${words.slice(0, 80)}"`);
        await closeUp(t, pat.page, win, 'pat-sees-the-request-whole', shot);
        await asked.getByRole('button', { name: 'Deny' }).click({ timeout: 5_000 });
        return 'Pat sees the command with the made-up key and says no';
      });

      await check('walk', "The review's summary and finding show [hidden] in the key's place on Pat's screen, with a note saying why", async ({ shot }) => {
        if (!review) throw new Error('the review never started');
        const panel = panelOf(pat.page, win);
        const done = await waitFor(async () => (await panel.getByTestId('review-hidden-words').count()) > 0, pat.page, 60_000);
        const words = await panel.innerText().catch(() => '');
        await closeUp(t, pat.page, win, 'pat-review-shows-hidden', shot);
        if (!done) throw new Error(`the review shows no note about [hidden]: "${words.slice(0, 120)}"`);
        if (words.includes(key)) throw new Error("Pat's review shows the made-up key");
        for (const shown of [`which is ${HIDDEN} on this computer`, `app.js prints the key ${HIDDEN}`]) {
          if (!words.includes(shown)) throw new Error(`Pat's review does not show "${shown}"`);
        }
        return 'the summary and the finding say [hidden], and the note says what it stands for';
      });

      await check('walk', 'Pat posts the review: the made-up GitHub gets [hidden], never the key', async ({ shot }) => {
        if (!review) throw new Error('the review never started');
        const panel = panelOf(pat.page, win);
        await panel.getByRole('button', { name: 'Post to GitHub' }).click({ timeout: 5_000 });
        const posted = await waitFor(async () => (await panel.innerText().catch(() => '')).includes('Posted to GitHub.'), pat.page);
        await closeUp(t, pat.page, win, 'pat-posted-the-review', shot);
        const got = t.github.reviewsOf(name);
        if (!posted || got.length !== 1) throw new Error(`the made-up GitHub got ${got.length} reviews`);
        const sent = JSON.stringify(got[0]);
        if (sent.includes(key)) throw new Error('the made-up GitHub got the made-up key');
        if (!got[0].body.includes(`which is ${HIDDEN} on this computer`)) throw new Error('the posted summary does not say [hidden]');
        if (!got[0].comments.some((c) => c.body.includes(`app.js prints the key ${HIDDEN}`))) throw new Error('the posted finding does not say [hidden]');
        return `one review on pull request ${NUMBER}, with [hidden] in its summary and its finding on app.js line 2`;
      });

      await check('walk', "Sam's GitHub window on the same board shows nothing of Pat's review", async ({ shot }) => {
        if (!win) throw new Error('the GitHub window never opened');
        const there = await sam.page.waitForFunction((id) => window.__e2eStore.getState().wins.some((w) => w.id === id), win, { timeout: 15_000 }).then(() => true, () => false);
        if (!there) throw new Error("the GitHub window is not on Sam's board");
        await openRepo(sam.page, win, repo);
        const frame = windowFrame(sam.page, win);
        const reviewButton = frame.getByRole('button', { name: 'Review' }).first();
        if (await reviewButton.count()) await reviewButton.click({ timeout: 5_000 }).catch(() => {});
        await sam.page.waitForTimeout(1500);
        const words = await textOf(sam.page, win);
        await sideBySide(t, 'pat-sees-the-review-sam-sees-none', shot);
        await closeUp(t, sam.page, win, 'sam-sees-no-review', shot);
        if (words.includes(key)) throw new Error("Sam's GitHub window shows the made-up key");
        if (words.includes('app.js prints the key')) throw new Error("Sam's GitHub window shows Pat's finding");
        return /desktop app/i.test(words) ? "Sam's window says reviewers run on the desktop app and shows no finding" : "Sam's window shows no finding";
      });

      await check('redteam', "Sam asks the server for Pat's review, its post and its requests: nothing comes back; Pat's answer holds [hidden]", async () => {
        if (!review) throw new Error('the review never started');
        const at = `/api/github/desk/review/${review.id}`;
        const asks = [['GET', at], ['POST', `${at}/post`], ['POST', `${at}/approve`, { taskId: review.reviewers?.[0]?.taskId, approvalId: 'made-up', allow: true }]];
        const answers = [];
        for (const [method, url, body] of asks) answers.push(await t.api(sam, method, url, body));
        const statuses = answers.map((a) => a.status);
        if (statuses.join(',') !== '404,404,403') throw new Error(`Sam got ${statuses.join(', ')}, not 404, 404, 403`);
        if (answers.some((a) => JSON.stringify(a.body).includes(key))) throw new Error("an answer to Sam holds the made-up key");
        const mine = await t.api(pat, 'GET', at);
        const seen = JSON.stringify(mine.body);
        if (mine.status !== 200 || seen.includes(key) || !seen.includes(HIDDEN)) throw new Error(`Pat's answer (${mine.status}) is not the review with [hidden]`);
        if (t.github.reviewsOf(name).length !== 1) throw new Error("Sam's post reached the made-up GitHub");
        return "Sam gets 404, 404 and 403 with no key; Pat's answer holds [hidden] and no key";
      });

      await check('redteam', "The reviewer's own task keeps the key for Pat in the Agent Console and shows Sam [hidden]", async () => {
        const taskId = review?.reviewers?.[0]?.taskId;
        if (!taskId) throw new Error('the review has no task');
        const [forPat, forSam] = await Promise.all([pat, sam].map((who) => t.api(who, 'GET', `/api/cli-agents/tasks/${encodeURIComponent(taskId)}`)));
        if (forPat.status !== 200 || !JSON.stringify(forPat.body).includes(key)) throw new Error(`Pat's answer (${forPat.status}) does not hold the key`);
        if (forSam.status === 200 && JSON.stringify(forSam.body).includes(key)) throw new Error("Sam's answer holds the made-up key");
        return forSam.status === 200 ? "Pat's task holds the key; Sam's holds [hidden] in its place" : `Pat's task holds the key; Sam gets ${forSam.status}`;
      });
    } finally {
      await t.api(pat, 'DELETE', '/api/keys/anthropic').catch(() => {});
      fs.rmSync(shop, { recursive: true, force: true });
    }
  },
};
