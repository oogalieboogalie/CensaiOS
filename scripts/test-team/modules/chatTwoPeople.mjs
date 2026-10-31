// One Chat window, two people: Pat Example asks Atlas a made-up question on
// the shared board and the stand-in model's answer comes in; Sam Example sees
// both on their own screen, asks a follow-up in the same window, and Pat sees
// that and its answer. Pat attaches a made-up text file and Sam sees its chip.
// Pat makes an agent in Agent Designer and opens its chat: Sam's copy is that
// agent's chat too; Pat picks Grok from its chip and Sam's chip and Grok's
// bar show it at once, and after both reload both chats still show both
// (the chip asks the server, the bar goes by the agent this browser holds).
// Red team: Sam never sees Pat's model key or its last letters, Sam cannot
// change Pat's agent's model, and a script tag shows as plain words.

import { openBoard, readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { STANDIN_ANSWER } from '../standinModel.mjs';
import { note } from '../report.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

const QUESTION = 'Made-up question: what should Pat Example bake on Friday?';
const FOLLOW_UP = 'Made-up follow-up from Sam: and for Saturday?';
const FILE_ASK = 'Made-up ask: read the notes I attached.';
const SCRIPT = '<script>window.__madeUpPwned = 155</script><img src=x onerror="window.__madeUpPwned = 155"> made-up script line';
const KEY = 'made-up-openai-key-155QX7J';
const KEY_END = 'QX7J';
const HELPER = { id: 'pat-helper-155', name: 'Made-up Helper', model: 'gpt-4.1', changed: 'gpt-4o-mini' };
// An agent Pat makes in Agent Designer, then switches to Grok from its chat's chip.
const PLANNER = { name: 'Made-up Planner', model: 'gpt-4.1', picked: 'grok-4' };

const msgsOf = async (page, id) => (await readWindow(page, id))?.msgs || [];

async function waitFor(page, id, test, ms = 30_000) {
  const until = Date.now() + ms;
  for (;;) {
    const msgs = await msgsOf(page, id);
    if (test(msgs)) return msgs;
    if (Date.now() > until) return null;
    await page.waitForTimeout(250);
  }
}

const answersAfter = (msgs, text) => {
  const at = msgs.findIndex((m) => m.from === 'me' && m.text === text);
  return at < 0 ? [] : msgs.slice(at + 1).filter((m) => m.from !== 'me');
};

async function say(page, id, text) {
  const box = windowFrame(page, id).getByPlaceholder(/^Message /).first();
  await box.fill(text);
  await box.press('Enter');
}

/** The model a chat's chip shows on this person's screen, once it shows `want` (or after `ms`). */
async function chipOf(page, id, want, ms = 20_000) {
  const chip = windowFrame(page, id).getByTestId('chat-capabilities');
  const until = Date.now() + ms;
  for (;;) {
    const shown = (await chip.innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    if (shown.startsWith(want) || Date.now() > until) return shown;
    await page.waitForTimeout(250);
  }
}

/** What Grok's bar in a chat says on this person's screen ('' when there is none after `ms`). */
async function grokBar(page, id, ms = 10_000) {
  const bar = windowFrame(page, id).getByTestId('grok-source');
  await bar.waitFor({ timeout: ms }).catch(() => {});
  return (await bar.count()) ? (await bar.innerText()).replace(/\s+/g, ' ').trim() : '';
}

/** The id of the first window of `kind` this person's board shows that is not in `before`. */
async function newWindow(page, kind, before, ms = 15_000) {
  const handle = await page.waitForFunction(([k, ids]) => window.__e2eStore.getState().wins.find((w) => w.kind === k && !ids.includes(w.id))?.id,
    [kind, before], { timeout: ms }).catch(() => null);
  return handle ? handle.jsonValue() : null;
}

const winIds = (page) => page.evaluate(() => window.__e2eStore.getState().wins.map((w) => w.id));

/** Moves this person's view of the board so window `id` sits near the top left, as a person drags the board to it. */
async function lookAt(page, id) {
  // A new window may still be gliding into view; let it land first.
  await page.waitForTimeout(1200);
  await page.evaluate((wid) => {
    const store = window.__e2eStore.getState();
    const win = store.wins.find((w) => w.id === wid);
    if (win) store.setPan({ x: 60 - win.x * store.zoom, y: 90 - win.y * store.zoom });
  }, id);
  await page.waitForTimeout(300);
}

/** Everything a browser could show or was sent: its page text plus every answer body it received. */
function listen(page) {
  const bodies = [];
  page.on('response', async (res) => {
    try { bodies.push(await res.text()); } catch { /* streamed or gone */ }
  });
  return bodies;
}

export default {
  id: 'chatTwoPeople',
  label: 'Chat: two people in one window with an agent',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(QUESTION, FOLLOW_UP, FILE_ASK, SCRIPT, KEY);
    const samHeard = listen(sam.page);
    let chat;

    await check('walk', 'Pat asks Atlas a made-up question and the answer comes in', async ({ shot }) => {
      chat = await spawnWindow(pat.page, 'chat', { agentId: 'atlas' }, { x: 60, y: 60 }, { w: 520, h: 640 });
      await windowFrame(pat.page, chat).getByPlaceholder(/^Message /).first().waitFor({ timeout: 20_000 });
      await say(pat.page, chat, QUESTION);
      const msgs = await waitFor(pat.page, chat, (m) => answersAfter(m, QUESTION).some((a) => a.text === STANDIN_ANSWER));
      await windowFrame(pat.page, chat).getByText(STANDIN_ANSWER).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(pat.page, 'pat-asks-atlas');
      if (!msgs) throw new Error(`no answer; the chat ends with ${JSON.stringify((await msgsOf(pat.page, chat)).slice(-1)).slice(0, 160)}`);
      return `Atlas answered "${STANDIN_ANSWER}"`;
    });

    await check('walk', 'Sam sees Pat\'s question and Atlas\'s answer on their own screen', async ({ shot }) => {
      if (!chat) throw note('the chat never opened');
      const frame = windowFrame(sam.page, chat);
      await frame.getByText(QUESTION).first().waitFor({ timeout: 15_000 }).catch(() => {});
      await frame.getByText(STANDIN_ANSWER).first().waitFor({ timeout: 15_000 }).catch(() => {});
      const text = await frame.innerText();
      await shot(sam.page, 'sam-sees-the-chat');
      const missing = [[QUESTION, 'the question'], [STANDIN_ANSWER, 'the answer']].filter(([s]) => !text.includes(s)).map(([, what]) => what);
      if (missing.length) throw new Error(`Sam does not see ${missing.join(' or ')}`);
      return 'the question and the answer both show on Sam\'s screen';
    });

    await check('walk', 'Sam asks a follow-up in the same window and Pat sees it and the answer', async ({ shot }) => {
      const calls = t.model.calls();
      await say(sam.page, chat, FOLLOW_UP);
      const msgs = await waitFor(pat.page, chat, (m) => answersAfter(m, FOLLOW_UP).some((a) => a.text === STANDIN_ANSWER));
      await windowFrame(pat.page, chat).getByText(FOLLOW_UP).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await pat.page.waitForTimeout(2000);
      await shot(pat.page, 'pat-sees-sams-follow-up');
      if (!msgs) throw new Error('Pat\'s copy never showed the follow-up and its answer');
      const asked = t.model.calls() - calls;
      const copies = (await msgsOf(pat.page, chat)).filter((m) => m.text === FOLLOW_UP).length;
      if (copies !== 1) throw new Error(`the follow-up shows ${copies} times`);
      return `Pat sees Sam's follow-up once and its answer (the model was asked ${asked} time${asked === 1 ? '' : 's'})`;
    });

    await check('walk', 'Pat attaches a made-up text file and Sam sees the file chip', async ({ shot }) => {
      const frame = windowFrame(pat.page, chat);
      await frame.getByTestId('chat-file-input').setInputFiles({ name: 'made-up-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Made-up notes: flour, sugar, Friday.') });
      await frame.getByTestId('chat-attachment-chip').first().waitFor({ timeout: 10_000 });
      await say(pat.page, chat, FILE_ASK);
      await waitFor(pat.page, chat, (m) => answersAfter(m, FILE_ASK).length > 0);
      const samChip = windowFrame(sam.page, chat).getByTestId('chat-attachment-chip').filter({ hasText: 'made-up-notes.txt' });
      await samChip.first().waitFor({ timeout: 15_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-the-file-chip');
      const shown = await samChip.count();
      if (!shown) throw new Error('no made-up-notes.txt chip on Sam\'s screen');
      const stored = (await msgsOf(sam.page, chat)).find((m) => m.text === FILE_ASK)?.attachments?.[0] || {};
      return `Sam sees the made-up-notes.txt chip (the board keeps ${stored.dataUrl ? 'the file itself' : 'the name only, not the file'})`;
    });

    const planner = { id: null, chat: null };
    await check('walk', 'Pat makes an agent in Agent Designer and opens its chat: Sam\'s copy is that agent\'s chat too, on its model', async ({ shot }) => {
      const designer = await addFromMenu(pat.page, 'Agent Designer');
      if (designer.kind !== 'agentDesigner') throw new Error(`the Add menu opened ${designer.kind || 'nothing'}, not Agent Designer`);
      const form = windowFrame(pat.page, designer.id);
      await form.locator('label', { hasText: /^Name/ }).locator('input').fill(PLANNER.name);
      await form.locator('label', { hasText: /^Provider/ }).locator('select').selectOption('openai');
      await form.locator('label', { hasText: /^Model/ }).locator('select').first().selectOption(PLANNER.model);
      const before = await winIds(pat.page);
      await form.getByRole('button', { name: 'Create agent' }).click();
      const profile = await newWindow(pat.page, 'agent', before);
      if (!profile) throw new Error('no profile opened after Create agent');
      planner.id = (await readWindow(pat.page, profile)).agentId;
      await lookAt(pat.page, profile);
      await shot(pat.page, 'pat-made-an-agent-in-agent-designer');
      const beforeChat = await winIds(pat.page);
      await windowFrame(pat.page, profile).getByRole('button', { name: 'Open chat' }).click({ timeout: 10_000 });
      planner.chat = await newWindow(pat.page, 'chat', beforeChat);
      if (!planner.chat) throw new Error(`${PLANNER.name}'s Open chat opened no chat`);
      await Promise.all([pat, sam].map((who) => lookAt(who.page, planner.chat)));
      const asks = windowFrame(sam.page, planner.chat).getByPlaceholder(`Message ${PLANNER.name}`);
      await asks.waitFor({ timeout: 20_000 }).catch(() => {});
      const [patChip, samChip] = await Promise.all([pat, sam].map((who) => chipOf(who.page, planner.chat, PLANNER.model)));
      await sideBySide(t, 'pats-new-agent-on-both-screens', shot);
      if (!await asks.count()) {
        const box = await windowFrame(sam.page, planner.chat).getByPlaceholder(/^Message /).first().getAttribute('placeholder').catch(() => null);
        throw new Error(`Sam's copy of ${PLANNER.name}'s chat is ${box ? `"${box}"` : 'not there'}, another agent's chat`);
      }
      if (!patChip.startsWith(PLANNER.model) || !samChip.startsWith(PLANNER.model)) throw new Error(`the chips show "${patChip}" (Pat) and "${samChip}" (Sam), not ${PLANNER.model}`);
      return `both screens show ${PLANNER.name}'s chat on ${PLANNER.model}`;
    });

    await check('walk', 'Pat picks Grok from the chip: Sam\'s open copy shows it and Grok\'s bar at once, with no reload', async ({ shot }) => {
      if (!planner.chat) throw note(`${PLANNER.name}'s chat never opened`);
      const frame = windowFrame(pat.page, planner.chat);
      await frame.getByTestId('chat-capabilities').click({ timeout: 10_000 });
      await frame.getByRole('menuitemradio', { name: PLANNER.picked, exact: true }).click({ timeout: 5_000 });
      const patChip = await chipOf(pat.page, planner.chat, PLANNER.picked);
      const samChip = await chipOf(sam.page, planner.chat, PLANNER.picked);
      const samBar = await grokBar(sam.page, planner.chat);
      await sideBySide(t, 'the-picked-model-on-both-screens', shot);
      const kept = await t.api(pat, 'GET', `/api/agents/${encodeURIComponent(planner.id)}`);
      if (!patChip.startsWith(PLANNER.picked)) throw new Error(`Pat's chip shows "${patChip}"`);
      if (kept.body?.model_name !== PLANNER.picked) throw new Error(`the server keeps ${kept.body?.model_name} for ${PLANNER.name}`);
      if (!samChip.startsWith(PLANNER.picked)) throw new Error(`with no reload, Sam's chip still shows "${samChip}", not ${PLANNER.picked}`);
      if (!samBar) throw new Error(`Sam's chip shows ${PLANNER.picked} but Sam's chat has no Grok bar`);
      return `with no reload, Sam's chip shows ${samChip} and Grok's bar says: ${samBar}`;
    });

    await check('hunt', 'after both reload, both chats still show the model Pat picked and Grok\'s bar', async ({ shot }) => {
      if (!planner.chat) throw note(`${PLANNER.name}'s chat never opened`);
      // What the board keeps in its own agent list, which a reload lays in first.
      const saved = await t.api(pat, 'GET', `/api/client-state/homebase.workspace.v1?workspaceId=${encodeURIComponent(t.workspaceId)}`);
      const kept = (saved.body?.value?.extraAgents || []).find((a) => a.id === planner.id);
      await Promise.all([pat, sam].map((who) => openBoard(who.page, t.workspaceId, t.web)));
      await Promise.all([pat, sam].map((who) => lookAt(who.page, planner.chat)));
      const chips = await Promise.all([pat, sam].map((who) => chipOf(who.page, planner.chat, PLANNER.picked, 30_000)));
      const bars = await Promise.all([pat, sam].map((who) => grokBar(who.page, planner.chat)));
      await sideBySide(t, 'the-picked-model-after-a-reload', shot);
      const list = kept ? `holds ${PLANNER.name} on ${kept.model_name}` : `does not hold ${PLANNER.name}`;
      const wrong = [['Pat', 0], ['Sam', 1]].flatMap(([who, i]) => [
        ...(chips[i].startsWith(PLANNER.picked) ? [] : [`${who}'s chip shows "${chips[i]}"`]),
        ...(bars[i] ? [] : [`${who}'s chat has no Grok bar`]),
      ]);
      if (wrong.length) throw new Error(`${wrong.join('; ')} (the board's own agent list ${list})`);
      return `after a reload both chips show ${PLANNER.picked} and both chats have Grok's bar; the board's own agent list ${list}`;
    });

    await check('redteam', 'a message with a script tag shows as plain words on both screens', async ({ shot }) => {
      await say(pat.page, chat, SCRIPT);
      await waitFor(sam.page, chat, (m) => m.some((x) => x.text === SCRIPT), 15_000);
      await pat.page.waitForTimeout(1500);
      const problems = [];
      for (const [who, page] of [['Pat', pat.page], ['Sam', sam.page]]) {
        const ran = await page.evaluate(() => window.__madeUpPwned);
        const text = await windowFrame(page, chat).innerText();
        if (ran) problems.push(`the script ran on ${who}'s screen`);
        if (!text.includes('made-up script line')) problems.push(`${who} does not see the message`);
        if (!text.includes('<script>')) problems.push(`${who} does not see the script tag as words`);
      }
      await shot(sam.page, 'sam-sees-the-script-as-words');
      if (problems.length) throw new Error(problems.join('; '));
      return 'both screens show the tags as plain words; nothing ran';
    });

    await check('redteam', 'Sam never sees Pat\'s model key or its last letters', async () => {
      const saved = await t.api(pat, 'POST', '/api/keys', { provider: 'openai', apiKey: KEY });
      if (saved.status >= 400) throw note(`Pat's made-up key was refused (${saved.status})`);
      await sam.page.reload();
      await sam.page.waitForFunction(() => document.readyState === 'complete');
      await sam.page.waitForTimeout(3000);
      const keys = await t.api(sam, 'GET', '/api/keys');
      const status = await t.api(sam, 'GET', `/api/chat/capabilities?agentId=atlas&workspaceId=${encodeURIComponent(t.workspaceId)}`);
      const pageText = await sam.page.content();
      const seen = [['the key list', keys.text], ['the chat lookup', status.text], ['Sam\'s page', pageText], ['the answers Sam\'s browser got', samHeard.join('\n')]]
        .filter(([, text]) => text.includes(KEY) || text.includes(KEY_END)).map(([where]) => where);
      if (seen.length) throw new Error(`Pat's key or its last letters show in ${seen.join(', ')}`);
      return `checked Sam's key list (${keys.status}), the chat lookup, Sam's page and ${samHeard.length} answers Sam's browser got: no key, no "${KEY_END}"`;
    });

    await check('redteam', 'Sam cannot change the model of Pat\'s agent', async () => {
      const made = await t.api(pat, 'POST', '/api/agents', {
        id: HELPER.id, name: HELPER.name, role: 'Made-up helper', model_provider: 'openai', model_name: HELPER.model, hue: 200, glyph: 'M',
      });
      if (made.status >= 400) throw note(`Pat's agent was not saved (${made.status})`);
      const tries = [
        ['PUT', `/api/agents/${HELPER.id}`, { name: HELPER.name, model_provider: 'openai', model_name: HELPER.changed }],
        ['PATCH', `/api/agents/${HELPER.id}/config`, { model_name: HELPER.changed }],
      ];
      const answers = [];
      let said = '';
      for (const [method, url, data] of tries) {
        const res = await t.api(sam, method, url, data);
        answers.push(`${method} ${res.status}`);
        said = res.body?.error || said;
      }
      const after = await t.api(pat, 'GET', `/api/agents/${HELPER.id}`);
      const model = after.body?.model_name || after.body?.modelName;
      if (model !== HELPER.model) {
        await t.api(pat, 'PATCH', `/api/agents/${HELPER.id}/config`, { model_name: HELPER.model });
        throw new Error(`Sam changed it to ${model} (${answers.join(', ')}); see backlog item 162`);
      }
      const logged = t.serverLog().split('\n').filter((line) => line.includes('agent change refused: not the owner'));
      if (!logged.length) throw note(`refused (${answers.join(', ')}) but no refusal line in the server log`);
      if (logged.some((line) => /Example|example\.com/.test(line))) throw new Error('a refusal line carries a name or email');
      return `refused (${answers.join(', ')}) with "${said}"; still ${model}; ${logged.length} refusal log lines, no names`;
    });
  },
};
