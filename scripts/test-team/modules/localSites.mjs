// Local Sites, Places to Host and Run dev for two people. Pat Example fills
// in a made-up shop in Local Sites and Sam Example sees the same page. In
// Places to Host each screen makes its own fresh secrets; Sam never gets
// Pat's. Run dev is the computer owner's: Sam reads one plain sentence
// instead of a button that fails, the server refuses Sam's start, stop and
// keep-alive, and the refusal log line names the route and account only.
// Where this machine's Docker already has Run dev's Node image, Pat runs a
// made-up folder for real and the server's log follows it by the folder's
// hash, never its name; anywhere else those two steps are "skip".

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note, skip } from '../report.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SHOP = 'Made-up Bakery 164';
const SCRIPT = '<script>window.parent.__madeUpPwned = 164</script><img src=x onerror="window.parent.__madeUpPwned = 164"> made-up shop';
const OWNER_LINE = /only this computer.s owner can start or stop run dev/i;
const SECRET = /\b[0-9a-f]{64}\b/g;
const RUN_DEV_IMAGE = 'node:22-bookworm-slim';
const run = promisify(execFile);

/** Whether this machine's Docker answers and already has Run dev's Node image (a download would take too long here). */
async function canRunDev() {
  try {
    await run('docker', ['image', 'inspect', RUN_DEV_IMAGE], { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

const devNameOf = (page, id) => page.evaluate((winId) => window.__e2eStore.getState().wins.find((w) => w.id === winId)?.devName || null, id);
const hashOf = (devName) => String(devName).slice(-10);

/** Removes a Run dev container and its packages volume, whatever state the walk left them in. */
async function removeRunDev(devName) {
  if (!devName) return;
  await run('docker', ['rm', '-f', devName], { timeout: 60_000 }).catch(() => {});
  await run('docker', ['volume', 'rm', `censai-dev-packages-${hashOf(devName)}`], { timeout: 60_000 }).catch(() => {});
}

function listen(page) {
  const bodies = [];
  page.on('response', async (res) => {
    try { bodies.push(await res.text()); } catch { /* streamed or gone */ }
  });
  return bodies;
}

async function previewText(page, id) {
  const frame = windowFrame(page, id).frameLocator('iframe[title="Website preview"]');
  return frame.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
}

async function nameField(page, id) {
  const field = windowFrame(page, id).locator('label.hb-ls-field', { hasText: 'Business name' }).locator('input');
  await field.waitFor({ timeout: 15_000 });
  return field;
}

async function waitText(page, id, words, ms = 15_000) {
  const until = Date.now() + ms;
  let text = '';
  while (Date.now() < until) {
    text = await previewText(page, id);
    if (text.includes(words)) return text;
    await page.waitForTimeout(300);
  }
  return text;
}

export default {
  id: 'localSites',
  label: 'Local Sites, Places to Host and Run dev for two people',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(SHOP, SCRIPT);
    const samHeard = listen(sam.page);
    let site;
    let dev;

    await check('walk', 'Pat names a made-up shop in Local Sites and Sam sees the same page', async ({ shot }) => {
      site = await spawnWindow(pat.page, 'localSites', { site: { preset: 'bakery' } }, { x: 40, y: 50 }, { w: 1080, h: 700 });
      const field = await nameField(pat.page, site);
      await field.fill(SHOP);
      const seen = await waitText(sam.page, site, SHOP);
      await shot(sam.page, 'sam-sees-pats-shop');
      if (!seen.includes(SHOP)) throw new Error(`Sam's preview shows "${seen.split('\n')[0].slice(0, 80)}"`);
      return `Sam's preview shows "${SHOP}"`;
    });

    await check('redteam', 'a script typed as the shop name shows as words and runs nowhere', async ({ shot }) => {
      if (!site) throw note('the Local Sites window never opened');
      await (await nameField(pat.page, site)).fill(SCRIPT);
      const seen = await waitText(sam.page, site, 'made-up shop');
      await sam.page.waitForTimeout(1000);
      await shot(sam.page, 'sam-sees-the-script-as-words');
      const problems = [];
      for (const [who, page] of [['Pat', pat.page], ['Sam', sam.page]]) {
        if (await page.evaluate(() => window.__madeUpPwned)) problems.push(`the script ran on ${who}'s screen`);
      }
      if (!seen.includes('<script>')) problems.push('Sam\'s preview does not show the script tag as words');
      if (problems.length) throw new Error(problems.join('; '));
      return 'both previews show the tags as plain words; nothing ran';
    });

    await check('redteam', 'Places to Host makes fresh secrets on each screen; Sam never gets Pat\'s', async ({ shot }) => {
      const host = await spawnWindow(pat.page, 'hosting', { target: 'railway' }, { x: 120, y: 90 }, { w: 900, h: 640 });
      const secretsOn = async (page) => {
        const frame = windowFrame(page, host);
        await frame.locator('pre.hb-host-code').first().waitFor({ timeout: 15_000 });
        return [...new Set((await frame.innerText()).match(SECRET) || [])];
      };
      const [patSecrets, samSecrets] = await Promise.all([secretsOn(pat.page), secretsOn(sam.page)]);
      await shot(sam.page, 'sam-sees-own-host-secrets');
      if (!patSecrets.length) throw note('Pat\'s Places to Host shows no secrets to compare');
      const board = await sam.page.evaluate((id) => JSON.stringify(window.__e2eStore.getState().wins.find((w) => w.id === id) || {}), host);
      const leaked = patSecrets.filter((s) => samSecrets.includes(s) || board.includes(s) || samHeard.some((b) => b.includes(s)));
      await pat.page.evaluate((id) => window.__e2eStore.getState().onClose?.(id), host).catch(() => {});
      if (leaked.length) throw new Error(`${leaked.length} of Pat's secrets reached Sam`);
      return `Pat's screen made ${patSecrets.length} secrets and Sam's ${samSecrets.length} of its own; none of Pat's are on Sam's screen, on the board or in Sam's answers`;
    });

    await check('walk', 'Sam opens Run dev and reads that only the owner can start or stop it', async ({ shot }) => {
      dev = await spawnWindow(pat.page, 'devServer', {}, { x: 200, y: 120 }, { w: 768, h: 528 });
      const samLine = windowFrame(sam.page, dev).getByText(OWNER_LINE);
      await samLine.first().waitFor({ timeout: 15_000 }).catch(() => {});
      await shot(sam.page, 'sam-reads-owner-only');
      const patSees = await windowFrame(pat.page, dev).getByText(OWNER_LINE).count();
      const samButton = await windowFrame(sam.page, dev).getByRole('button', { name: /^Run dev$/ }).count();
      const problems = [];
      if (!(await samLine.count())) problems.push('Sam does not read the owner-only sentence');
      if (samButton) problems.push('Sam still has a Run dev button');
      if (patSees) problems.push('Pat, the owner, is told only the owner can start it');
      if (problems.length) throw new Error(problems.join('; '));
      return 'Sam reads "Only this computer\'s owner can start or stop Run dev. You can watch it here." and has no button; Pat is not told that';
    });

    await check('redteam', 'the server refuses Sam\'s start, stop and keep-alive, and logs only route and account', async () => {
      const tries = [
        ['POST', '/api/dev-servers', { folder: '/tmp/made-up-site' }],
        ['DELETE', '/api/dev-servers/censai-dev-made-up-164'],
        ['POST', '/api/dev-servers/heartbeat', { names: ['censai-dev-made-up-164'] }],
      ];
      const answers = [];
      for (const [method, url, data] of tries) answers.push([`${method} ${url.replace('/api/', '')}`, (await t.api(sam, method, url, data)).status]);
      const pats = await t.api(pat, 'POST', '/api/dev-servers/heartbeat', { names: [] });
      const said = answers.map(([what, status]) => `${what} ${status}`).join(', ');
      if (answers.some(([, status]) => status !== 403)) throw new Error(`not all refused: ${said}`);
      if (pats.status === 403) throw new Error('Pat, the owner, was refused too');
      const lines = t.serverLog().split('\n').filter((line) => line.includes('refused') && line.includes('/api/dev-servers'));
      if (!lines.length) throw note(`refused (${said}) but no refusal line in the server log`);
      if (!lines.every((line) => /for account \d+: not the owner/.test(line))) throw new Error('a refusal line has no account number');
      if (lines.some((line) => /Example|example\.com|made-up/.test(line))) throw new Error('a refusal line carries a name or what was sent');
      return `refused (${said}); Pat's keep-alive answered ${pats.status}; ${lines.length} log lines like "${lines[0].replace(/^.*?refused/, 'refused')}"`;
    });

    let folder = null;
    let devName = null;
    let logStart = 0;
    try {
      await check('walk', 'Pat runs a made-up folder in Run dev, both screens show it running, then Pat stops it', async ({ shot }) => {
        if (!(await canRunDev())) throw skip(`no Docker engine with ${RUN_DEV_IMAGE} on this machine`);
        folder = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-garden-plans-'));
        fs.writeFileSync(path.join(folder, 'index.html'), '<h1>Made-up garden plans</h1>\n');
        t.typed.push(folder);
        logStart = t.serverLog().length;
        if (!dev) dev = await spawnWindow(pat.page, 'devServer', {}, { x: 200, y: 120 }, { w: 768, h: 528 });
        const frame = windowFrame(pat.page, dev);
        await frame.getByLabel('Project folder').fill(folder);
        await frame.getByRole('button', { name: /^Run dev$/ }).click();
        await pat.page.waitForFunction((id) => window.__e2eStore.getState().wins.find((w) => w.id === id)?.devName, dev, { timeout: 15_000 });
        devName = await devNameOf(pat.page, dev);
        const running = (page) => windowFrame(page, dev).getByText(/^Running at/).first().waitFor({ timeout: 90_000 });
        await Promise.all([running(pat.page), running(sam.page)]);
        // The site's Browser window opening moves Pat's view to it; look back at Run dev.
        await Promise.all([pat, sam].map((p) => p.page.evaluate(() => window.__e2eStore.getState().setPan?.({ x: 0, y: 0 }))));
        await Promise.all([pat, sam].map((p) => p.page.mouse.move(8, 8)));
        await pat.page.waitForTimeout(500);
        await sideBySide(t, 'both-screens-show-run-dev-running', shot);
        await frame.getByRole('button', { name: 'Stop and remove the container' }).click();
        await pat.page.waitForFunction((id) => !window.__e2eStore.getState().wins.find((w) => w.id === id)?.devName, dev, { timeout: 30_000 });
        const left = (await run('docker', ['ps', '-aq', '--filter', `name=^/${devName}$`])).stdout.trim();
        if (left) throw new Error('Docker still has the container after Stop');
        return 'the made-up folder ran until Pat pressed Stop, both screens showed it running, and Docker no longer has its container';
      });

      await check('redteam', "the server's log follows Run dev by the folder's hash and never names the folder", async () => {
        if (!devName) throw skip('Run dev did not run here');
        const added = t.serverLog().slice(logStart).split('\n');
        const followed = added.filter((line) => line.includes('[http]') && line.includes(`censai-dev-[redacted]-${hashOf(devName)}`));
        const base = path.basename(folder).toLowerCase();
        const naming = added.filter((line) => line.toLowerCase().includes(base));
        const problems = [];
        if (!followed.length) problems.push('no log line follows the Run dev container by its hash');
        if (naming.length) problems.push(`${naming.length} log lines name the made-up folder, e.g. "${naming[0].replace(/^\S+\s+/, '').slice(0, 140)}"`);
        if (problems.length) throw new Error(problems.join('; '));
        return `${followed.length} Run dev requests logged by the folder's hash, none naming the folder, e.g. "${followed.at(-1).replace(/^.*\[http\]\s*/, '').slice(0, 100)}"`;
      });
    } finally {
      await removeRunDev(devName);
      if (folder) fs.rmSync(folder, { recursive: true, force: true });
    }
  },
};
