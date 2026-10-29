// Model Arena for two people. Pat Example saves a made-up OpenAI key and
// races one made-up request against two stand-in models; Sam Example sees
// the same race on the shared board. Red team: Pat's key never reaches Sam
// (not on Sam's screen, the window record or any answer Sam's browser got),
// and Sam racing the same models never runs on Pat's key. The log keeps
// model names and counts, never the request or a key.

import { openBoard, readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';
import { STANDIN_ANSWER } from '../standinModel.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PAT_KEY = 'made-up-openai-key-172AR7Q';
const PAT_END = PAT_KEY.slice(-4);
const LANES = [{ provider: 'openai', model: 'gpt-4.1-mini' }, { provider: 'openai', model: 'gpt-4.1' }];

function listen(page) {
  const bodies = [];
  page.on('response', async (res) => {
    try { bodies.push(await res.text()); } catch { /* streamed or gone */ }
  });
  return bodies;
}

async function race(page, id, words) {
  const frame = windowFrame(page, id);
  await frame.getByRole('textbox', { name: 'Request to send to every model' }).fill(words);
  await frame.getByRole('button', { name: 'Race' }).click({ timeout: 10_000 });
}

async function lastRunOn(page, id, test, ms = 30_000) {
  const until = Date.now() + ms;
  let run = null;
  while (Date.now() < until) {
    run = (await readWindow(page, id))?.lastRun || null;
    if (test(run)) return run;
    await page.waitForTimeout(300);
  }
  return run;
}

const statuses = (run) => (run?.results || []).map((r) => r?.status).join(',');

export default {
  id: 'modelArena',
  label: 'Model Arena: two people, one race, each on their own key',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const ASK = `Made-up race: name a made-up bakery ${run}`;
    const SAM_ASK = `Made-up race from Sam ${run}`;
    t.typed.push(PAT_KEY, ASK, SAM_ASK);
    const samHeard = listen(sam.page);
    let win;

    await check('walk', 'Pat saves a made-up key and races a made-up request against two stand-in models', async ({ shot }) => {
      const saved = await t.api(pat, 'POST', '/api/keys', { provider: 'openai', apiKey: PAT_KEY });
      if (saved.status >= 400) throw new Error(`Pat's made-up key was refused (${saved.status})`);
      win = await spawnWindow(pat.page, 'modelArena', { lanes: LANES }, { x: 40, y: 40 }, { w: 1100, h: 640 });
      const before = t.model.recent().length;
      await race(pat.page, win, ASK);
      const done = await lastRunOn(pat.page, win, (r) => statuses(r) === 'done,done');
      const frame = windowFrame(pat.page, win);
      await frame.getByText(STANDIN_ANSWER).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(pat.page, 'pat-races-two-models');
      if (statuses(done) !== 'done,done') throw new Error(`the lanes ended ${statuses(done) || 'with nothing saved'}`);
      const calls = t.model.recent().slice(before).filter((c) => c.messages.some((m) => String(m.content).includes(ASK)));
      if (calls.length !== 2) throw new Error(`${calls.length} model call(s) carried the request, not two`);
      if (calls.some((c) => c.keyEnd !== PAT_END)) throw new Error('a lane did not run on Pat\'s own key');
      return `both lanes answered ("${STANDIN_ANSWER}"), each on Pat's own key (${calls.map((c) => c.model).join(' and ')})`;
    });

    await check('walk', 'Sam sees the race and both answers', async ({ shot }) => {
      if (!win) throw note('the Model Arena window never opened');
      const frame = windowFrame(sam.page, win);
      const saved = await lastRunOn(sam.page, win, (r) => statuses(r) === 'done,done', 10_000);
      await frame.getByText(STANDIN_ANSWER).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await sideBySide(t, 'sam-sees-the-race', shot);
      const shown = await frame.getByText(STANDIN_ANSWER).count();
      if (statuses(saved) !== 'done,done') throw new Error('the finished race never reached Sam\'s board');
      if (shown < 2) throw new Error(`Sam's open window shows ${shown} of the 2 answers until Sam reopens it`);
      return 'Sam\'s screen shows both answers, with their times';
    });

    await check('walk', 'after reloading the board, Sam sees both saved answers', async ({ shot }) => {
      if (!win) throw note('the Model Arena window never opened');
      await openBoard(sam.page, t.workspaceId, t.web);
      const frame = windowFrame(sam.page, win);
      await frame.getByText(STANDIN_ANSWER).first().waitFor({ timeout: 20_000 }).catch(() => {});
      await shot(sam.page, 'sam-reloads-and-sees-the-race');
      const shown = await frame.getByText(STANDIN_ANSWER).count();
      if (shown < 2) throw new Error(`even after a reload Sam sees ${shown} of the 2 answers`);
      return 'the race is saved on the board: a fresh load shows both answers';
    });

    await check('redteam', 'Pat\'s key never reaches Sam', async () => {
      const record = JSON.stringify(await readWindow(sam.page, win));
      const places = [['the shared window', record], ['Sam\'s page', await sam.page.content()], ['the answers Sam\'s browser got', samHeard.join('\n')]];
      const seen = places.filter(([, text]) => text.includes(PAT_KEY) || text.includes(PAT_END)).map(([where]) => where);
      if (seen.length) throw new Error(`Pat's key or its last letters show in ${seen.join(', ')}`);
      return `checked the shared window, Sam's page and ${samHeard.length} answers: no key, no "${PAT_END}"`;
    });

    await check('redteam', 'Sam racing the same models never runs on Pat\'s key', async ({ shot }) => {
      const before = t.model.recent().length;
      await race(sam.page, win, SAM_ASK);
      const ended = await lastRunOn(sam.page, win, (r) => (r?.results || []).length === 2 && !/streaming|waiting/.test(statuses(r)) && r.at && JSON.stringify(r).includes('error') || statuses(r) === 'done,done', 30_000);
      await sam.page.waitForTimeout(1000);
      await shot(sam.page, 'sam-races-without-a-key');
      const onPat = t.model.recent().slice(before).filter((c) => c.keyEnd === PAT_END);
      if (onPat.length) throw new Error(`${onPat.length} of Sam's lanes ran on Pat's key`);
      const text = await windowFrame(sam.page, win).innerText();
      return `none of Sam's lanes used Pat's key; Sam's lanes ended ${statuses(ended) || 'unsaved'}${/key/i.test(text) ? ' and Sam is told to add a key' : ''}`;
    });

    await check('redteam', 'the log keeps model names and counts, never the request or a key', async () => {
      const bad = t.serverLog().split('\n').filter((line) => [PAT_KEY, PAT_END, ASK, SAM_ASK].some((w) => line.includes(w)));
      if (bad.length) throw new Error(`${bad.length} log lines carry a key or the request`);
      return 'no log line carries a key, its last letters or the request';
    });
  },
};
