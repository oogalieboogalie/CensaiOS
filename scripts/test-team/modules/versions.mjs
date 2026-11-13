// Saved versions and Send to GitHub keep a project's files that hold keys on
// this computer. Pat Example (the owner) opens a made-up project in Files on
// a board shared with Sam Example (a teammate) and turns versions on: the
// first version holds the project's ordinary files and none of its made-up
// .env, key file or the key file's backup, and the version bar lists those
// under "Left out of saved versions", on Sam's screen too, by name only. Pat
// changes the page and the .env and saves a version from the bar: the bar
// counts one change, the page, and no version ever holds a key. Pat sends the
// project to a made-up GitHub: it gets a private repository whose versions
// hold no such file and no key. Bug hunt: in a made-up project whose
// versions someone saved with plain git, .env and all, Pat changes the page
// and the .env: the bar lists the page as a change, not the .env, and lists
// the .env as left out; Send to GitHub on it sends nothing and says why in plain words,
// the made-up GitHub gets no repository, and the version the send saved
// first holds the new page and the .env as the earlier version held it, with
// the .env's new words in no version. The refusal offers to make those
// versions again without the .env and asks Pat first; once Pat says yes no
// version holds it, each keeps its message, the .env keeps its new words on
// this computer, and Send to GitHub sends the project with no .env in any
// version. A version a terminal saves with plain git in the project already
// on GitHub (which takes in the .env and key files too) stops the next send
// the same way, naming them, with no pull request; made again, the versions
// GitHub has stay as they are and the send opens a pull request with no key
// file. When a terminal has pushed the .env to GitHub itself, making the
// versions again asks first naming it, says GitHub keeps its copy and that
// merging the next pull request takes it out of the main branch, and the
// pull request it then sends holds no .env, GitHub's main branch as it was.
// The bar of that project then names the .env GitHub already has, on Pat's
// screen and Sam's, and says to make new keys, since censaiOS cannot take
// GitHub's copy back; the project GitHub has no such file for has no such
// line. Pat says "Done, I made new keys" on it: the line goes away on both
// screens and stays away after both reload, while Sam never gets the button
// and Sam's own Done is refused. A made-up key file a terminal pushes to
// GitHub after that brings the line back naming only it, and a new copy of
// the .env pushed after it brings the .env back too, still named once that
// branch is deleted on GitHub. In a made-up Terraform project the bar lists
// its values and state (prod.tfvars, terraform.tfstate and its backup) as
// left out, on Sam's screen too, and neither the first version nor Send to
// GitHub takes them, while main.tf and prod.tfvars.example are saved and
// sent. Red team: Sam's own save, send and making
// again are refused (only the owner changes versions); the bar's status
// names the files whose changes it leaves out but never their words; no
// repository, branch or version on the made-up GitHub holds a key; and the
// refusals, the versions made again and the files put away are logged
// without a file's name, path or key. The board's list of open projects is
// put back as the module found it. All files, keys and repositories are made
// up.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openBoard, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { MAKE_AGAIN, NEW_KEYS_DONE, githubKeepsLine, keptOutLine, madeAgainLine, makeAgainQuestion, newKeysLine, sendRefusal } from '../../../shared/files/versionWords.js';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

// Every made-up key carries this, so one search finds any of them anywhere.
const KEY = `not-a-real-made-up-key-${Date.now().toString(36)}`;
const GITHUB_KEY = `made-up-github-key-${Date.now().toString(36)}`;
const PAGE = 'made-up-page.html';
const ORDINARY = ['.env.example', 'made-up-notes.md', PAGE];
// In the order git lists them, as the bar names them.
const SECRETS = ['.env', 'made-up-server.key', 'made-up-server.key.bak'];
const LATER_KEY = 'made-up-deploy.key';
// A Terraform project: the values and state it keeps out (in git's order, as the bar names them), and the files it saves.
const TERRAFORM_KEPT = ['prod.tfvars', 'terraform.tfstate', 'terraform.tfstate.backup'];
const TERRAFORM_SHOWN = ['main.tf', 'prod.tfvars.example'];
const OLD_PAGE = 'made-up-old-page.html';
const OLD_ENV_CHANGED = `MADE_UP_KEY=${KEY}-oldenvchanged\n`;
// What a terminal pushes to the made-up GitHub itself: not the made-up key censaiOS must never send.
const PUSHED_KEY = `made-up-pushed-by-a-terminal-${Date.now().toString(36)}`;
// A key file a terminal pushes to GitHub after Pat made new keys.
const PUSHED_LATER = 'made-up-later-deploy.key';
const SEND_REFUSED = 'send to GitHub refused';
const PUT_AWAY = 'files GitHub keeps put away: new keys made';
const MADE_AGAIN = 'versions made again without files that can hold keys';

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

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** Saves a version with plain git, the way a terminal or an agent would: every change, or only `files`. */
function plainCommit(dir, message, files = null) {
  git(dir, 'add', ...(files ? ['--', ...files] : ['-A']));
  git(dir, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', message);
}

/** The made-up words of each file: a made-up key in each that holds keys, tagged by file. */
const wordsOf = (file, tag = file) => ([...SECRETS, LATER_KEY, ...TERRAFORM_KEPT].includes(file) ? `MADE_UP_KEY=${KEY}-${tag.replace(/\W/g, '')}\n` : `Made-up words in ${file}\n`);

function makeProject(prefix, files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)));
  for (const file of files) fs.writeFileSync(path.join(dir, file), wordsOf(file));
  return dir;
}

/** Every path a version of `dir` ever held, on any branch. */
const everHeld = (dir) => [...new Set(git(dir, 'rev-list', '--all').split('\n').filter(Boolean)
  .flatMap((sha) => git(dir, 'ls-tree', '-r', '--name-only', '-z', sha).split('\0').filter(Boolean)))];

const homeView = (page) => page.evaluate(() => {
  const st = window.__e2eStore.getState();
  st.setPan?.({ x: 0, y: 0 });
  st.setZoom?.(1);
});

/** The version bar's words for this person, once `ready` says they are there (within `ms`), else what it shows then. */
async function barSays(page, id, ready, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const words = await windowFrame(page, id).getByTestId('project-versions').innerText({ timeout: 2_000 }).catch(() => '');
    if (ready(words) || Date.now() > until) return words;
    await page.waitForTimeout(400);
  }
}

/** Opens `dir` in Pat's Files window by typing it in the path box. */
async function openFolder(page, filesId, dir) {
  const box = windowFrame(page, filesId).locator('input[type="text"]').first();
  await box.fill(dir);
  await box.press('Enter');
}

/** Pat's form in the bar: opens it with `button`, types `words`, presses its Save or Send. */
async function useBar(page, id, button, words) {
  const frame = windowFrame(page, id);
  await frame.getByRole('button', { name: button, exact: true }).click({ timeout: 5_000 });
  await frame.getByTestId('project-versions-text').fill(words);
  await frame.getByTestId('project-versions-go').click({ timeout: 5_000 });
}

/** Where a made-up key shows for this person: on their screen, or in their copy of the shared board. */
async function keyShows(page) {
  const screen = await page.evaluate(() => document.body.innerText);
  const board = await page.evaluate(() => JSON.stringify(window.__e2eStore.getState().wins));
  return [screen.includes(KEY) && 'on the screen', board.includes(KEY) && "in the board's copy of the windows"].filter(Boolean);
}

/** Problems with `repos` on the made-up GitHub: a branch or version that holds a key or a file that holds keys (but the .env a terminal pushed to `pushed` itself). */
function githubProblems(t, repos, pushed) {
  const problems = [];
  for (const repo of repos) {
    const held = t.github.pathsIn(repo).filter((file) => [...SECRETS, LATER_KEY, ...TERRAFORM_KEPT].includes(file) && !(repo === pushed && file === '.env'));
    if (held.length) problems.push(`${repo} on the made-up GitHub holds ${held.join(', ')}`);
    if (t.github.everything(repo).includes(KEY)) problems.push(`a version on ${repo} holds a made-up key`);
  }
  return problems;
}

/** Problems with what a version (or a repository) holds: an ordinary file missing, or a file that holds keys. */
function versionProblems(files, what) {
  const missing = ORDINARY.filter((file) => !files.includes(file));
  const held = files.filter((file) => [...SECRETS, LATER_KEY].includes(file));
  return [missing.length && `${what} is missing ${missing.join(', ')}`, held.length && `${what} holds ${held.join(', ')}`].filter(Boolean);
}

const fail = (problems, done) => {
  if (problems.length) throw new Error(problems.join('; '));
  return done;
};

export default {
  id: 'versions',
  label: "Saved versions and Send to GitHub keep a project's files that hold keys on this computer",
  async run(t) {
    const { pat, sam, check } = t;
    const putBackOpenProjects = keepOpenProjects();
    const site = makeProject('made-up-site', [...ORDINARY, ...SECRETS]);
    const old = makeProject('made-up-old-site', [OLD_PAGE, '.env']);
    git(old, 'init', '-q', '-b', 'main');
    plainCommit(old, 'Made-up first version, saved with plain git');
    const infra = makeProject('made-up-infra', [...TERRAFORM_SHOWN, ...TERRAFORM_KEPT]);
    const logStart = t.serverLog().length;
    // The made-up folders are typed into Files: the harness checks no log names them either.
    t.typed.push(KEY, GITHUB_KEY, path.basename(site), path.basename(old), path.basename(infra));
    let filesId = null;
    let repo = null;
    let oldRepo = null;
    // The made-up GitHub lasts across themes: each run looks at the repositories it made.
    const reposBefore = new Set(t.github.repos());
    const ourRepos = () => t.github.repos().filter((name) => !reposBefore.has(name));
    const problemsOnGithub = () => githubProblems(t, ourRepos(), oldRepo);

    try {
      await check('walk', 'Pat turns versions on for a made-up project with a .env, a key file and its backup: the first version holds only the ordinary files, and the bar lists the others under "Left out of saved versions", on Sam\'s screen too', async ({ shot }) => {
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        filesId = files.id;
        await updateWindow(pat.page, filesId, { x: 16, y: 64, w: 560, h: 560, width: 560, height: 560 });
        await homeView(pat.page);
        await openFolder(pat.page, filesId, site);
        const off = await barSays(pat.page, filesId, (w) => w.includes('Start saving versions'));
        if (!off.includes('Start saving versions')) throw new Error(`the bar says "${off}", with no Start saving versions`);
        await windowFrame(pat.page, filesId).getByRole('button', { name: 'Start saving versions' }).click({ timeout: 5_000 });
        const want = keptOutLine(SECRETS);
        const patSays = await barSays(pat.page, filesId, (w) => w.includes(want));
        await homeView(sam.page);
        const samSays = await barSays(sam.page, filesId, (w) => w.includes(want));
        await sideBySide(t, 'versions-on-the-keys-left-out', shot);
        const problems = [];
        if (!patSays.includes(want)) problems.push(`Pat's bar says "${patSays}", not "${want}"`);
        if (!samSays.includes(want)) problems.push(`Sam's bar says "${samSays}", not "${want}"`);
        if (!patSays.includes('Everything is saved')) problems.push(`Pat's bar does not say everything is saved: "${patSays}"`);
        const first = git(site, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n').sort();
        problems.push(...versionProblems(first, 'the first version'));
        for (const file of SECRETS) if (!fs.readFileSync(path.join(site, file), 'utf8').includes(KEY)) problems.push(`${file} lost its words on this computer`);
        const leaked = await keyShows(sam.page);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `the first version holds ${first.join(', ')}; both bars say "${want}"`);
      });

      await check('walk', 'Pat changes the page and the .env, then saves a version from the bar: it counts one change, the page, and no version ever holds a key', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the step before');
        fs.writeFileSync(path.join(site, PAGE), 'Made-up page, second version\n');
        fs.writeFileSync(path.join(site, '.env'), `MADE_UP_KEY=${KEY}-envchanged\n`);
        const counted = await barSays(pat.page, filesId, (w) => w.includes('1 unsaved change'));
        const problems = [];
        if (!counted.includes('1 unsaved change')) problems.push(`the bar says "${counted}", not "1 unsaved change"`);
        if (!counted.includes(`changed · ${PAGE}`)) problems.push(`the bar does not list the changed page: "${counted}"`);
        if (counted.includes('· .env')) problems.push('the bar lists the .env as a change');
        await useBar(pat.page, filesId, 'Save a version', 'Made-up second page');
        const saved = await barSays(pat.page, filesId, (w) => w.includes('Made-up second page') && w.includes('Everything is saved'));
        await shot(pat.page, 'a-version-saved-without-the-keys');
        if (!saved.includes('Last saved')) problems.push(`the bar does not show the new version: "${saved}"`);
        const held = everHeld(site).filter((file) => SECRETS.includes(file));
        if (held.length) problems.push(`a version holds ${held.join(', ')}`);
        if (git(site, 'log', '--all', '-p', '--no-color').includes(KEY)) problems.push('a version holds a made-up key');
        return fail(problems, `the bar counted the page only; ${git(site, 'rev-list', '--count', 'HEAD')} versions, none holding a key`);
      });

      await check('walk', 'Pat sends the project to a made-up GitHub: it gets a private repository whose versions hold no .env, key file or key', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const saved = await t.api(pat, 'POST', '/api/keys', { provider: 'github', apiKey: GITHUB_KEY });
        if (saved.status >= 400) throw new Error(`Pat's made-up GitHub key was not saved (${saved.status})`);
        const callsBefore = t.github.calls().length;
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up first send');
        const sent = await barSays(pat.page, filesId, (w) => w.includes('is on GitHub at') || w.includes('Nothing was sent'));
        await shot(pat.page, 'sent-to-a-made-up-github');
        const created = t.github.calls().slice(callsBefore).find(([kind]) => kind === 'create');
        const problems = [];
        if (!sent.includes('is on GitHub at') || !sent.includes('(private)')) problems.push(`the bar says "${sent}", not that the project is on GitHub`);
        if (!created) problems.push('the made-up GitHub got no repository');
        else if (created[2] !== true) problems.push('the repository is not private');
        repo = created?.[1] || null;
        const pushed = repo ? t.github.pathsIn(repo).sort() : [];
        if (repo) problems.push(...versionProblems(pushed, 'the made-up GitHub'));
        problems.push(...problemsOnGithub());
        return fail(problems, `the private repository ${repo} holds ${pushed.join(', ')} and no key`);
      });

      await check('hunt', 'in a made-up project whose versions someone saved with plain git, .env and all, Pat changes the page and the .env: the bar lists the page as a change, not the .env, and lists the .env as left out', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        fs.writeFileSync(path.join(old, OLD_PAGE), 'Made-up old page, second version\n');
        fs.writeFileSync(path.join(old, '.env'), OLD_ENV_CHANGED);
        await openFolder(pat.page, filesId, old);
        const want = keptOutLine(['.env']);
        const patSays = await barSays(pat.page, filesId, (w) => w.includes(want) && w.includes(`changed · ${OLD_PAGE}`));
        const samSays = await barSays(sam.page, filesId, (w) => w.includes(want));
        await sideBySide(t, 'an-old-env-changed-is-left-out', shot);
        const problems = [];
        // Opening the folder in censaiOS also adds its .team notes, a new change of their own.
        if (!patSays.includes(`changed · ${OLD_PAGE}`)) problems.push(`Pat's bar says "${patSays}", with no change to the page`);
        if (patSays.includes('· .env')) problems.push('Pat\'s bar lists the .env as a change');
        if (!patSays.includes(want)) problems.push(`Pat's bar does not say "${want}"`);
        if (!samSays.includes(want)) problems.push(`Sam's bar says "${samSays}", not "${want}"`);
        const leaked = await keyShows(sam.page);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, 'both bars list the .env as left out, and Pat\'s lists the page as a change and not the .env');
      });

      await check('hunt', 'Send to GitHub on that project sends nothing and says why in plain words; the made-up GitHub gets no repository, and the version the send saved first holds the new page, with the .env as the earlier version held it', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const before = t.github.repos().length;
        const heldEnv = git(old, 'rev-parse', 'HEAD:.env');
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up old send');
        const want = sendRefusal(['.env']);
        const says = await barSays(pat.page, filesId, (w) => w.includes(want) || w.includes('is on GitHub at'));
        await shot(pat.page, 'an-old-env-stops-the-send');
        const problems = [];
        if (!says.includes(want)) problems.push(`the bar says "${says}", not "${want}"`);
        if (t.github.repos().length !== before) problems.push('the made-up GitHub got a repository');
        if (git(old, 'rev-list', '--count', 'HEAD') !== '2') problems.push('the send did not save the page first');
        else if (git(old, 'show', `HEAD:${OLD_PAGE}`) !== 'Made-up old page, second version') problems.push('the version the send saved does not hold the new page');
        if (git(old, 'rev-parse', 'HEAD:.env') !== heldEnv) problems.push('the version the send saved changed the .env');
        if (git(old, 'log', '--all', '-p', '--no-color').includes(OLD_ENV_CHANGED.trim())) problems.push("a version holds the .env's new words");
        if (fs.readFileSync(path.join(old, '.env'), 'utf8') !== OLD_ENV_CHANGED) problems.push('the .env lost its new words on this computer');
        problems.push(...problemsOnGithub());
        return fail(problems, `the bar says "${want}"; the made-up GitHub got nothing, and the .env's new words are in no version`);
      });

      await check('hunt', 'that refusal offers to make the versions again without the .env, and asks Pat first: nothing changes until Pat says yes', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const head = git(old, 'rev-parse', 'HEAD');
        await windowFrame(pat.page, filesId).getByRole('button', { name: MAKE_AGAIN, exact: true }).click({ timeout: 5_000 });
        const want = makeAgainQuestion(['.env'], 2);
        const says = await barSays(pat.page, filesId, (w) => w.includes(want));
        await shot(pat.page, 'make-again-asks-first');
        const problems = [];
        if (!says.includes(want)) problems.push(`the bar says "${says}", not "${want}"`);
        if (git(old, 'rev-parse', 'HEAD') !== head) problems.push('the versions changed before Pat said yes');
        return fail(problems, `the bar asks "${want}", and nothing changed yet`);
      });

      await check('hunt', 'Pat says yes: no version holds the .env any more, each keeps its message, name and time, the .env keeps its new words on this computer, and the bar says Send to GitHub can send them now', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const before = git(old, 'log', '--format=%s|%an|%aI');
        await windowFrame(pat.page, filesId).getByTestId('project-versions-make-again-yes').click({ timeout: 5_000 });
        const want = madeAgainLine(['.env'], 2);
        const says = await barSays(pat.page, filesId, (w) => w.includes(want));
        await shot(pat.page, 'made-again-without-the-env');
        const problems = [];
        if (!says.includes(want)) problems.push(`the bar says "${says}", not "${want}"`);
        if (!says.includes(keptOutLine(['.env']))) problems.push('the bar no longer lists the .env as left out');
        if (git(old, 'log', '--format=%s|%an|%aI') !== before) problems.push("a version's message, name or time changed");
        const held = everHeld(old);
        if (held.includes('.env')) problems.push('a version still holds the .env');
        if (git(old, 'log', '--all', '-p', '--no-color').includes(KEY)) problems.push('a version still holds a made-up key');
        if (git(old, 'show', `HEAD:${OLD_PAGE}`) !== 'Made-up old page, second version') problems.push('the last version lost the new page');
        if (fs.readFileSync(path.join(old, '.env'), 'utf8') !== OLD_ENV_CHANGED) problems.push('the .env lost its new words on this computer');
        return fail(problems, `the bar says "${want}"; ${git(old, 'rev-list', '--count', 'HEAD')} versions hold ${held.sort().join(', ')}`);
      });

      await check('hunt', 'then Send to GitHub sends that project: the made-up GitHub gets a private repository in which no version holds the .env or a key', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const callsBefore = t.github.calls().length;
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up old send, made again');
        const sent = await barSays(pat.page, filesId, (w) => w.includes('is on GitHub at') || w.includes('Nothing was sent'));
        await shot(pat.page, 'sent-once-made-again');
        const created = t.github.calls().slice(callsBefore).find(([kind]) => kind === 'create');
        oldRepo = created?.[1] || null;
        const pushed = created ? t.github.pathsIn(created[1]).sort() : [];
        const problems = [];
        if (!sent.includes('is on GitHub at') || !sent.includes('(private)')) problems.push(`the bar says "${sent}", not that the project is on GitHub`);
        if (!created) problems.push('the made-up GitHub got no repository');
        else if (!pushed.includes(OLD_PAGE) || pushed.includes('.env')) problems.push(`the made-up repository holds ${pushed.join(', ')}`);
        problems.push(...problemsOnGithub());
        return fail(problems, `the private repository ${created?.[1]} holds ${pushed.join(', ')} in every version, and no key`);
      });

      await check('hunt', 'a version a terminal saves with plain git in the project already on GitHub, which takes in a new key file and the .env and key files beside it, stops the next send the same way, naming them, with no pull request', async ({ shot }) => {
        if (!filesId || !repo) throw new Error('the project was not sent in the steps before');
        const callsBefore = t.github.calls().length;
        fs.writeFileSync(path.join(site, LATER_KEY), wordsOf(LATER_KEY));
        fs.writeFileSync(path.join(site, PAGE), 'Made-up page, third version\n');
        plainCommit(site, 'Made-up third version, saved with plain git');
        await openFolder(pat.page, filesId, site);
        await barSays(pat.page, filesId, (w) => w.includes('Made-up third version, saved with plain git'));
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up second send');
        // git add -A takes in every file on disk, the ones versions leave out too, listed as git lists them.
        const want = sendRefusal(['.env', LATER_KEY, ...SECRETS.slice(1)]);
        const says = await barSays(pat.page, filesId, (w) => w.includes(want) || w.includes('Pull request'));
        await shot(pat.page, 'a-key-saved-with-plain-git-stops-the-send');
        const problems = [];
        if (!says.includes(want)) problems.push(`the bar says "${says}", not "${want}"`);
        if (t.github.calls().slice(callsBefore).some(([kind]) => kind === 'pr')) problems.push('the made-up GitHub got a pull request');
        problems.push(...problemsOnGithub());
        return fail(problems, `the bar says "${want}" and the made-up GitHub got no pull request`);
      });

      await check('redteam', "Sam's own request to make those versions again is refused, and nothing changes", async () => {
        const head = git(site, 'rev-parse', 'HEAD');
        const res = await t.api(sam, 'POST', '/api/project-git/make-again', { path: site });
        const problems = [];
        if (res.status !== 403) problems.push(`Sam's request was answered ${res.status}, not 403`);
        if (res.text.includes(KEY) || res.text.includes('.env')) problems.push("the answer to Sam names a file or holds a made-up key");
        if (git(site, 'rev-parse', 'HEAD') !== head) problems.push("Sam's request changed the versions");
        return fail(problems, `refused with ${res.status}; the versions are as they were`);
      });

      await check('hunt', 'Pat makes the version GitHub does not have yet again: the versions GitHub has stay as they are, and Send to GitHub then opens a pull request with no key file', async ({ shot }) => {
        if (!filesId || !repo) throw new Error('the project was not sent in the steps before');
        const onGithub = git(site, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0];
        const unsent = Number(git(site, 'rev-list', '--count', 'HEAD', '--not', '--remotes=origin'));
        const frame = windowFrame(pat.page, filesId);
        await frame.getByRole('button', { name: MAKE_AGAIN, exact: true }).click({ timeout: 5_000 });
        await frame.getByTestId('project-versions-make-again-yes').click({ timeout: 5_000 });
        const want = madeAgainLine(['.env', LATER_KEY, ...SECRETS.slice(1)], unsent);
        const says = await barSays(pat.page, filesId, (w) => w.includes(want));
        const problems = [];
        if (!says.includes(want)) problems.push(`the bar says "${says}", not "${want}"`);
        if (git(site, 'rev-parse', `HEAD~${unsent}`) !== onGithub) problems.push('a version GitHub has was made again');
        if (git(site, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0] !== onGithub) problems.push("GitHub's main branch changed");
        const callsBefore = t.github.calls().length;
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up second send, made again');
        const sent = await barSays(pat.page, filesId, (w) => w.includes('Pull request') || w.includes('Nothing was sent'));
        await shot(pat.page, 'a-pull-request-once-made-again');
        if (!sent.includes('Pull request')) problems.push(`the bar says "${sent}", not that a pull request is open`);
        if (!t.github.calls().slice(callsBefore).some(([kind]) => kind === 'pr')) problems.push('the made-up GitHub got no pull request');
        problems.push(...problemsOnGithub());
        for (const file of [...SECRETS, LATER_KEY]) if (!fs.readFileSync(path.join(site, file), 'utf8').includes(KEY)) problems.push(`${file} lost its words on this computer`);
        return fail(problems, `${unsent} version made again on GitHub's own; a pull request is open and the made-up GitHub holds no key file`);
      });

      await check('hunt', "when a terminal has pushed that project's .env to GitHub itself and then saved a change to it, making the versions again asks first naming it, says GitHub keeps its copy and merging the next pull request takes it out of the main branch; the pull request then sent holds no .env", async ({ shot }) => {
        if (!filesId || !oldRepo) throw new Error('that project was not sent in the steps before');
        fs.writeFileSync(path.join(old, '.env'), `MADE_UP_KEY=${PUSHED_KEY}\n`);
        plainCommit(old, 'Made-up version with the .env, saved with plain git');
        git(old, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
        const onGithub = git(old, 'rev-parse', 'HEAD');
        fs.writeFileSync(path.join(old, '.env'), `MADE_UP_KEY=${PUSHED_KEY}-changed\n`);
        fs.writeFileSync(path.join(old, OLD_PAGE), 'Made-up old page, fourth version\n');
        plainCommit(old, 'Made-up version that changes the .env, saved with plain git');
        await openFolder(pat.page, filesId, old);
        await barSays(pat.page, filesId, (w) => w.includes('Made-up version that changes the .env'));
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up old send, after the terminal');
        const refused = await barSays(pat.page, filesId, (w) => w.includes(sendRefusal(['.env'])) || w.includes('Pull request'));
        const problems = [];
        if (!refused.includes(sendRefusal(['.env']))) problems.push(`the send was not refused: "${refused}"`);
        await windowFrame(pat.page, filesId).getByRole('button', { name: MAKE_AGAIN, exact: true }).click({ timeout: 5_000 });
        const want = makeAgainQuestion(['.env'], 1, ['.env'], ['.env']);
        const asked = await barSays(pat.page, filesId, (w) => w.includes(want));
        await shot(pat.page, 'make-again-names-what-github-keeps');
        if (!asked.includes(want)) problems.push(`the bar asks "${asked}", not "${want}"`);
        await windowFrame(pat.page, filesId).getByTestId('project-versions-make-again-yes').click({ timeout: 5_000 });
        const made = await barSays(pat.page, filesId, (w) => w.includes(madeAgainLine(['.env'], 1)));
        if (!made.includes(madeAgainLine(['.env'], 1))) problems.push(`the bar says "${made}", not "${madeAgainLine(['.env'], 1)}"`);
        if (git(old, 'rev-parse', 'HEAD^') !== onGithub) problems.push('the version GitHub has was made again');
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up old send, made again after the terminal');
        const sent = await barSays(pat.page, filesId, (w) => w.includes('Pull request') || w.includes('Nothing was sent'));
        await shot(pat.page, 'a-pull-request-without-the-env-github-keeps');
        if (!sent.includes('Pull request')) problems.push(`the bar says "${sent}", not that a pull request is open`);
        const branch = git(old, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin/censai/').split('\n').filter(Boolean).pop();
        if (!branch) problems.push('no pull request branch came back from the made-up GitHub');
        else if (git(old, 'ls-tree', '-r', '--name-only', branch).split('\n').includes('.env')) problems.push('the pull request holds the .env');
        if (git(old, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0] !== onGithub) problems.push("GitHub's main branch changed");
        if (t.github.everything(oldRepo).includes(`${PUSHED_KEY}-changed`)) problems.push("the .env's change reached the made-up GitHub");
        if (fs.readFileSync(path.join(old, '.env'), 'utf8') !== `MADE_UP_KEY=${PUSHED_KEY}-changed\n`) problems.push('the .env lost its words on this computer');
        problems.push(...problemsOnGithub());
        return fail(problems, `the bar asked "${want}"; the pull request holds no .env and GitHub's main branch is as the terminal left it`);
      });

      await check('hunt', "then the bar of that project names the .env GitHub already has, on Pat's screen and Sam's, and says to make new keys since censaiOS cannot take GitHub's copy back; the project GitHub has no such file for has no such line", async ({ shot }) => {
        if (!filesId || !oldRepo) throw new Error('that project was not sent in the steps before');
        const want = githubKeepsLine(['.env']);
        // The .env stays on this computer, left out of the versions made again, so a bar that has caught up lists it too.
        const current = (w) => w.includes(want) && w.includes(keptOutLine(['.env']));
        const problems = [];
        await homeView(pat.page);
        const patSays = await barSays(pat.page, filesId, current);
        await homeView(sam.page);
        const samSays = await barSays(sam.page, filesId, current);
        await sideBySide(t, 'github-already-has-the-env', shot);
        if (!patSays.includes(want)) problems.push(`Pat's bar says "${patSays}", not "${want}"`);
        if (!samSays.includes(want)) problems.push(`Sam's bar says "${samSays}", not "${want}"`);
        if (!current(samSays)) problems.push(`Sam's bar has not caught up with the versions made again: "${samSays}"`);
        for (const [who, name] of [[pat, 'Pat'], [sam, 'Sam']]) {
          const res = await t.api(who, 'GET', `/api/project-git/status?path=${encodeURIComponent(old)}`);
          if (JSON.stringify(res.body?.githubKeeps) !== JSON.stringify(['.env'])) problems.push(`${name}'s status says GitHub keeps ${JSON.stringify(res.body?.githubKeeps)}, not [".env"]`);
          if (res.text.includes(PUSHED_KEY)) problems.push(`${name}'s status holds the made-up key`);
        }
        await openFolder(pat.page, filesId, site);
        // Only that project's bar lists its made-up server key as left out.
        const clean = await barSays(pat.page, filesId, (w) => w.includes('made-up-server.key') && !w.includes(want));
        await shot(pat.page, 'no-such-line-when-github-has-no-key-file');
        if (!clean.includes('made-up-server.key')) problems.push(`the bar did not move to the project GitHub has no key file for: "${clean}"`);
        if (clean.includes('GitHub already has')) problems.push(`the bar of the project GitHub has no key file for says "${clean}"`);
        const res = await t.api(pat, 'GET', `/api/project-git/status?path=${encodeURIComponent(site)}`);
        if (JSON.stringify(res.body?.githubKeeps) !== '[]') problems.push(`its status says GitHub keeps ${JSON.stringify(res.body?.githubKeeps)}`);
        return fail(problems, `both bars say "${want}"; the project GitHub has no key file for has no such line`);
      });

      await check('walk', `Pat says "${NEW_KEYS_DONE}" on that line: it goes away on Pat's screen and Sam's and stays away after both reload, while Sam's bar never shows the button and Sam's own Done is refused`, async ({ shot }) => {
        if (!filesId || !oldRepo) throw new Error('that project was not sent in the steps before');
        const want = githubKeepsLine(['.env']);
        const statusOf = async (who) => (await t.api(who, 'GET', `/api/project-git/status?path=${encodeURIComponent(old)}`)).body?.githubKeeps;
        const problems = [];
        await openFolder(pat.page, filesId, old);
        await homeView(pat.page);
        const patSays = await barSays(pat.page, filesId, (w) => w.includes(want) && w.includes(NEW_KEYS_DONE));
        await shot(pat.page, 'the-line-with-done-i-made-new-keys');
        if (!patSays.includes(want) || !patSays.includes(NEW_KEYS_DONE)) problems.push(`Pat's bar says "${patSays}", not "${want}" with a "${NEW_KEYS_DONE}" button`);
        await homeView(sam.page);
        const samSays = await barSays(sam.page, filesId, (w) => w.includes(want));
        if (!samSays.includes(want)) problems.push(`Sam's bar says "${samSays}", not "${want}"`);
        if (await windowFrame(sam.page, filesId).getByTestId('project-versions-new-keys').count()) problems.push(`Sam's bar shows the "${NEW_KEYS_DONE}" button`);
        const refused = await t.api(sam, 'POST', '/api/project-git/new-keys', { path: old, names: ['.env'] });
        if (refused.status < 400) problems.push(`Sam's own Done was answered ${refused.status}`);
        if (JSON.stringify(await statusOf(pat)) !== '[".env"]') problems.push(`after Sam's Done the status says GitHub keeps ${JSON.stringify(await statusOf(pat))}`);
        await windowFrame(pat.page, filesId).getByTestId('project-versions-new-keys').click({ timeout: 5_000 });
        const note = newKeysLine(['.env']);
        const away = (w) => w.includes(keptOutLine(['.env'])) && !w.includes('GitHub already has');
        const patAfter = await barSays(pat.page, filesId, (w) => away(w) && w.includes(note));
        const samAfter = await barSays(sam.page, filesId, away);
        await sideBySide(t, 'the-line-put-away-on-both-screens', shot);
        if (!away(patAfter) || !patAfter.includes(note)) problems.push(`Pat's bar says "${patAfter}", not "${note}" without the line`);
        if (!away(samAfter)) problems.push(`Sam's bar still says "${samAfter}"`);
        await Promise.all([pat, sam].map((who) => openBoard(who.page, t.workspaceId, t.web)));
        for (const who of [pat, sam]) await homeView(who.page);
        for (const [who, name] of [[pat, 'Pat'], [sam, 'Sam']]) {
          const reloaded = await barSays(who.page, filesId, away);
          if (!away(reloaded)) problems.push(`after a reload ${name}'s bar says "${reloaded}"`);
          if (JSON.stringify(await statusOf(who)) !== '[]') problems.push(`after a reload ${name}'s status says GitHub keeps ${JSON.stringify(await statusOf(who))}`);
        }
        await shot(pat.page, 'the-line-stays-away-after-a-reload');
        return fail(problems, `the line is gone on both screens and after both reload; Sam had no button and Sam's Done was answered ${refused.status}`);
      });

      await check('hunt', 'a made-up key file a terminal pushes to GitHub after that brings the line back naming only it, on both screens; a new copy of the .env pushed after it brings the .env back too, still named once that branch is deleted on GitHub', async ({ shot }) => {
        if (!filesId || !oldRepo) throw new Error('that project was not sent in the steps before');
        const statusOf = async () => JSON.stringify((await t.api(pat, 'GET', `/api/project-git/status?path=${encodeURIComponent(old)}`)).body?.githubKeeps);
        const problems = [];
        fs.writeFileSync(path.join(old, PUSHED_LATER), `MADE_UP_KEY=${PUSHED_KEY}-later\n`);
        // Only that file: the .env's change on this computer stays off GitHub.
        plainCommit(old, 'Made-up version with a key file, saved with plain git', [PUSHED_LATER]);
        // Saved on this computer only: GitHub does not have it yet.
        if (await statusOf() !== '[]') problems.push(`a key file saved on this computer only brought the line back: ${await statusOf()}`);
        git(old, 'push', '-q', 'origin', 'HEAD:refs/heads/made-up-terminal');
        const later = githubKeepsLine([PUSHED_LATER]);
        await homeView(pat.page);
        await homeView(sam.page);
        const patSays = await barSays(pat.page, filesId, (w) => w.includes(later));
        const samSays = await barSays(sam.page, filesId, (w) => w.includes(later));
        await sideBySide(t, 'a-key-file-pushed-later-brings-the-line-back', shot);
        if (!patSays.includes(later)) problems.push(`Pat's bar says "${patSays}", not "${later}"`);
        if (!samSays.includes(later)) problems.push(`Sam's bar says "${samSays}", not "${later}"`);
        fs.writeFileSync(path.join(old, '.env'), `MADE_UP_KEY=${PUSHED_KEY}-new\n`);
        plainCommit(old, 'Made-up version with a new copy of the .env, saved with plain git', ['.env']);
        git(old, 'push', '-q', 'origin', 'HEAD:refs/heads/made-up-terminal');
        const both = githubKeepsLine(['.env', PUSHED_LATER]);
        const patBoth = await barSays(pat.page, filesId, (w) => w.includes(both));
        await shot(pat.page, 'a-new-copy-of-the-env-brings-it-back');
        if (!patBoth.includes(both)) problems.push(`after a new copy of the .env Pat's bar says "${patBoth}", not "${both}"`);
        git(old, 'push', '-q', 'origin', ':refs/heads/made-up-terminal');
        git(old, 'fetch', '-q', '--prune', 'origin');
        if (await statusOf() !== JSON.stringify(['.env', PUSHED_LATER])) problems.push(`once the branch is deleted the status says GitHub keeps ${await statusOf()}`);
        return fail(problems, `the bars said "${later}", then "${both}", which stays once the branch is gone`);
      });

      await check('hunt', `in a made-up Terraform project Pat turns versions on: the bar lists ${TERRAFORM_KEPT.join(', ')} as left out, on Sam's screen too, and neither the first version nor Send to GitHub takes them, while ${TERRAFORM_SHOWN.join(' and ')} are saved and sent`, async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        await openFolder(pat.page, filesId, infra);
        const off = await barSays(pat.page, filesId, (w) => w.includes('Start saving versions'));
        if (!off.includes('Start saving versions')) throw new Error(`the bar says "${off}", with no Start saving versions`);
        await windowFrame(pat.page, filesId).getByRole('button', { name: 'Start saving versions' }).click({ timeout: 5_000 });
        const want = keptOutLine(TERRAFORM_KEPT);
        await homeView(pat.page);
        await homeView(sam.page);
        const patSays = await barSays(pat.page, filesId, (w) => w.includes(want));
        const samSays = await barSays(sam.page, filesId, (w) => w.includes(want));
        await sideBySide(t, 'terraform-state-and-values-left-out', shot);
        const problems = [];
        // The bar's words on one line, so the report's table keeps them whole.
        const flat = (words) => words.replace(/\s+/g, ' ').trim();
        if (!patSays.includes(want)) problems.push(`Pat's bar says "${flat(patSays)}", not "${want}"`);
        if (!samSays.includes(want)) problems.push(`Sam's bar says "${flat(samSays)}", not "${want}"`);
        // What a version or a repository lacks of the files it should hold, or holds of the ones kept out (censaiOS adds its own .team notes).
        const wrong = (files, what) => [...TERRAFORM_SHOWN.filter((file) => !files.includes(file)).map((file) => `${what} lacks ${file}`),
          ...files.filter((file) => TERRAFORM_KEPT.includes(file)).map((file) => `${what} holds ${file}`)];
        const first = git(infra, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n');
        problems.push(...wrong(first, 'the first version'));
        const callsBefore = t.github.calls().length;
        await useBar(pat.page, filesId, 'Send to GitHub', 'Made-up Terraform send');
        const sent = await barSays(pat.page, filesId, (w) => w.includes('is on GitHub at') || w.includes('Nothing was sent'));
        await shot(pat.page, 'a-terraform-project-sent-without-its-state');
        const created = t.github.calls().slice(callsBefore).find(([kind]) => kind === 'create');
        const onGithub = created ? t.github.pathsIn(created[1]) : [];
        if (!sent.includes('is on GitHub at')) problems.push(`the bar says "${flat(sent)}", not that the project is on GitHub`);
        if (!created) problems.push('the made-up GitHub got no repository');
        else problems.push(...wrong(onGithub, 'the made-up GitHub'));
        if (created && t.github.everything(created[1]).includes(KEY)) problems.push('a version on the made-up GitHub holds a made-up key');
        if (git(infra, 'log', '--all', '-p', '--no-color').includes(KEY)) problems.push('a version holds a made-up key');
        for (const file of TERRAFORM_KEPT) if (!fs.readFileSync(path.join(infra, file), 'utf8').includes(KEY)) problems.push(`${file} lost its words on this computer`);
        const leaked = await keyShows(sam.page);
        if (leaked.length) problems.push(`a made-up key reached Sam ${leaked.join(' and ')}`);
        return fail(problems, `both bars say "${want}"; the first version holds ${first.join(', ')} and the private repository ${created?.[1]} ${onGithub.join(', ')}`);
      });

      await check('redteam', "Sam's own requests to save a version or send one are refused, and nothing changes on this computer or the made-up GitHub", async () => {
        const versions = git(site, 'rev-list', '--count', 'HEAD');
        const calls = t.github.calls().length;
        fs.writeFileSync(path.join(site, 'made-up-notes.md'), 'Made-up notes, changed for the red team\n');
        const problems = [];
        for (const [what, url, body] of [['save', '/api/project-git/save', { path: site, message: 'Sam made-up save' }], ['send', '/api/project-git/send', { path: site, title: 'Sam made-up send' }]]) {
          const res = await t.api(sam, 'POST', url, body);
          if (res.status < 400) problems.push(`Sam's ${what} was answered ${res.status}`);
          if (res.text.includes(KEY)) problems.push(`Sam's ${what} answer holds a made-up key`);
        }
        if (git(site, 'rev-list', '--count', 'HEAD') !== versions) problems.push("Sam's request saved a version");
        if (t.github.calls().length !== calls) problems.push("Sam's request reached the made-up GitHub");
        return fail(problems, `both refused; still ${versions} versions and ${calls} calls to the made-up GitHub`);
      });

      await check('redteam', "the bar's status names the files whose changes it leaves out but never their words, for Pat or Sam", async () => {
        // Changed again on this computer, they are still left out of the next version.
        for (const file of SECRETS) fs.writeFileSync(path.join(site, file), wordsOf(file, `${file}-redteam`));
        const problems = [];
        for (const [who, name] of [[pat, 'Pat'], [sam, 'Sam']]) {
          const res = await t.api(who, 'GET', `/api/project-git/status?path=${encodeURIComponent(site)}`);
          if (res.status >= 400) problems.push(`${name}'s status was answered ${res.status}`);
          else if (!SECRETS.every((file) => (res.body?.keptOut || []).includes(file))) problems.push(`${name}'s status does not name every file left out: ${JSON.stringify(res.body?.keptOut)}`);
          if (res.text.includes(KEY)) problems.push(`${name}'s status holds a made-up key`);
        }
        return fail(problems, 'both statuses name the files left out, with no key');
      });

      await check('redteam', 'no repository, branch or version on the made-up GitHub holds a key or a file that holds keys that censaiOS sent', async () => {
        const repos = ourRepos();
        if (!repos.length) throw new Error('the made-up GitHub has no repository to look at');
        return fail(problemsOnGithub(), `${repos.length} repositories looked at, every branch and version (the .env a terminal pushed itself aside)`);
      });

      await check('redteam', "the refusals, the versions made again and the files put away are logged without a file's name, path or key", async () => {
        const lines = t.serverLog().slice(logStart).split('\n');
        const refused = lines.filter((line) => line.includes(SEND_REFUSED));
        const made = lines.filter((line) => line.includes(MADE_AGAIN));
        const putAway = lines.filter((line) => line.includes(PUT_AWAY));
        const problems = [];
        if (refused.length < 2) problems.push(`${refused.length} refusals logged, not 2`);
        if (made.length < 2) problems.push(`${made.length} times making versions again logged, not 2`);
        if (putAway.length !== 1) problems.push(`${putAway.length} times files were put away logged, not 1`);
        for (const words of [KEY, PUSHED_KEY, site, old, '.env', LATER_KEY, PUSHED_LATER, 'made-up-server']) {
          if ([...refused, ...made, ...putAway].some((line) => line.includes(words))) problems.push(`a log line holds ${words === KEY || words === PUSHED_KEY ? 'a made-up key' : `"${words}"`}`);
        }
        if (lines.some((line) => line.includes(KEY) || line.includes(PUSHED_KEY))) problems.push('the server log holds a made-up key');
        return fail(problems, `${refused.length} refusals, ${made.length} times making versions again and ${putAway.length} put away logged with counts only`);
      });
    } finally {
      await t.api(pat, 'DELETE', '/api/keys/github').catch(() => {});
      putBackOpenProjects();
      for (const dir of [site, old, infra]) fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
