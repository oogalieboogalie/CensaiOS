// One Chat window, two people: Pat Example asks Atlas a made-up question on
// the shared board and the stand-in model's answer comes in; Sam Example sees
// both on their own screen, asks a follow-up in the same window, and Pat sees
// that and its answer. Pat attaches a made-up text file and Sam sees its chip.
// Red team: Sam never sees Pat's model key or its last letters, Sam cannot
// change Pat's agent's model, and a script tag shows as plain words.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { STANDIN_ANSWER } from '../standinModel.mjs';
import { note } from '../report.mjs';

const QUESTION = 'Made-up question: what should Pat Example bake on Friday?';
const FOLLOW_UP = 'Made-up follow-up from Sam: and for Saturday?';
const FILE_ASK = 'Made-up ask: read the notes I attached.';
const SCRIPT = '<script>window.__madeUpPwned = 155</script><img src=x onerror="window.__madeUpPwned = 155"> made-up script line';
const KEY = 'made-up-openai-key-155QX7J';
const KEY_END = 'QX7J';
const HELPER = { id: 'pat-helper-155', name: 'Made-up Helper', model: 'gpt-4.1', changed: 'gpt-4o-mini' };

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
