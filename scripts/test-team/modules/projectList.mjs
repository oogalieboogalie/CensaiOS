// The list of every project on this computer is its owner's. Pat Example owns
// the computer and Sam Example is a teammate on Pat's board. Pat makes a
// made-up shop site the board's default, the board gives its agents made-up
// garden plans, and Pat has made-up pricing plans that are on no board (as
// when one of Pat's agents opens a project off a board). Walk: Pat and Sam
// open the File menu: Pat's project picker lists all three; Sam's lists the
// shop site and the garden plans, not the pricing plans. Pat opens the
// Scheduler from Add: on Sam's screen its Project picker offers the same two,
// on Pat's all three. Red team: Sam's own list of projects names nothing of
// the pricing plans (its name, folder, GitHub repo or summary), and Sam's
// current project is the board's default, open on the board; Pat's list holds
// all three. The board's default and open projects are put back as the module
// found them, and the made-up projects and folders are removed. All people,
// projects and words are made up.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openBoard, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { ROOT } from '../../e2e/runner.mjs';
import { addFromMenu } from '../addMenu.mjs';

// censaiOS's own folder of state, where it keeps the board's default project
// and its open projects (server/routes/projects/shared.js), so the module can put them back.
const STATE_DIR = process.env.CENSAI_STATE_DIR ? path.resolve(process.env.CENSAI_STATE_DIR) : path.join(ROOT, '.homebase-state');
const DEFAULT_PROJECT = path.join(STATE_DIR, 'current-project.json');
const OPEN_PROJECTS = path.join(STATE_DIR, 'open-projects.json');

const SHOP = 'made-up-shop-site';
const GARDEN = { id: 'made-up-garden-plans', name: 'Made-up garden plans', summary: 'Made-up: what the garden board plans to plant' };
const PRICING = { id: 'made-up-pricing-plans', name: 'Made-up pricing plans', repo: 'made-up-owner/made-up-pricing', summary: "Made-up: Pat's pricing notes for next spring" };

/** Returns a function that puts the board's default project and open projects back as they are now. */
function keepProjects() {
  const kept = [DEFAULT_PROJECT, OPEN_PROJECTS].map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null]);
  return () => kept.forEach(([file, was]) => (was === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, was)));
}

async function withDb(t, fn) {
  const { default: pg } = await import('pg');
  const db = new pg.Client({ connectionString: t.databaseUrl });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** The choices one project picker offers on this screen, once it has loaded the shop site (15 s at most). */
async function choices(picker, page) {
  const words = () => picker.locator('option').allTextContents().catch(() => []);
  const end = Date.now() + 15_000;
  let seen = await words();
  while (!seen.some((w) => w.includes(SHOP)) && Date.now() < end) {
    await page.waitForTimeout(250);
    seen = await words();
  }
  // A closed picker shows one choice; for the picture it opens as a list.
  await picker.evaluate((el) => { el.size = Math.min(el.options.length, 6); }).catch(() => {});
  return seen;
}

/** Pat's and Sam's copies of one part of the screen in one picture, Pat on the left. */
async function bothScreens(t, [patPart, samPart], title, shot) {
  const [a, b] = await Promise.all([patPart, samPart].map((part) => part.screenshot({ type: 'png' })));
  const view = await t.browser.newPage({ viewport: { width: 1240, height: 700 } });
  const img = (buf, who) => `<figure><figcaption>${who}</figcaption><img src="data:image/png;base64,${buf.toString('base64')}"></figure>`;
  await view.setContent(`<style>body{margin:0;display:flex;gap:16px;padding:16px;background:gray;font:14px sans-serif}
    figure{margin:0;flex:1}img{max-width:100%;display:block}figcaption{padding:4px 0}</style>${img(a, "Pat's screen")}${img(b, "Sam's screen")}`);
  await shot(view, title);
  await view.close();
}

/** What one person's choices show that they should not, or what they miss. */
function problemsIn(who, seen, { has, hasNot }) {
  const problems = [];
  for (const name of has) if (!seen.some((w) => w.includes(name))) problems.push(`${who}'s picker does not offer ${name}`);
  for (const word of hasNot) if (seen.some((w) => w.includes(word))) problems.push(`${who}'s picker offers ${word}`);
  return problems;
}

export default {
  id: 'projectList',
  label: "The list of every project on this computer is its owner's",
  async run(t) {
    const { pat, sam, check } = t;
    const putBack = keepProjects();
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-team-projects-')));
    const folder = (name) => path.join(home, name);
    const offBoard = [PRICING.name, folder(PRICING.id), PRICING.repo, PRICING.summary];
    t.typed.push(GARDEN.summary, PRICING.summary);
    let schedulerId = null;

    try {
      for (const name of [SHOP, GARDEN.id, PRICING.id]) fs.mkdirSync(folder(name));
      // No project open on the board, then Pat makes the shop site its default.
      fs.rmSync(DEFAULT_PROJECT, { force: true });
      fs.rmSync(OPEN_PROJECTS, { force: true });
      const opened = await t.api(pat, 'PUT', '/api/current-project', { path: folder(SHOP) });
      if (opened.status !== 200) throw new Error(`Pat could not make the shop site the board's default (${opened.status})`);
      await withDb(t, async (db) => {
        for (const p of [GARDEN, PRICING]) {
          await db.query(
            `INSERT INTO projects (id, owner_agent_id, name, path, repo, summary) VALUES ($1, 'architect', $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET path = EXCLUDED.path, updated_at = NOW()`,
            [p.id, p.name, folder(p.id), p.repo || null, p.summary]
          );
        }
        // The board gives its agents the garden plans, as a board does when one of its agent windows is given a project.
        await db.query(
          `INSERT INTO workspace_agent_projects (workspace_id, project_id, agent_id, permission, source_kind, source_id)
           VALUES ($1, $2, 'architect', 'read', 'manual', $1) ON CONFLICT DO NOTHING`,
          [t.workspaceId, GARDEN.id]
        );
      });
      // Both screens load the board again, with the shop site as its default.
      await Promise.all([pat, sam].map((p) => openBoard(p.page, t.workspaceId, t.web)));

      await check('walk', "Pat and Sam open the File menu: Pat's project picker lists the shop site, the garden plans and the pricing plans; Sam's lists the shop site open on the board and the garden plans the board gives its agents, not Pat's pricing plans", async ({ shot }) => {
        const seen = {};
        const menus = [];
        for (const [who, p] of [['Pat', pat], ['Sam', sam]]) {
          await p.page.locator('button[title="File menu"]').click({ timeout: 10_000 });
          const menu = p.page.locator('.hb-glass', { hasText: 'Default for new windows' }).last();
          await menu.waitFor({ timeout: 10_000 });
          seen[who] = await choices(menu.locator('select').first(), p.page);
          menus.push(menu);
        }
        await bothScreens(t, menus, 'file-menu-project-pickers', shot);
        await Promise.all([pat, sam].map((p) => p.page.keyboard.press('Escape')));
        const problems = [
          ...problemsIn('Pat', seen.Pat, { has: [SHOP, GARDEN.name, PRICING.name], hasNot: [] }),
          ...problemsIn('Sam', seen.Sam, { has: [SHOP, GARDEN.name], hasNot: offBoard }),
        ];
        if (problems.length) throw new Error(problems.join('; '));
        return `Pat's picker offers all three; Sam's offers ${seen.Sam.filter((w) => !w.startsWith('--')).length} (the shop site and the garden plans), not the pricing plans`;
      });

      await check('walk', "Pat opens the Scheduler from Add: on Sam's screen its Project picker offers the shop site and the garden plans, not Pat's pricing plans; on Pat's screen it offers all three", async ({ shot }) => {
        const win = await addFromMenu(pat.page, 'Scheduler');
        if (win.kind !== 'scheduler') throw new Error(`the Add menu opened ${win.kind || 'nothing'}, not the Scheduler`);
        schedulerId = win.id;
        await updateWindow(pat.page, schedulerId, { x: 40, y: 60, w: 760, h: 560, width: 760, height: 560 });
        await pat.page.waitForTimeout(800);
        const pickers = [pat, sam].map((p) => windowFrame(p.page, schedulerId).locator('select[aria-label="Project"]'));
        const seen = { Pat: await choices(pickers[0], pat.page), Sam: await choices(pickers[1], sam.page) };
        // The picture shows the picker with its Project label (src/components/scheduler/SchedulerProjectOptions.jsx).
        await bothScreens(t, pickers.map((picker) => picker.locator('xpath=../..')), 'scheduler-project-pickers', shot);
        const problems = [
          ...problemsIn('Pat', seen.Pat, { has: [SHOP, GARDEN.name, PRICING.name], hasNot: [] }),
          ...problemsIn('Sam', seen.Sam, { has: [SHOP, GARDEN.name], hasNot: offBoard }),
        ];
        if (problems.length) throw new Error(problems.join('; '));
        return `Pat's Scheduler offers all three; Sam's offers ${seen.Sam.length} (the shop site and the garden plans), not the pricing plans`;
      });

      await check('redteam', "Sam's own list of projects names nothing of Pat's pricing plans (its name, folder, GitHub repo or summary), and Sam's current project is the board's default, open on the board; Pat's list holds all three", async () => {
        const problems = [];
        const samList = await t.api(sam, 'GET', '/api/projects');
        const samNames = (samList.body?.projects || []).map((p) => p.name);
        if (samList.status !== 200) problems.push(`Sam's list answered ${samList.status}`);
        for (const name of [SHOP, GARDEN.name]) if (!samNames.includes(name)) problems.push(`Sam's list leaves out ${name}`);
        for (const word of offBoard) if (samList.text.includes(word)) problems.push(`Sam's list names ${word === PRICING.summary ? 'its summary' : word}`);
        const current = await t.api(sam, 'GET', '/api/current-project');
        if (String(current.body?.project?.path || '').replace(/[\\/]+$/, '') !== folder(SHOP)) problems.push(`Sam's current project is ${current.body?.project?.name || 'none'}, not the board's default`);
        const patList = await t.api(pat, 'GET', '/api/projects');
        const patNames = (patList.body?.projects || []).map((p) => p.name);
        for (const name of [SHOP, GARDEN.name, PRICING.name]) if (!patNames.includes(name)) problems.push(`Pat's list leaves out ${name}`);
        if (problems.length) throw new Error(problems.join('; '));
        return `Sam's list holds ${samNames.length} project(s), naming nothing of the pricing plans, and Sam's current project is the shop site; Pat's holds all three`;
      });
    } finally {
      putBack();
      await withDb(t, async (db) => {
        await db.query('DELETE FROM workspace_agent_projects WHERE project_id = $1', [GARDEN.id]);
        await db.query('DELETE FROM projects WHERE id = ANY($1) OR path = $2', [[GARDEN.id, PRICING.id], folder(SHOP)]);
      }).catch(() => {});
      fs.rmSync(home, { recursive: true, force: true });
    }
  },
};
