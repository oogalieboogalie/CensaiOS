// An agent runs only the tools it was given. A model can name any tool, one
// it knows from its training or one that words in the chat ask for, so the
// stand-in model names tools the agent was never given and the tool must not
// run. Pat Example (the owner) shares Atlas with outside apps, where Atlas is
// given only look-up tools: an outside app's question has Atlas look up its
// memories, then names remember, which outside apps are not given. Off a
// board, Pat's own Atlas names github_read_file, which Atlas is not given
// there. On the board shared with Sam Example (a teammate), a made-up Notes
// Reader given only recall is asked by Sam to remember a note. Each time the
// chat gets plain words, the tool does not run (no note is saved, the made-up
// GitHub is never asked), and both screens show the same. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { fileAsk } from '../standinFileAsk.mjs';
import { STANDIN_GITHUB_OWNER } from '../standinGithub.mjs';
import { sideBySide } from '../sideBySide.mjs';

const README = 'Made-up readme: the garden club plan lives in this repo.';
const NOTES = { id: 'made-up-notes-reader', name: 'Made-up Notes Reader', tools: ['recall'] };
const NOT_GIVEN = 'is not one of the tools you were given here, so it did not run';

const msgsOf = async (page, id) => (await readWindow(page, id))?.msgs || [];
const answersAfter = (msgs, text, from = 'me') => {
  const at = msgs.findIndex((m) => m.from === from && m.text === text);
  return at < 0 ? [] : msgs.slice(at + 1).filter((m) => m.from !== from);
};

async function waitForAnswer(page, id, text, { from = 'me', ms = 45_000 } = {}) {
  const until = Date.now() + ms;
  for (;;) {
    const answer = answersAfter(await msgsOf(page, id), text, from).find((m) => /Made-up file answer/.test(String(m.text || '')));
    if (answer) return String(answer.text);
    if (Date.now() > until) return '';
    await page.waitForTimeout(250);
  }
}

/** Puts the made-up agent in a browser's agent list, the way the agent editor does after saving. */
const knowAgent = (page, record) => page.evaluate(async (agent) => {
  const store = await import('/src/lib/agentStore.js');
  store.addAgent(agent);
}, record);

async function say(page, id, text) {
  const box = windowFrame(page, id).getByPlaceholder(/^Message /).first();
  await box.fill(text);
  await box.press('Enter');
}

let asks = 0;
// Numbered, so one ask's answers are never read as another's.
const numbered = (t, words) => {
  const said = `${words} (made-up ask ${asks += 1})`;
  t.typed.push(said);
  return said;
};

/** What the tools answered in the stand-in model's turns for one ask. */
const toolResults = (t, said) => t.model.recent().filter((r) => JSON.stringify(r.messages).includes(JSON.stringify(said).slice(1, -1)))
  .flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => String(m.content || '')));

/** Asks `agentId` in a chat sent with no board, as `who`. */
async function askOffBoard(t, who, agentId, words) {
  const said = numbered(t, words);
  const res = await t.api(who, 'POST', '/api/chat', { agentId, stream: false, messages: [{ from: 'me', text: said }] });
  return { results: toolResults(t, said), raw: String(res.text || ''), status: res.status };
}

/** Asks Atlas through its outside-app door with a made-up key, as an app outside censaiOS does. */
async function askFromOutside(t, door, words) {
  const said = numbered(t, words);
  const res = await fetch(`${t.web}/api/mcp/agents/${encodeURIComponent(door.id)}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${door.key}` },
    body: JSON.stringify({ message: said }),
  });
  const body = await res.json().catch(() => ({}));
  return { said, results: toolResults(t, said), answer: String(body?.answer || body?.error || ''), status: res.status };
}

const fail = (problems, ok) => {
  if (problems.length) throw new Error(problems.join('; '));
  return ok;
};
const said = (results) => (results.length ? `"${results.at(-1).slice(0, 100)}"` : 'no answer from the tool');

export default {
  id: 'toolsGiven',
  label: 'An agent runs only the tools it was given',
  async run(t) {
    const { pat, sam, check } = t;
    const stamp = Date.now().toString(36);
    const repoName = `made-up-garden-${stamp}`;
    const repo = `${STANDIN_GITHUB_OWNER}/${repoName}`;
    const note = `Made-up note ${stamp}: the garden club meets on Tuesdays.`;
    const samsNote = `Made-up note ${stamp} from Sam: the seed swap is in May.`;
    t.github.seed(repoName, { 'README.md': README });
    t.typed.push(README, note, samsNote);
    const door = { id: null, key: null };
    let atlasChat = null;

    await check('walk', "Pat puts Atlas's chat on the shared board, shares Atlas with outside apps and makes a made-up key", async () => {
      atlasChat = await spawnWindow(pat.page, 'chat', { agentId: 'atlas' }, { x: 40, y: 64 }, { w: 640, h: 560 });
      const made = await t.api(pat, 'POST', '/api/agent-endpoints', { workspaceId: t.workspaceId, agentId: 'atlas', agentName: 'Atlas', windowId: atlasChat });
      door.id = made.body?.endpoint?.id || null;
      if (!door.id) throw new Error(`Atlas could not be shared with outside apps (${made.status} ${made.body?.error || ''})`);
      const on = await t.api(pat, 'PATCH', `/api/agent-endpoints/${door.id}`, { enabled: true });
      if (on.status !== 200) throw new Error(`sharing did not turn on (${on.status})`);
      const key = await t.api(pat, 'POST', `/api/agent-endpoints/${door.id}/keys`, { label: 'Made-up outside app' });
      door.key = key.body?.key || null;
      if (!door.key) throw new Error(`no key was made (${key.status})`);
      return 'Atlas is shared with outside apps, with one made-up key; outside apps get its look-up tools only';
    });

    await check('walk', "an outside app's question has Atlas look up its memories, a look-up tool outside apps are given: Atlas answers, and the question and answer show in Atlas's chat on both screens", async ({ shot }) => {
      if (!door.key) throw new Error('Atlas was not shared in the step before');
      const asked = await askFromOutside(t, door, fileAsk('', '', 'recall', { args: { query: 'garden club' } }));
      const patSees = await waitForAnswer(pat.page, atlasChat, asked.said, { from: 'outside', ms: 15_000 });
      const samSees = await waitForAnswer(sam.page, atlasChat, asked.said, { from: 'outside', ms: 15_000 });
      await sideBySide(t, 'an-outside-app-has-atlas-look-up-its-memories', shot);
      const problems = [];
      if (asked.status !== 200) problems.push(`the outside call answered ${asked.status} ${asked.answer.slice(0, 80)}`);
      if (!asked.results.length || asked.results.some((r) => r.includes(NOT_GIVEN))) problems.push(`recall answered ${said(asked.results)}`);
      if (!patSees || !samSees) problems.push(`the exchange is missing from Atlas's chat on ${!patSees ? "Pat's" : "Sam's"} screen`);
      return fail(problems, `recall ran (${said(asked.results)}), and both screens show the outside app's question and Atlas's answer`);
    });

    await check('redteam', "an outside app's question makes the model name remember, which outside apps are not given: plain words, no note is saved, and both screens show the words", async ({ shot }) => {
      if (!door.key) throw new Error('Atlas was not shared in the first step');
      const asked = await askFromOutside(t, door, fileAsk('', '', 'remember', { anyway: true, args: { content: note } }));
      const patSees = await waitForAnswer(pat.page, atlasChat, asked.said, { from: 'outside', ms: 15_000 });
      const samSees = await waitForAnswer(sam.page, atlasChat, asked.said, { from: 'outside', ms: 15_000 });
      await windowFrame(sam.page, atlasChat).getByText(NOT_GIVEN).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await sideBySide(t, 'an-outside-app-cannot-make-atlas-save-a-note', shot);
      // Then the outside app has Atlas look the note up: a saved note would be found.
      const later = await askFromOutside(t, door, fileAsk('', '', 'recall', { args: { query: stamp } }));
      const problems = [];
      if (!asked.results.some((r) => r.includes(NOT_GIVEN))) problems.push(`remember answered ${said(asked.results)}`);
      if (!later.results.length) problems.push('looking the note up afterwards got no answer');
      else if (later.results.some((r) => r.includes(note))) problems.push("the outside app's note was saved in Atlas's memory");
      if (!patSees.includes(NOT_GIVEN) || !samSees.includes(NOT_GIVEN)) problems.push(`Atlas's chat shows ${JSON.stringify((patSees || samSees).slice(0, 120))}`);
      return fail(problems, `remember got ${said(asked.results)}; no note was saved; both screens show the words`);
    });

    await check('redteam', "off a board, Pat's own Atlas names github_read_file, which Atlas is not given there: plain words, and the made-up GitHub is never asked", async () => {
      const since = t.github.reads().length;
      const asked = await askOffBoard(t, pat, 'atlas', fileAsk(repo, 'README.md', 'github_read_file', { anyway: true }));
      const problems = [];
      if (asked.raw.includes(README) || asked.results.some((r) => r.includes(README))) problems.push("Pat's Atlas read the README with a tool it was not given");
      else if (!asked.results.some((r) => r.includes(NOT_GIVEN))) problems.push(`Pat's Atlas got ${said(asked.results)}`);
      const reads = t.github.reads().slice(since).filter(([, name]) => name === repoName);
      if (reads.length) problems.push(`the made-up GitHub was asked ${reads.map(([method, , what]) => `${method} ${what}`).join(', ')}`);
      return fail(problems, `Pat's Atlas got ${said(asked.results)}; GitHub was not asked`);
    });

    await check('redteam', "on the shared board, a made-up Notes Reader Pat gave only recall: Sam's ask to look something up runs, and Sam's ask that names remember gets plain words on both screens and saves nothing", async ({ shot }) => {
      const made = await t.api(pat, 'POST', '/api/agents', { id: NOTES.id, name: NOTES.name, role: 'Made-up helper', tool_scopes: { mode: 'custom', tools: NOTES.tools } });
      if (made.status >= 400) throw new Error(`Pat could not make the made-up Notes Reader (${made.status})`);
      const record = { id: NOTES.id, name: NOTES.name, role: 'Made-up helper', hue: 200, glyph: 'N', kind: 'ai' };
      await Promise.all([pat.page, sam.page].map((page) => knowAgent(page, record)));
      const chat = await spawnWindow(pat.page, 'chat', { agentId: NOTES.id }, { x: 720, y: 64 }, { w: 640, h: 560 });
      await windowFrame(sam.page, chat).getByPlaceholder(/^Message /).first().waitFor({ timeout: 20_000 });
      const look = numbered(t, fileAsk('', '', 'recall', { args: { query: 'garden club' } }));
      await say(sam.page, chat, look);
      const looked = await waitForAnswer(sam.page, chat, look);
      const keep = numbered(t, fileAsk('', '', 'remember', { anyway: true, args: { content: samsNote } }));
      await say(sam.page, chat, keep);
      const kept = await waitForAnswer(sam.page, chat, keep);
      const patSees = await waitForAnswer(pat.page, chat, keep, { ms: 15_000 });
      await sideBySide(t, 'a-tool-the-agent-was-not-given-does-not-run', shot);
      // Then Sam has it look the note up: a saved note would be found.
      const recheck = numbered(t, fileAsk('', '', 'recall', { args: { query: stamp } }));
      await say(sam.page, chat, recheck);
      const found = await waitForAnswer(sam.page, chat, recheck);
      const problems = [];
      if (!looked || looked.includes(NOT_GIVEN)) problems.push(`looking something up answered ${JSON.stringify(looked.slice(0, 120))}`);
      if (!kept.includes(NOT_GIVEN)) problems.push(`remembering answered Sam ${kept ? JSON.stringify(kept.slice(0, 140)) : 'nothing'}`);
      if (!patSees.includes(NOT_GIVEN)) problems.push("Pat's screen does not show the plain words");
      if (!found) problems.push('looking the note up afterwards got no answer');
      else if (found.includes(samsNote)) problems.push("Sam's note was saved in the Notes Reader's memory");
      return fail(problems, `recall ran for Sam; remember got the plain words on both screens and no note was saved`);
    });
  },
};
