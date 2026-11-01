// AI resources for two people. Pat Example saves a made-up OpenAI key and
// Sam Example a made-up Anthropic key, then both open the AI resources
// window on the shared board. Each sees their own key, masked to its last
// four letters. Red team: Sam never sees Pat's key or its last letters (on
// the screen, in any answer, in the key list), Sam cannot replace or delete
// Pat's key or set or ask about its balance, and the server log keeps the
// provider and account number, never a key.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';

const PAT_KEY = 'made-up-openai-key-163PQ8W';
const PAT_END = 'PQ8W';
const SAM_KEY = 'made-up-anthropic-key-163SK2Z';
const SAM_END = 'SK2Z';
const SAM_SWAP = 'made-up-openai-key-from-sam-163ZZ9V';

/** Everything a browser was sent: the body of every answer it got. */
function listen(page) {
  const bodies = [];
  page.on('response', async (res) => {
    try { bodies.push(await res.text()); } catch { /* streamed or gone */ }
  });
  return bodies;
}

const cards = async (t, who) => (await t.api(who, 'GET', '/api/ai-resources'))?.body?.keys || [];
const patCard = async (t) => (await cards(t, t.pat)).find((c) => c.mine && c.provider === 'openai');

async function windowText(page, id) {
  const frame = windowFrame(page, id);
  const refresh = frame.getByRole('button', { name: 'Refresh' });
  if (await refresh.count()) await refresh.first().click().catch(() => {});
  await page.waitForTimeout(1200);
  return frame.innerText();
}

export default {
  id: 'aiResources',
  label: 'AI resources: two people, each with their own key',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_KEY, SAM_KEY, SAM_SWAP);
    const samHeard = listen(sam.page);
    let win;

    await check('walk', 'Pat saves a made-up key and sees it, masked, in AI resources', async ({ shot }) => {
      const saved = await t.api(pat, 'POST', '/api/keys', { provider: 'openai', apiKey: PAT_KEY });
      if (saved.status >= 400) throw new Error(`Pat's made-up key was refused (${saved.status})`);
      win = await spawnWindow(pat.page, 'aiResources', {}, { x: 60, y: 60 }, { w: 920, h: 660 });
      const frame = windowFrame(pat.page, win);
      await frame.getByText('OpenAI').first().waitFor({ timeout: 15_000 }).catch(() => {});
      const text = await windowText(pat.page, win);
      await shot(pat.page, 'pat-sees-own-key');
      if (!text.includes('OpenAI')) throw new Error('Pat\'s window shows no OpenAI key');
      if (!text.includes(PAT_END)) throw new Error(`Pat's window does not show the last letters "${PAT_END}"`);
      if (text.includes(PAT_KEY)) throw new Error('Pat\'s window shows the whole key');
      return `Pat sees an OpenAI card ending in ${PAT_END}, not the whole key`;
    });

    await check('walk', 'Sam saves a made-up key and sees only Sam\'s own on Sam\'s screen', async ({ shot }) => {
      if (!win) throw note('the window never opened');
      const saved = await t.api(sam, 'POST', '/api/keys', { provider: 'anthropic', apiKey: SAM_KEY });
      if (saved.status >= 400) throw new Error(`Sam's made-up key was refused (${saved.status})`);
      await windowFrame(sam.page, win).waitFor({ timeout: 15_000 });
      const text = await windowText(sam.page, win);
      await shot(sam.page, 'sam-sees-own-key');
      const problems = [];
      if (!text.includes(SAM_END)) problems.push(`Sam's window does not show Sam's key ending "${SAM_END}"`);
      if (text.includes(PAT_END)) problems.push('Sam\'s window shows the last letters of Pat\'s key');
      if (problems.length) throw new Error(problems.join('; '));
      return `Sam sees an Anthropic card ending in ${SAM_END} and nothing of Pat's`;
    });

    await check('walk', 'Pat\'s screen never shows Sam\'s key', async ({ shot }) => {
      const text = await windowText(pat.page, win);
      const answer = JSON.stringify(await cards(t, pat));
      await shot(pat.page, 'pat-does-not-see-sams-key');
      if (text.includes(SAM_END) || answer.includes(SAM_END)) throw new Error('Pat sees the last letters of Sam\'s key');
      return 'Pat\'s window and Pat\'s answer list only Pat\'s key';
    });

    await check('redteam', 'Sam never sees Pat\'s key or its last letters', async () => {
      const keys = await t.api(sam, 'GET', '/api/keys');
      const resources = await t.api(sam, 'GET', '/api/ai-resources');
      const pageText = await sam.page.content();
      const seen = [['Sam\'s key list', keys.text], ['Sam\'s AI resources answer', resources.text], ['Sam\'s page', pageText], ['the answers Sam\'s browser got', samHeard.join('\n')]]
        .filter(([, text]) => String(text).includes(PAT_KEY) || String(text).includes(PAT_END)).map(([where]) => where);
      if (seen.length) throw new Error(`Pat's key or its last letters show in ${seen.join(', ')}`);
      return `checked Sam's key list, Sam's AI resources answer, Sam's page and ${samHeard.length} answers: no key, no "${PAT_END}"`;
    });

    await check('redteam', 'Sam cannot replace or delete Pat\'s key, or set or ask its balance', async () => {
      const before = await patCard(t);
      if (!before) throw note('Pat\'s key card is missing before the tries');
      const tries = [
        ['POST', '/api/keys', { provider: 'openai', apiKey: SAM_SWAP }],
        ['DELETE', '/api/keys/openai'],
        ['PUT', '/api/ai-resources/budget', { keyId: before.keyId, budgetUsd: 1 }],
        ['POST', '/api/ai-resources/ask-provider', { keyId: before.keyId }],
      ];
      const answers = [];
      for (const [method, url, data] of tries) answers.push(`${method} ${url.replace('/api/', '')} ${(await t.api(sam, method, url, data)).status}`);
      const after = await patCard(t);
      const problems = [];
      if (!after) problems.push('Pat\'s key is gone');
      else if (after.keyId !== before.keyId || !after.masked.endsWith(PAT_END)) problems.push(`Pat's key changed to one ending "${after.masked.slice(-4)}"`);
      if (after?.budgetUsd != null) problems.push(`a starting amount of ${after.budgetUsd} was set on Pat's key`);
      const budget = answers[2].split(' ').pop();
      const ask = answers[3].split(' ').pop();
      if (budget !== '404' || ask !== '404') problems.push(`the balance routes answered ${budget} and ${ask}, not 404`);
      if (problems.length) throw new Error(`${problems.join('; ')} (${answers.join(', ')})`);
      return `Pat's key is unchanged (${answers.join(', ')}); Sam's own save and delete touched only Sam's row`;
    });

    await check('redteam', 'the server log names the provider and account, never a key or a name', async () => {
      const lines = t.serverLog().split('\n').filter((line) => /\[keys\]|\[ai-resources\]/.test(line));
      if (!lines.some((line) => line.includes('key saved'))) throw note('no "key saved" line in the server log');
      const bad = lines.filter((line) => [PAT_KEY, SAM_KEY, SAM_SWAP, PAT_END, SAM_END].some((s) => line.includes(s)) || /Example|example\.com/.test(line));
      if (bad.length) throw new Error(`${bad.length} log lines carry a key, its last letters or a name`);
      return `${lines.length} key and AI resources log lines; none carries a key, its last letters or a name`;
    });
  },
};
