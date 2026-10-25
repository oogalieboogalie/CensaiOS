// Team Chat (the team room): Pat asks the agents a question, the agents
// answer, Sam sees all of it on the shared board and answers back. Then the
// wrong things: an empty message, a huge one, a double Enter, Pat and Sam
// sending at the same moment. Red team: signed out, someone else's board,
// made-up agent names, raw error text. Agents answer through the stand-in model.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { STANDIN_ANSWER } from '../standinModel.mjs';
import { note } from '../report.mjs';

const BOX = 'Message the group';
const msgsOf = async (page, id) => (await readWindow(page, id))?.msgs || [];
const mine = (msgs, text) => msgs.filter((m) => m.from === 'me' && m.text === text).length;

async function say(page, id, text) {
  const box = windowFrame(page, id).getByPlaceholder(BOX);
  await box.fill(text);
  await box.press('Enter');
}

async function waitFor(page, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const msgs = await msgsOf(page, id);
    if (test(msgs)) return msgs;
    if (Date.now() > until) return null;
    await page.waitForTimeout(250);
  }
}

/** Waits until no answer is still on its way, so one step's late answers do not land in the next. */
async function quiet(page, id, model) {
  let last = '';
  for (let i = 0; i < 60; i++) {
    const now = `${(await msgsOf(page, id)).length}/${model.calls()}`;
    if (now === last) return;
    last = now;
    await page.waitForTimeout(1000);
  }
}

export default {
  id: 'teamChat',
  label: 'Team Chat (team room)',
  async run(t) {
    const { pat, sam, check } = t;
    const said = (text) => { t.typed.push(text); return text; };
    let id;
    await check('walk', 'Pat opens the team room', async ({ shot }) => {
      id = await spawnWindow(pat.page, 'groupChat', {}, { x: 60, y: 40 }, { w: 520, h: 620 });
      await windowFrame(pat.page, id).getByPlaceholder(BOX).waitFor({ timeout: 15_000 });
      await shot(pat.page, 'pat-opens-the-team-room');
      return 'the team room opened with its agents';
    });
    const first = said('Made-up question: what should a bakery post this week?');
    await check('walk', 'Pat asks a question and the agents answer', async ({ shot }) => {
      await say(pat.page, id, first);
      const msgs = await waitFor(pat.page, id, (m) => m.some((x) => x.text === STANDIN_ANSWER), 30_000);
      if (!msgs) throw new Error(`no agent answered; the room shows: ${JSON.stringify((await msgsOf(pat.page, id)).slice(-1)).slice(0, 160)}`);
      await shot(pat.page, 'pat-gets-answers');
      return `${msgs.filter((m) => m.text === STANDIN_ANSWER).length} agents answered`;
    });
    await check('walk', 'Sam sees the question and the answers within 5 seconds', async ({ shot }) => {
      const msgs = await waitFor(sam.page, id, (m) => mine(m, first) === 1 && m.some((x) => x.text === STANDIN_ANSWER), 5_000);
      if (!msgs) throw new Error('Sam\'s copy of the room did not catch up within 5 seconds');
      await shot(sam.page, 'sam-sees-the-conversation');
      return 'Sam sees the same conversation';
    });
    const reply = said('Made-up reply from Sam: add photos of the bread.');
    await check('walk', 'Sam answers back and Pat sees it', async () => {
      await say(sam.page, id, reply);
      if (!(await waitFor(pat.page, id, (m) => mine(m, reply) === 1, 20_000))) throw new Error('Pat never saw Sam\'s message');
      return 'Pat sees Sam\'s message';
    });

    await check('hunt', 'an empty message is not sent', async () => {
      await quiet(pat.page, id, t.model);
      const before = (await msgsOf(pat.page, id)).length;
      const calls = t.model.calls();
      await say(pat.page, id, '   ');
      await pat.page.waitForTimeout(1500);
      if ((await msgsOf(pat.page, id)).length !== before || t.model.calls() !== calls) throw new Error('spaces alone were sent to the agents');
      return 'nothing was sent';
    });
    await check('hunt', 'a huge message (20,000 letters) gets an answer or a plain refusal', async ({ shot }) => {
      await quiet(pat.page, id, t.model);
      const huge = said(`Made-up long note ${'bread '.repeat(3400)}`.slice(0, 20_000));
      const before = (await msgsOf(pat.page, id)).length;
      await say(pat.page, id, huge);
      const msgs = await waitFor(pat.page, id, (m) => m.length > before + 1, 30_000);
      await shot(pat.page, 'pat-sends-a-huge-message');
      if (!msgs) throw new Error('no answer and no refusal after 30 seconds');
      const last = msgs[msgs.length - 1];
      return last.from === 'system' ? `refused: ${String(last.text).slice(0, 80)}` : 'the agents answered';
    });
    const twice = said('Made-up double enter');
    await check('hunt', 'pressing Enter twice fast sends the message once', async () => {
      await quiet(pat.page, id, t.model);
      const box = windowFrame(pat.page, id).getByPlaceholder(BOX);
      await box.fill(twice);
      await box.press('Enter');
      await box.press('Enter');
      const msgs = await waitFor(pat.page, id, (m) => mine(m, twice) >= 1, 10_000);
      await pat.page.waitForTimeout(3000);
      const count = mine(await msgsOf(pat.page, id), twice);
      if (!msgs || count !== 1) throw new Error(`the message is there ${count} times`);
      return 'sent once';
    });
    const patSays = said('Made-up same-moment message from Pat');
    const samSays = said('Made-up same-moment message from Sam');
    await check('hunt', 'Pat and Sam sending at the same moment both keep their message', async ({ shot }) => {
      await quiet(pat.page, id, t.model);
      await Promise.all([say(pat.page, id, patSays), say(sam.page, id, samSays)]);
      const both = (m) => mine(m, patSays) === 1 && mine(m, samSays) === 1;
      const onPat = await waitFor(pat.page, id, both, 30_000);
      const onSam = await waitFor(sam.page, id, both, 5_000);
      await shot(pat.page, 'pat-after-same-moment-send');
      await shot(sam.page, 'sam-after-same-moment-send');
      if (!onPat || !onSam) {
        const lost = [];
        if (!mine(await msgsOf(pat.page, id), patSays)) lost.push('Pat\'s');
        if (!mine(await msgsOf(pat.page, id), samSays)) lost.push('Sam\'s');
        throw new Error(`${lost.join(' and ') || 'one'} message was lost: the room saves the whole conversation as one value, so the last answer to land wins`);
      }
      return 'both messages are on both boards';
    });

    await check('redteam', 'signed out, the team room answers nothing', async () => {
      const res = await t.api({ ctx: t.signedOut }, 'POST', '/api/group-chat', { messages: [{ from: 'me', text: 'hi' }], agentIds: ['nexus'] });
      if (res.status !== 401 && res.status !== 403) throw new Error(`answered ${res.status} with no sign-in`);
      return `answered ${res.status}`;
    });
    await check('redteam', 'Pat cannot use the team room on Sam\'s own board', async () => {
      const own = await t.api(sam, 'POST', '/api/workspaces/personal');
      const samBoard = own.body?.workspace?.id;
      if (!samBoard) throw note(`could not find Sam's own board (${own.status})`);
      const calls = t.model.calls();
      const res = await t.api(pat, 'POST', '/api/group-chat', { messages: [{ from: 'me', text: 'hi' }], agentIds: ['nexus'], workspaceId: samBoard });
      if (res.status < 400 || t.model.calls() !== calls) throw new Error(`answered ${res.status}; the agents ran on a board Pat is not on`);
      return `refused with ${res.status}`;
    });
    await check('redteam', 'made-up agent names give a plain answer, not raw errors', async () => {
      const res = await t.api(pat, 'POST', '/api/group-chat', { messages: [{ from: 'me', text: 'hi' }], agentIds: ['../../not-an-agent', 'x'.repeat(500)] });
      if (/\bat [\w.]+ \(|node_modules|ECONN|SELECT |INSERT /.test(res.text)) throw new Error(`answered ${res.status} with raw server text: ${res.text.slice(0, 100)}`);
      return `answered ${res.status}: ${String(res.body?.error || res.text).slice(0, 80)}`;
    });
  },
};
