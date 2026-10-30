// Files notices files added or deleted outside censaiOS. Pat Example opens a
// made-up project in Files and its docs folder; Sam Example's screen shows the
// same Files window and Sam opens docs too. Then, the way another program
// would (the computer's own file manager, say), a file is added and one
// deleted in the project and one added in docs: with nobody pressing
// anything, both screens catch up within a few seconds and docs stays open.
// A folder whose files were deleted says "Empty folder" and lists them again
// once they are put back. The project folder itself moved away says it is
// not there, is not asked about every few seconds, and lists again once it
// is back and each comes back to the window. Bug hunt: Files' catch-ups stay
// out of the server's log at info, where a person opening a folder still
// shows, stay a few requests every few seconds, and the log never names the
// folder. Red team: asking again
// gets Sam no more than opening a folder does: the project's hidden .git
// folder and a folder outside the open projects stay refused. The board's list of open
// projects is put back as the module found it. All files are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { addFromMenu } from '../addMenu.mjs';

// Files catches up every 5 seconds; a screen gets this long to show a change.
const CATCH_UP_WITHIN_MS = 12_000;
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

function write(file, words) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, words);
}

/** The made-up project: notes, a list to delete, docs with a plan, and a folder to empty. */
function madeUpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-project-'));
  write(path.join(dir, 'made-up-notes.md'), 'Made-up notes\n');
  write(path.join(dir, 'made-up-old-list.md'), 'Made-up list, soon deleted\n');
  write(path.join(dir, 'docs', 'made-up-plan.md'), 'Made-up plan\n');
  write(path.join(dir, 'made-up-picnic', 'made-up-menu.md'), 'Made-up menu\n');
  write(path.join(dir, '.git', 'made-up-config'), '[made-up]\n');
  return dir;
}

/** What one Files window lists on this screen: each row's name, and what its notes say. */
const listed = (page, id) => windowFrame(page, id).evaluate((el) => ({
  rows: [...el.querySelectorAll('span')].map((s) => s.textContent.trim()).filter((s) => /^\S+ \S/.test(s)).map((s) => s.replace(/^\S+ /, '')),
  notes: [...el.querySelectorAll('[data-testid="tree-folder-note"]')].map((n) => n.textContent.trim()),
})).catch(() => ({ rows: [], notes: [] }));

/** Waits, pressing nothing, until `ok(list)` holds on this screen; how long it took in ms, or null. */
async function caughtUp(page, id, ok, within = CATCH_UP_WITHIN_MS) {
  const start = Date.now();
  while (Date.now() - start < within) {
    if (ok(await listed(page, id))) return Date.now() - start;
    await page.waitForTimeout(200);
  }
  return null;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const soon = (ms) => (ms < 500 ? 'at once' : `in ${seconds(ms)}`);

/** Pat's and Sam's Files windows in one picture, Pat on the left. */
async function bothWindows(t, id, title, shot) {
  const [a, b] = await Promise.all([t.pat.page, t.sam.page].map((p) => windowFrame(p, id).screenshot({ type: 'png' })));
  const view = await t.browser.newPage({ viewport: { width: 1240, height: 700 } });
  const img = (buf, who) => `<figure><figcaption>${who}</figcaption><img src="data:image/png;base64,${buf.toString('base64')}"></figure>`;
  await view.setContent(`<style>body{margin:0;display:flex;gap:16px;padding:16px;background:gray;font:14px sans-serif}
    figure{margin:0;flex:1}img{width:100%;display:block}figcaption{padding:4px 0}</style>${img(a, "Pat's screen")}${img(b, "Sam's screen")}`);
  await shot(view, title);
  await view.close();
}

/** Clicks a folder's row open (or shut) in this screen's Files window. */
async function clickFolder(page, id, name) {
  await windowFrame(page, id).locator('span', { hasText: new RegExp(`^\\S+ ${name}$`) }).first().click({ timeout: 5_000 });
}

/** Files' catch-ups this screen asks, from now on: a list of the folders asked about. */
function countCatchUps(page) {
  const asked = [];
  const note = (req) => {
    const url = new URL(req.url());
    if (url.pathname === '/api/files/relist') asked.push(url.searchParams.get('path'));
  };
  page.on('request', note);
  return { asked, stop: () => page.off('request', note) };
}

export default {
  id: 'filesCatchUp',
  label: 'Files notices files added or deleted outside censaiOS',
  async run(t) {
    const { pat, sam, check } = t;
    const people = [pat, sam];
    const putBackOpenProjects = keepOpenProjects();
    const dir = madeUpProject();
    const away = `${dir}-moved-away`;
    // The log never names a folder, so this module's request lines are the ones since it began.
    const logStart = t.serverLog().length;
    t.typed.push(path.basename(dir));
    let filesId = null;

    try {
      await check('walk', 'Pat opens a made-up project in Files and its docs folder; Sam\'s screen shows the same window and Sam opens docs too', async ({ shot }) => {
        const files = await addFromMenu(pat.page, 'Files');
        if (files.kind !== 'files') throw new Error(`the Add menu opened ${files.kind || 'nothing'}, not Files`);
        filesId = files.id;
        await updateWindow(pat.page, filesId, { x: 120, y: 60, w: 560, h: 600, width: 560, height: 600 });
        const pathBox = windowFrame(pat.page, filesId).locator('input[type="text"]').first();
        await pathBox.fill(dir);
        await pathBox.press('Enter');
        const problems = [];
        for (const p of people) {
          const shown = await caughtUp(p.page, filesId, (l) => l.rows.includes('made-up-notes.md') && l.rows.includes('docs'), 15_000);
          if (shown === null) { problems.push(`${p.who.name}'s Files does not list the project`); continue; }
          await clickFolder(p.page, filesId, 'docs');
          await clickFolder(p.page, filesId, 'made-up-picnic');
          // The pointer leaves the list, so its name tag on the other screen hides no row.
          await p.page.mouse.move(8, 8);
          if (await caughtUp(p.page, filesId, (l) => l.rows.includes('made-up-plan.md') && l.rows.includes('made-up-menu.md'), 10_000) === null) {
            problems.push(`${p.who.name}'s docs or made-up-picnic folder did not open`);
          }
        }
        await bothWindows(t, filesId, 'before-anything-changes', shot);
        if (problems.length) throw new Error(problems.join('; '));
        return 'both screens list the project with docs and made-up-picnic open';
      });

      await check('walk', 'a file added and one deleted outside censaiOS, and one added in docs, show on both screens without anyone pressing anything, docs still open', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        write(path.join(dir, 'made-up-new-list.md'), 'Made-up list, added outside\n');
        fs.rmSync(path.join(dir, 'made-up-old-list.md'));
        write(path.join(dir, 'docs', 'made-up-later.md'), 'Made-up later plan\n');
        const ok = (l) => l.rows.includes('made-up-new-list.md') && !l.rows.includes('made-up-old-list.md')
          && l.rows.includes('made-up-later.md') && l.rows.includes('made-up-plan.md');
        const took = await Promise.all(people.map((p) => caughtUp(p.page, filesId, ok)));
        await bothWindows(t, filesId, 'after-changes-outside', shot);
        const late = people.filter((_, i) => took[i] === null).map((p) => p.who.name);
        if (late.length) {
          const seen = await listed(late[0] === pat.who.name ? pat.page : sam.page, filesId);
          throw new Error(`${late.join(' and ')}'s Files did not catch up within ${seconds(CATCH_UP_WITHIN_MS)}; it lists ${seen.rows.join(', ')}`);
        }
        return `Pat's screen caught up in ${seconds(took[0])} and Sam's in ${seconds(took[1])}, docs still open on both`;
      });

      await check('walk', 'a folder whose files were deleted outside says "Empty folder", and lists them again once they are put back', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        const menu = path.join(dir, 'made-up-picnic', 'made-up-menu.md');
        fs.rmSync(menu);
        const emptied = await Promise.all(people.map((p) => caughtUp(p.page, filesId, (l) => !l.rows.includes('made-up-menu.md') && l.notes.includes('Empty folder'))));
        await bothWindows(t, filesId, 'picnic-folder-emptied', shot);
        write(menu, 'Made-up menu, put back\n');
        const back = await Promise.all(people.map((p) => caughtUp(p.page, filesId, (l) => l.rows.includes('made-up-menu.md') && !l.notes.includes('Empty folder'))));
        await bothWindows(t, filesId, 'picnic-files-put-back', shot);
        const problems = [];
        people.forEach((p, i) => {
          if (emptied[i] === null) problems.push(`${p.who.name}'s screen never said "Empty folder"`);
          if (back[i] === null) problems.push(`${p.who.name}'s screen did not list the file put back`);
        });
        if (problems.length) throw new Error(problems.join('; '));
        return `"Empty folder" in ${seconds(emptied[0])} (Pat) and ${seconds(emptied[1])} (Sam); the file back in ${seconds(back[0])} and ${seconds(back[1])}`;
      });

      await check('walk', 'the project folder moved away outside says it is not there, is not asked about every few seconds, and lists again once it is back and each comes back to the window', async ({ shot }) => {
        if (!filesId) throw new Error('Files did not open in the first step');
        fs.renameSync(dir, away);
        const gone = await Promise.all(people.map((p) => caughtUp(p.page, filesId, (l) => l.notes.some((n) => n.startsWith("This folder doesn't exist")) && !l.rows.includes('made-up-notes.md'))));
        await bothWindows(t, filesId, 'project-folder-moved-away', shot);
        const problems = [];
        people.forEach((p, i) => { if (gone[i] === null) problems.push(`${p.who.name}'s screen still lists the project or does not say it is gone`); });

        // For the next 12 seconds (two catch-ups and more) nobody asks about it again.
        const counts = people.map((p) => countCatchUps(p.page));
        await pat.page.waitForTimeout(12_000);
        counts.forEach((c) => c.stop());
        people.forEach((p, i) => {
          const again = counts[i].asked.filter((a) => a === dir).length;
          if (again) problems.push(`${p.who.name}'s screen asked about the missing folder ${again} more times`);
        });

        fs.renameSync(away, dir);
        // Each works in another window for a moment, then comes back to Files.
        const other = await spawnWindow(pat.page, 'idea', {}, { x: 900, y: 420 }, { w: 320, h: 220 });
        await sam.page.waitForFunction((id) => window.__e2eStore.getState().wins.some((w) => w.id === id), other, { timeout: 10_000 });
        const back = [];
        for (const p of people) {
          for (const id of [other, filesId]) {
            await windowFrame(p.page, id).locator('.hb-win-header').first().click({ timeout: 5_000 });
            const active = await p.page.evaluate(() => window.__e2eStore.getState().activeId);
            if (active !== id) problems.push(`clicking a title bar on ${p.who.name}'s screen did not make that window the one in use`);
          }
          await p.page.mouse.move(8, 8);
          back.push(await caughtUp(p.page, filesId, (l) => l.rows.includes('made-up-notes.md') && l.notes.length === 0, 5_000));
        }
        await bothWindows(t, filesId, 'project-folder-back-after-using-files', shot);
        people.forEach((p, i) => { if (back[i] === null) problems.push(`${p.who.name}'s Files did not list the project again after using the window`); });
        if (problems.length) throw new Error(problems.join('; '));
        return `both screens said it was gone (in ${seconds(gone[0])} and ${seconds(gone[1])}), asked nothing more for 12 s, and listed it again ${soon(back[0])} (Pat) and ${soon(back[1])} (Sam) once each came back to the window`;
      });

      await check('hunt', 'Files\' catch-ups stay out of the server\'s log at info, where a person opening a folder still shows, are a few requests every few seconds, and the log never names the folder', async () => {
        // The project moving away closed docs and made-up-picnic; Pat opens them again.
        const now = await listed(pat.page, filesId);
        if (!now.rows.includes('made-up-plan.md')) await clickFolder(pat.page, filesId, 'docs');
        if (!now.rows.includes('made-up-menu.md')) await clickFolder(pat.page, filesId, 'made-up-picnic');
        await pat.page.mouse.move(8, 8);
        if (await caughtUp(pat.page, filesId, (l) => l.rows.includes('made-up-plan.md') && l.rows.includes('made-up-menu.md'), 10_000) === null) {
          throw new Error("Pat's docs or made-up-picnic folder did not open again");
        }
        const counts = countCatchUps(pat.page);
        await pat.page.waitForTimeout(15_000);
        counts.stop();
        const added = t.serverLog().slice(logStart).split('\n');
        const lines = added.filter((line) => line.includes('[http]'));
        const relist = lines.filter((line) => line.includes('GET /api/files/relist'));
        const loud = relist.filter((line) => !/\bDEBUG\b/.test(line) && !/ (40[34]) /.test(line));
        const opened = lines.filter((line) => line.includes('GET /api/files/browse') && /\bINFO\b/.test(line));
        const named = added.filter((line) => line.includes(path.basename(dir)));
        const problems = [];
        if (named.length) problems.push(`${named.length} log lines name the made-up project's folder, e.g. ${named[0].slice(0, 120)}`);
        if (!relist.length) problems.push('no catch-up is in the server\'s log at all, so the check cannot tell');
        if (loud.length) problems.push(`${loud.length} answered catch-ups are logged above debug, e.g. ${loud[0].slice(0, 120)}`);
        if (!opened.length) problems.push('a person opening the folder is not in the log at info');
        // Pat's window shows three open folders (the project, docs and made-up-picnic), each
        // asked every 5 seconds: about 9 times in 15 s, each folder at least twice; more than
        // 12 would be asking on top of that.
        const each = [path.basename(dir), 'docs', 'made-up-picnic'].map((name) => counts.asked.filter((a) => path.basename(a) === name).length);
        if (each.some((n) => n < 2)) problems.push(`not every open folder was caught up twice in 15 s (project, docs, made-up-picnic: ${each.join(', ')})`);
        if (counts.asked.length > 12) problems.push(`Pat's screen asked ${counts.asked.length} times in 15 s`);
        if (problems.length) throw new Error(problems.join('; '));
        return `${relist.length} catch-ups logged at debug, ${opened.length} folder openings at info; Pat's screen asked ${counts.asked.length} times in 15 s for its three open folders (${each.join(', ')})`;
      });

      await check('redteam', 'asking again gets Sam no more than opening a folder does: the hidden .git folder and a folder outside the open projects stay refused', async () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-elsewhere-'));
        write(path.join(outside, 'made-up-outside.md'), 'Made-up words outside the project\n');
        const problems = [];
        try {
          for (const folder of [path.join(dir, '.git'), outside]) {
            const q = `?path=${encodeURIComponent(folder)}`;
            const [opened, again] = [await t.api(sam, 'GET', `/api/files/browse${q}`), await t.api(sam, 'GET', `/api/files/relist${q}`)];
            const what = folder === outside ? 'a folder outside the open projects' : 'the project\'s .git folder';
            if (again.status !== 403) problems.push(`asking again about ${what} got Sam ${again.status}, not 403`);
            if (again.status !== opened.status || JSON.stringify(again.body) !== JSON.stringify(opened.body)) problems.push(`asking again about ${what} answered Sam differently from opening it`);
            if (/made-up-config|made-up-outside/.test(again.text || '')) problems.push(`asking again about ${what} showed Sam what is inside`);
          }
        } finally {
          fs.rmSync(outside, { recursive: true, force: true });
        }
        if (problems.length) throw new Error(problems.join('; '));
        return 'both refused with 403, the same answer as opening them, naming nothing inside';
      });
    } finally {
      putBackOpenProjects();
      for (const folder of [dir, away]) fs.rmSync(folder, { recursive: true, force: true });
    }
  },
};
