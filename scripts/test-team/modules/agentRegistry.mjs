// Agents finding and asking each other: Pat opens the agent registry, puts
// Atlas and Nexus chats on the board, and asks Atlas to find someone who
// knows databases. Atlas (the stand-in model, using the agent network tools)
// finds Nexus, asks it, and the answer comes back with a delivered help card
// on the board; Sam sees the exchange. Then the wrong things: asking a
// window that does not exist, an agent asking itself, Sam using Pat's
// private agent card. Red team: signed out, and the board-help log lines.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { STANDIN_ANSWER } from '../standinModel.mjs';
import { TEAM_ASK } from '../standinTeamAsk.mjs';

const answers = (msgs, prefix) => (msgs || []).filter((m) => String(m.text || '').startsWith(prefix));

/** Pat writes to Atlas and waits for Atlas's next report (the earlier ones do not count). */
async function askAtlas(page, id, text, prefix = 'Made-up team answer', ms = 60_000) {
  const before = answers((await readWindow(page, id))?.msgs, prefix).length;
  const box = windowFrame(page, id).getByPlaceholder(/^Message /).first();
  await box.fill(text);
  await box.press('Enter');
  const until = Date.now() + ms;
  for (;;) {
    const found = answers((await readWindow(page, id))?.msgs, prefix);
    if (found.length > before) return found[found.length - 1].text;
    if (Date.now() > until) return null;
    await page.waitForTimeout(500);
  }
}

const helpCards = (page) => page.evaluate(() => window.__e2eStore.getState().wins
  .filter((w) => w.kind === 'agentHelp')
  .map((w) => ({ id: w.id, status: w.status, deliveredAt: w.deliveredAt || null, to: w.toWindowId, from: w.fromWindowId })));

async function waitFor(fn, test, page, ms = 5_000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await fn(page);
    if (test(value)) return value;
    if (Date.now() > until) return null;
    await page.waitForTimeout(250);
  }
}

export default {
  id: 'agentRegistry',
  label: 'Agent registry (agents asking agents)',
  async run(t) {
    const { pat, sam, check } = t;
    const ask = `${TEAM_ASK}: who on this board knows databases? Ask them for me.`;
    t.typed.push(ask);
    let atlas;
    let nexus;

    await check('walk', 'Pat opens the agent registry', async ({ shot }) => {
      const id = await spawnWindow(pat.page, 'registry', {}, { x: 900, y: 40 }, { w: 520, h: 520 });
      const frame = windowFrame(pat.page, id);
      await frame.getByText('Receipts', { exact: true }).first().waitFor({ timeout: 15_000 });
      await shot(pat.page, 'pat-opens-the-registry');
      return 'the registry opened on its Agents tab';
    });

    await check('walk', 'Atlas finds Nexus by what it knows and asks it for help', async ({ shot }) => {
      atlas = await spawnWindow(pat.page, 'chat', { agentId: 'atlas' }, { x: 40, y: 40 }, { w: 400, h: 560 });
      nexus = await spawnWindow(pat.page, 'chat', { agentId: 'nexus' }, { x: 460, y: 40 }, { w: 400, h: 560 });
      await windowFrame(pat.page, atlas).getByPlaceholder(/^Message /).first().waitFor({ timeout: 15_000 });
      const said = await askAtlas(pat.page, atlas, ask);
      await shot(pat.page, 'atlas-asks-nexus');
      if (!said) throw new Error('Atlas never reported back');
      if (!/nexus/i.test(said) || !said.includes(STANDIN_ANSWER)) throw new Error(`Atlas said: ${said.slice(0, 160)}`);
      return said.slice(0, 120);
    });

    await check('walk', 'the answer comes back with a delivered help card on the board', async ({ shot }) => {
      const cards = await waitFor(helpCards, (list) => list.some((c) => c.to === nexus && c.status === 'completed'), pat.page);
      if (!cards) throw new Error(`no finished help card from Atlas to Nexus: ${JSON.stringify(await helpCards(pat.page)).slice(0, 160)}`);
      const card = cards.find((c) => c.to === nexus && c.status === 'completed');
      if (!card.deliveredAt) throw new Error('the help card has no delivered time');
      const heard = (await readWindow(pat.page, nexus))?.msgs || [];
      if (!heard.some((m) => m.helpReply)) throw new Error('Nexus\'s chat does not show its answer');
      await shot(pat.page, 'the-help-card-on-the-board');
      return `help card delivered at ${card.deliveredAt}`;
    });

    await check('walk', 'Sam sees the exchange on the shared board', async ({ shot }) => {
      const cards = await waitFor(helpCards, (list) => list.some((c) => c.to === nexus && c.status === 'completed'), sam.page);
      const heard = (await readWindow(sam.page, nexus))?.msgs || [];
      await shot(sam.page, 'sam-sees-the-exchange');
      if (!cards || !heard.some((m) => m.helpReply)) throw new Error('Sam does not see the help card or Nexus\'s answer');
      return 'Sam sees the help card and Nexus\'s answer';
    });

    await check('hunt', 'asking a window that does not exist gets a plain answer', async () => {
      const text = `${TEAM_ASK}: ask window:not-a-window-at-all`;
      t.typed.push(text);
      const said = await askAtlas(pat.page, atlas, text, 'Made-up team answer', 30_000);
      if (!said || !/did not go through/.test(said)) throw new Error(`Atlas said: ${String(said).slice(0, 160)}`);
      if (/\bat [\w.]+ \(|node_modules/.test(said)) throw new Error('the answer carries raw server text');
      return said.slice(0, 140);
    });

    await check('hunt', 'Atlas asking itself is refused', async () => {
      const text = `${TEAM_ASK}: ask window:${atlas}`;
      t.typed.push(text);
      const said = await askAtlas(pat.page, atlas, text, 'Made-up team answer', 30_000);
      if (!said || !/cannot ask itself/.test(said)) throw new Error(`Atlas said: ${String(said).slice(0, 160)}`);
      return said.slice(0, 140);
    });

    await check('hunt', 'Sam cannot use Pat\'s private agent card', async () => {
      const own = await t.api(pat, 'POST', '/api/workspaces/personal');
      const created = await t.api(pat, 'POST', '/api/agent-registry/cards', {
        name: 'Made-up Pat helper', description: 'Made-up private helper for Testco', workspaceId: own.body?.workspace?.id,
      });
      const cardId = created.body?.id;
      if (!cardId) throw new Error(`Pat could not publish a private card (${created.status}: ${created.text.slice(0, 80)})`);
      const read = await t.api(sam, 'GET', `/api/agent-registry/cards/${encodeURIComponent(cardId)}`);
      const asked = await t.api(sam, 'POST', '/api/agent-registry/help-requests', { workspaceId: t.workspaceId, cardId, task: 'Made-up favour' });
      if (read.status < 400) throw new Error(`Sam can read Pat's private card (${read.status})`);
      if (asked.status < 400) throw new Error(`Sam's help request to Pat's private card was taken (${asked.status})`);
      return `read ${read.status}, ask ${asked.status}: ${asked.body?.error || ''}`.trim();
    });

    await check('redteam', 'signed out, the agent network answers nothing', async () => {
      const ws = encodeURIComponent(t.workspaceId);
      const found = await t.api({ ctx: t.signedOut }, 'GET', `/api/agent-registry/discover?workspaceId=${ws}&q=databases`);
      const asked = await t.api({ ctx: t.signedOut }, 'POST', '/api/agent-registry/help-requests', { workspaceId: t.workspaceId, cardId: 'agent:nexus', task: 'x' });
      if (found.status < 400 || asked.status < 400) throw new Error(`answered ${found.status} and ${asked.status} with no sign-in`);
      return `answered ${found.status} and ${asked.status}`;
    });

    await check('redteam', 'the board-help log names agents by id only', async () => {
      const lines = t.serverLog().split('\n').filter((line) => line.includes('board ask'));
      if (!lines.length) throw new Error('no board ask line was written');
      const leaky = lines.find((line) => /Made-up|Atlas|Nexus|bakery/.test(line));
      if (leaky) throw new Error(`a board ask line carries typed or display text: ${leaky.slice(0, 160)}`);
      return `${lines.length} board ask lines, ids only`;
    });
  },
};
