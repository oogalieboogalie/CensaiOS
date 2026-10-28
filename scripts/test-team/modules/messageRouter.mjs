// Message Router for two: Pat Example says what she needs once, the router
// cuts it into parts and picks an agent and a template for each, Pat sends
// the parts and each agent answers through the stand-in model. Sam Example,
// on the same board, sees the same line and which parts went out. Then the
// wrong things: an empty line, a 20,000-letter line, an agent that does not
// exist, Send pressed twice, Sam sending a part Pat already sent. Red team:
// signed out, a made-up board, and typed text in the server log.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { STANDIN_ANSWER } from '../standinModel.mjs';
import { note } from '../report.mjs';

const ASK = 'made-up: write a tip calculator and a note about it';
const NO_SUCH_AGENT = 'made-up: ask Zorblax the agent to write a poem';
const ROUTED = 'Routed to you by the board';

const slips = (page, id) => windowFrame(page, id).getByTestId('router-slip');
const planOf = async (page, id) => (await readWindow(page, id))?.routerPlan || null;
const sentOf = async (page, id) => (await readWindow(page, id))?.routerSent || [];

/** The chat windows the router opened, as this browser's board copy has them. */
const routedChats = (page) => page.evaluate((mark) => window.__e2eStore.getState().wins
  .filter((w) => w.kind === 'chat' && String(w.msgs?.[0]?.text || '').startsWith(mark))
  .map((w) => ({ id: w.id, agentId: w.agentId, first: w.msgs[0].text, answers: (w.msgs || []).filter((m) => m.from !== 'me').map((m) => m.text) })), ROUTED);

/** How many model requests asked this routed part (as the newest message; older chats can ride along as context). */
const asked = (t, part) => t.model.recent().filter((r) => {
  const last = r.messages.filter((m) => m.role === 'user').pop();
  return JSON.stringify(last?.content || '').includes(`Request: ${part.text}`);
}).length;

/** Closes the routed chats so the next step's clicks land on the router, not on a chat. */
async function clearChats(page) {
  await page.evaluate((mark) => {
    const store = window.__e2eStore.getState();
    store.wins.filter((w) => w.kind === 'chat' && String(w.msgs?.[0]?.text || '').startsWith(mark)).forEach((w) => store.onClose(w.id));
  }, ROUTED);
  await page.waitForTimeout(500);
}

async function waitUntil(page, test, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await test();
    if (seen || Date.now() > until) return seen;
    await page.waitForTimeout(300);
  }
}

/** Pans the board back to the router (opening a chat pans to it) and brings the router to the front. */
async function faceRouter(page, id) {
  await page.evaluate((wid) => { const s = window.__e2eStore.getState(); s.setPan({ x: 0, y: 0 }); s.setActiveId?.(wid); }, id);
  await page.waitForTimeout(300);
}

async function routeLine(page, id, text) {
  await faceRouter(page, id);
  const frame = windowFrame(page, id);
  await frame.getByLabel('What do you need?').fill(text);
  await frame.getByRole('button', { name: 'Route it' }).click();
}

export default {
  id: 'messageRouter',
  label: 'Message Router: one line cut into parts, for two people',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(ASK, NO_SUCH_AGENT);
    let router;
    let parts = [];
    let askedBefore = [];

    await check('walk', 'Pat routes one line and sees it cut into parts, each with an agent and a template', async ({ shot }) => {
      router = await spawnWindow(pat.page, 'agentRouter', {}, { x: 40, y: 40 }, { w: 900, h: 640 });
      await windowFrame(pat.page, router).getByLabel('What do you need?').waitFor({ timeout: 20_000 });
      await routeLine(pat.page, router, ASK);
      await waitUntil(pat.page, async () => (await slips(pat.page, router).count()) >= 2);
      parts = (await planOf(pat.page, router))?.parts || [];
      await shot(pat.page, 'pat-routes-the-line');
      if (parts.length < 2) throw new Error(`the line became ${parts.length} part(s), not two`);
      const bare = parts.filter((p) => !p.agent?.id || !p.template?.title);
      if (bare.length) throw new Error(`${bare.length} parts have no agent or template`);
      return parts.map((p) => `"${p.text}" to ${p.agent.name} with "${p.template.title}"`).join('; ');
    });

    await check('walk', 'Pat presses Send all and each agent answers through the stand-in model', async ({ shot }) => {
      if (!parts.length) throw note('nothing was routed');
      // The stand-in model serves every theme's run, so count from here.
      askedBefore = parts.map((p) => asked(t, p));
      await windowFrame(pat.page, router).getByRole('button', { name: 'Send all' }).dblclick();
      const chats = await waitUntil(pat.page, async () => {
        const seen = await routedChats(pat.page);
        return seen.length >= parts.length && seen.every((c) => c.answers.includes(STANDIN_ANSWER)) ? seen : null;
      }, 40_000);
      await shot(pat.page, 'pat-agents-answer');
      if (!chats) throw new Error(`answers missing: ${JSON.stringify(await routedChats(pat.page)).slice(0, 200)}`);
      return `${chats.length} chats opened, each answered "${STANDIN_ANSWER}"`;
    });

    await check('hunt', 'Send pressed twice: each part goes out once and each agent is asked once', async () => {
      await pat.page.waitForTimeout(3000);
      const chats = await routedChats(pat.page);
      const timesAsked = parts.map((p, i) => asked(t, p) - (askedBefore[i] || 0));
      const problems = [];
      if (chats.length !== parts.length) problems.push(`${chats.length} chats for ${parts.length} parts`);
      if (timesAsked.some((n) => n !== 1)) problems.push(`the model was asked ${timesAsked.join(', ')} times per part`);
      if (problems.length) throw new Error(problems.join('; '));
      return `${chats.length} chats, model asked once per part (Sam's browser watched and did not ask again)`;
    });

    await check('walk', 'Sam sees the same line, the same parts and which ones went out', async ({ shot }) => {
      if (!router) throw note('the router never opened');
      await waitUntil(sam.page, async () => (await sentOf(sam.page, router)).length === parts.length);
      await slips(sam.page, router).first().waitFor({ timeout: 10_000 }).catch(() => {});
      const shown = await slips(sam.page, router).count();
      const sentLabels = await windowFrame(sam.page, router).getByText('Sent on the line to').count();
      const samLine = await windowFrame(sam.page, router).getByTestId('router-line').innerText();
      const patLine = await windowFrame(pat.page, router).getByTestId('router-line').innerText();
      await shot(sam.page, 'sam-sees-the-routed-line');
      const problems = [];
      if (shown !== parts.length) problems.push(`Sam sees ${shown} parts, Pat ${parts.length}`);
      if (sentLabels !== parts.length) problems.push(`Sam sees ${sentLabels} of ${parts.length} marked sent`);
      if (samLine !== patLine) problems.push(`Sam's line "${samLine}" is not Pat's "${patLine}"`);
      if (problems.length) throw new Error(problems.join('; '));
      return `${shown} parts, all marked sent, on line ${samLine}`;
    });

    await check('redteam', 'Sam tries to send parts Pat already sent; nothing goes out again', async () => {
      const before = (await routedChats(sam.page)).length;
      const buttons = await windowFrame(sam.page, router).getByRole('button', { name: /^Send to / }).count();
      const sendAll = windowFrame(sam.page, router).getByRole('button', { name: 'Send all' });
      const disabled = await sendAll.isDisabled().catch(() => true);
      if (!disabled) await sendAll.click();
      await sam.page.waitForTimeout(2000);
      const after = (await routedChats(sam.page)).length;
      const problems = [];
      if (buttons) problems.push(`${buttons} send buttons still show`);
      if (!disabled) problems.push('Send all was still pressable');
      if (after !== before) problems.push(`${after - before} more chats opened`);
      if (problems.length) throw new Error(problems.join('; '));
      return 'no send buttons on sent parts, Send all greyed out, no new chats';
    });

    await check('hunt', 'a line naming an agent that does not exist goes to a real agent, and Sam sends it once', async ({ shot }) => {
      await clearChats(pat.page);
      await routeLine(pat.page, router, NO_SUCH_AGENT);
      const plan = await waitUntil(sam.page, async () => {
        const p = await planOf(sam.page, router);
        return p?.request === NO_SUCH_AGENT ? p : null;
      });
      if (!plan) throw new Error('Sam never saw the new line');
      const part = plan.parts[0];
      if (/zorblax/i.test(`${part.agent.id} ${part.agent.name}`)) throw new Error(`routed to a made-up agent "${part.agent.name}"`);
      const askedFirst = asked(t, part);
      await faceRouter(sam.page, router);
      await windowFrame(sam.page, router).getByRole('button', { name: `Send to ${part.agent.name}` }).first().dblclick();
      const chat = await waitUntil(sam.page, async () => (await routedChats(sam.page)).find((c) => c.first.includes(NO_SUCH_AGENT) && c.answers.includes(STANDIN_ANSWER)), 30_000);
      const patSent = await waitUntil(pat.page, async () => (await sentOf(pat.page, router)).includes(part.index));
      await pat.page.waitForTimeout(2000);
      await shot(sam.page, 'sam-sends-the-new-part');
      const problems = [];
      if (!chat) problems.push('no answer came back');
      if (!patSent) problems.push('Pat\'s copy does not show it sent');
      const copies = (await routedChats(pat.page)).filter((c) => c.first.includes(NO_SUCH_AGENT)).length;
      if (copies !== 1) problems.push(`${copies} chats opened for it`);
      const times = asked(t, part) - askedFirst;
      if (times !== 1) problems.push(`the model was asked ${times} times`);
      if (problems.length) throw new Error(problems.join('; '));
      return `went to ${part.agent.name} (${part.agent.why}); one chat, asked once, Pat sees it sent`;
    });

    await check('hunt', 'an empty line gets a plain sentence and changes nothing', async ({ shot }) => {
      await clearChats(sam.page);
      const before = (await planOf(pat.page, router))?.stamp;
      await routeLine(pat.page, router, '   ');
      const alert = windowFrame(pat.page, router).getByRole('alert');
      await alert.waitFor({ timeout: 5000 }).catch(() => {});
      const said = await alert.innerText().catch(() => '');
      await shot(pat.page, 'pat-empty-line');
      if (!said) throw new Error('no sentence showed');
      if ((await planOf(pat.page, router))?.stamp !== before) throw new Error('the routed parts changed');
      return `"${said}"`;
    });

    await check('hunt', 'a 20,000-letter line routes without breaking the window', async ({ shot }) => {
      await routeLine(pat.page, router, 'x'.repeat(20_000));
      const plan = await waitUntil(pat.page, async () => {
        const p = await planOf(pat.page, router);
        return p && p.request.startsWith('xxx') ? p : null;
      });
      await shot(pat.page, 'pat-huge-line');
      if (!plan) throw new Error(`no plan came back; the window says "${await windowFrame(pat.page, router).getByRole('alert').innerText().catch(() => 'nothing')}"`);
      const longTag = Math.max(...plan.parts.flatMap((p) => p.tags.map((tag) => tag.length)));
      const box = await windowFrame(pat.page, router).getByTestId('router-slip').first().boundingBox();
      const frame = await windowFrame(pat.page, router).boundingBox();
      const problems = [];
      if (plan.request.length > 2000) problems.push(`the server kept ${plan.request.length} letters`);
      if (longTag > 60) problems.push(`a tag is ${longTag} letters long`);
      if (box && frame && box.width > frame.width) problems.push('the slip is wider than the window');
      if (pat.errors.length) problems.push(`page errors: ${pat.errors.slice(0, 2).join('; ')}`);
      if (problems.length) throw new Error(problems.join('; '));
      return `cut to ${plan.request.length} letters, ${plan.parts.length} part, longest tag ${longTag} letters, the slip fits the window`;
    });

    await check('redteam', 'signed out or on a made-up board, the router refuses', async () => {
      const out = await t.signedOut.newPage();
      try {
        await out.goto(`${t.web}/`);
        const signedOut = await out.evaluate(async (ws) => (await fetch('/api/agent-router/plan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: ws, text: 'made-up: write a note' }),
        })).status, t.workspaceId);
        const other = await t.api(sam, 'POST', '/api/agent-router/plan', { workspaceId: 'made-up-board-154', text: 'made-up: write a note' });
        const problems = [];
        if (signedOut !== 401) problems.push(`signed out answered ${signedOut}`);
        if (![403, 404].includes(other.status)) problems.push(`a made-up board answered ${other.status}`);
        if (problems.length) throw new Error(problems.join('; '));
        return `signed out ${signedOut}, made-up board ${other.status} ("${other.body?.error || ''}")`;
      } finally {
        await out.close().catch(() => {});
      }
    });

    await check('redteam', 'router log lines carry only the board, the part count and agent ids', () => {
      const lines = t.serverLog().split('\n').filter((line) => line.includes('[agent-router]') || /agent-router.*routed/.test(line));
      if (!lines.length) throw note('no router lines in the server log');
      const leaks = lines.filter((line) => /tip calculator|Zorblax|xxxxxxxxxx|made-up|Pat Example|Sam Example/i.test(line));
      if (leaks.length) throw new Error(`${leaks.length} router lines carry typed text or a name`);
      return `${lines.length} router lines, e.g. "${lines[0].replace(/^.*?\[agent-router\]\s*/, '').slice(0, 140)}"`;
    });
  },
};
