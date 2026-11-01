// The Market for two: Pat Example (the owner) publishes a made-up module and
// sees it listed; Sam Example (a teammate) finds it, adds a copy to the board
// and uses it. Bug hunt: Sam tries to publish or remove Pat's listing, a
// listing whose one line holds a script tag, and an empty listing. What is
// Sam also reads plainly what the Market does not do yet. All made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';

const NAME = 'Made-up Seed Counter';
const LINE = 'Counts made-up seeds with one button';
const SOURCE = `<div style="color: var(--ink); padding: 12px; font: 14px sans-serif">
<h3 style="color: var(--accent); margin: 0 0 8px">Made-up seed counter</h3>
<button id="add" style="background: var(--surface-2); color: var(--ink); border: 1px solid var(--hairline); padding: 6px 12px">Add a seed</button>
<p id="count">0 seeds</p>
<script>let n = 0; document.getElementById('add').onclick = () => { n += 1; document.getElementById('count').textContent = n + ' seeds'; };</script>
</div>`;
const MANIFEST = { name: NAME, description: LINE, icon: 'Toolbox', size: { w: 360, h: 240 }, permissions: [] };
const moduleProps = () => ({
  status: 'ready', request: 'a made-up seed counter', title: NAME, manifest: MANIFEST, source: SOURCE,
  versions: [{ source: SOURCE, manifest: MANIFEST, note: 'Made up for the test team', by: '', at: new Date().toISOString() }], versionIndex: 0,
});

const card = (page, mid, listingId) => windowFrame(page, mid).locator(`[data-testid="marketplace-listing-${listingId}"]`);
const moduleWins = (page) => page.evaluate((name) => window.__e2eStore.getState().wins
  .filter((w) => w.kind === 'module' && w.manifest?.name === name).map((w) => w.id), NAME);

export default {
  id: 'marketplace',
  label: 'Market',
  async run(t) {
    const { pat, sam, check } = t;
    let modId; let listingId; let market;

    await check('walk', 'Pat publishes a made-up module to the Market', async ({ shot }) => {
      modId = await spawnWindow(pat.page, 'module', moduleProps(), { x: 60, y: 70 }, { w: 520, h: 420 });
      await windowFrame(pat.page, modId).locator('iframe[data-module-frame]').waitFor({ state: 'visible', timeout: 20_000 });
      await windowFrame(pat.page, modId).locator('button[data-window-control="menu"]').click();
      await pat.page.getByRole('menuitem', { name: 'Publish to marketplace' }).click()
        .catch(() => { throw new Error('the owner has no "Publish to marketplace" in the module\'s menu'); });
      const sheet = windowFrame(pat.page, modId).locator('[data-module-sheet="publish"]');
      await sheet.locator('[data-module-score]').filter({ hasText: /passed/ }).waitFor({ timeout: 15_000 });
      await shot(pat.page, 'pat-sees-the-checks-before-publishing');
      await sheet.getByRole('button', { name: 'Publish', exact: true }).click();
      await sheet.locator('[data-module-listed]').waitFor({ timeout: 15_000 })
        .catch(async () => { throw new Error(`publishing did not finish: ${(await sheet.innerText()).replace(/\s+/g, ' ').slice(0, 200)}`); });
      listingId = (await readWindow(pat.page, modId))?.listingId;
      if (!listingId) throw new Error('the module says it is listed but its window has no listing id');
      await sheet.getByRole('button', { name: 'Done' }).click();
      // Before the fix an older module read "Changed since listing" the moment it was published.
      const subtitle = windowFrame(pat.page, modId).locator('.hb-win-subtitle');
      await subtitle.filter({ hasText: /^Listed$/ }).waitFor({ timeout: 5000 })
        .catch(async () => { throw new Error(`just published, the module's title says "${await subtitle.innerText().catch(() => '')}"`); });
      await shot(pat.page, 'pat-published-the-module');
      return 'the checks ran, Pat pressed Publish, the module is listed and its title says Listed';
    });

    await check('walk', 'Pat sees the listing in the Market', async ({ shot }) => {
      await pat.page.keyboard.press('Escape');
      market = await spawnWindow(pat.page, 'marketplace', {}, { x: 600, y: 70 }, { w: 620, h: 420 });
      await card(pat.page, market, listingId).waitFor({ state: 'visible', timeout: 15_000 });
      const text = await card(pat.page, market, listingId).innerText();
      if (!text.includes(NAME) || !text.includes(LINE)) throw new Error(`the listing shows "${text.replace(/\s+/g, ' ').slice(0, 120)}"`);
      // Before the fix this module, which never goes online, said "Asks for the internet and the internet".
      if (/internet/i.test(text)) throw new Error('the listing says the module uses the internet, and it does not');
      await shot(pat.page, 'pat-sees-the-listing');
      return `the Market lists "${NAME}" with its one line, checks and "Free"`;
    });

    await check('walk', 'Sam finds it and adds a copy to the board, and it works', async ({ shot }) => {
      // The Market window is on the shared board, but each person's list loads from the server for them.
      await card(sam.page, market, listingId).waitFor({ state: 'visible', timeout: 15_000 });
      const before = await moduleWins(sam.page);
      await card(sam.page, market, listingId).getByRole('button', { name: 'Add to board' }).click();
      let copy = null;
      const until = Date.now() + 15_000;
      while (!copy && Date.now() < until) {
        copy = (await moduleWins(sam.page)).find((id) => !before.includes(id)) || null;
        if (!copy) await sam.page.waitForTimeout(300);
      }
      if (!copy) throw new Error('Sam pressed Add to board but no copy opened');
      const frame = windowFrame(sam.page, copy).frameLocator('iframe[data-module-frame]');
      await frame.getByRole('button', { name: 'Add a seed' }).click({ timeout: 15_000 });
      await frame.getByRole('button', { name: 'Add a seed' }).click();
      await frame.getByText('2 seeds').waitFor({ timeout: 5000 })
        .catch(() => { throw new Error('the copy opened but its button does nothing'); });
      await shot(sam.page, 'sams-copy-works');
      return 'Sam\'s copy opened on the board and counts 2 seeds after two presses';
    });

    await check('redteam', 'Sam cannot publish or remove Pat\'s listing', async () => {
      const publish = await t.api(sam, 'POST', '/api/marketplace/modules', { manifest: { ...MANIFEST, name: 'Made-up Sam Copy' }, source: SOURCE, summary: LINE, request: 'x' });
      if (publish.status < 400) throw new Error(`a teammate could publish (status ${publish.status})`);
      const remove = await t.api(sam, 'DELETE', `/api/marketplace/modules/${listingId}`);
      const still = await t.api(sam, 'GET', '/api/marketplace/modules');
      const listed = (still.body?.listings || []).some((l) => l.id === listingId);
      if (remove.body?.removed || !listed) throw new Error('Sam removed Pat\'s listing');
      return `publish refused (${publish.status}), remove did nothing, the listing is still there`;
    });

    await check('hunt', 'a listing line with a script tag shows as plain words', async ({ shot }) => {
      const line = '<script>window.__marketHit = 1</script> Made-up line with a tag';
      t.typed.push(line);
      const made = await t.api(pat, 'POST', '/api/marketplace/modules', {
        manifest: { ...MANIFEST, name: 'Made-up Tag Test', description: line }, source: SOURCE, summary: line, request: 'a made-up tag test',
      });
      if (made.status >= 400) throw note(`the server refused the listing (${made.status}), so nothing reaches Sam`);
      const tagId = made.body?.listing?.id;
      const fresh = await spawnWindow(sam.page, 'marketplace', {}, { x: 640, y: 120 }, { w: 620, h: 420 });
      await card(sam.page, fresh, tagId).waitFor({ state: 'visible', timeout: 15_000 });
      const text = await card(sam.page, fresh, tagId).innerText();
      const ran = await sam.page.evaluate(() => window.__marketHit === 1);
      await shot(sam.page, 'a-listing-line-with-a-tag');
      await t.api(pat, 'DELETE', `/api/marketplace/modules/${tagId}`);
      if (ran) throw new Error('the script in the listing ran on Sam\'s screen');
      if (!text.includes('<script>')) throw new Error('the tag was hidden instead of shown as words');
      return 'Sam sees the tag as plain words and nothing ran';
    });

    await check('hunt', 'an empty listing is refused', async () => {
      const empty = await t.api(pat, 'POST', '/api/marketplace/modules', { manifest: {}, source: '', summary: '', request: '' });
      if (empty.status < 400) throw new Error(`an empty listing was accepted (status ${empty.status})`);
      return `refused with "${empty.body?.error}"`;
    });

    await check('walk', 'Sam reads plainly what the Market does not do yet', async ({ shot }) => {
      const mine = await spawnWindow(sam.page, 'marketplace', {}, { x: 60, y: 60 }, { w: 620, h: 420 });
      const frame = windowFrame(sam.page, mine);
      await frame.getByTestId('marketplace-not-seller').waitFor({ timeout: 15_000 }).catch(() => {});
      const top = await frame.getByTestId('marketplace-not-yet').innerText().catch(() => '');
      await shot(sam.page, 'sam-reads-what-is-not-on-yet');
      const tabs = [];
      for (const tab of ['window', 'integration', 'theme']) {
        await frame.getByTestId(`marketplace-tab-${tab}`).click();
        tabs.push(await frame.getByTestId('marketplace-tab-note').innerText().catch(() => ''));
      }
      const patSees = await windowFrame(pat.page, market).getByTestId('marketplace-not-seller').count();
      const problems = [];
      if (!/Paid listings are not on yet/.test(top)) problems.push('no "Paid listings are not on yet" line');
      if (!/Only the owner of this censaiOS can publish/.test(top)) problems.push('no sentence saying who may publish');
      if (tabs.some((line) => !/built-in windows/.test(line))) problems.push(`a tab has no line: ${JSON.stringify(tabs)}`);
      if (patSees) problems.push('Pat (the owner) is told only the owner can publish');
      if (problems.length) throw new Error(problems.join('; '));
      return `Sam reads "${top.replace(/\s+/g, ' ').trim()}"; each opt-in tab says it only switches built-in windows`;
    });
  },
};
