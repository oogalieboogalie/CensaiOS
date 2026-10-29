// Local Sites, Places to Host and Run dev for two people. Pat Example fills
// in a made-up shop in Local Sites and Sam Example sees the same page. In
// Places to Host each screen makes its own fresh secrets; Sam never gets
// Pat's. Run dev is the computer owner's: Sam reads one plain sentence
// instead of a button that fails, the server refuses Sam's start, stop and
// keep-alive, and the refusal log line names the route and account only.
// The cloud runner has no Docker, so no real dev server runs here.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';

const SHOP = 'Made-up Bakery 164';
const SCRIPT = '<script>window.parent.__madeUpPwned = 164</script><img src=x onerror="window.parent.__madeUpPwned = 164"> made-up shop';
const OWNER_LINE = /only this computer.s owner can start or stop run dev/i;
const SECRET = /\b[0-9a-f]{64}\b/g;

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
  },
};
