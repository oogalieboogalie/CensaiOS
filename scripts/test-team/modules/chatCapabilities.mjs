// Each chat shows only what its model can do: Pat makes three chat agents on
// made-up keys, a text-only Z.ai model, a Z.ai vision model and an OpenAI
// model, and checks the picture and mic buttons on each; a picture goes
// through to the vision model, and a video dropped on a model that cannot
// watch video gets the plain "can't watch video" line. Sam sees the same
// chats. Then the wrong things: a picture sent to the text-only model behind
// the window's back, an unknown model. Red team: signed out.
// OpenAI and Z.ai calls reach the stand-in model, never the real services.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';

// A 1×1 PNG, so the picture is a real image file.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const AGENTS = [
  { id: 'pat-writer', name: 'Made-up Writer', provider: 'zai', model: 'glm-4.6', picture: false, mic: false },
  { id: 'pat-looker', name: 'Made-up Looker', provider: 'zai', model: 'glm-4.5v', picture: true, mic: false },
  { id: 'pat-speaker', name: 'Made-up Speaker', provider: 'openai', model: 'gpt-4.1', picture: true, mic: true },
];
const MIC = /^(Dictate|Record voice message)$/;

/** Puts Pat's agents in a browser's agent list, the way the agent editor does after saving. */
async function knowAgents(page, records) {
  await page.evaluate(async (list) => {
    const store = await import('/src/lib/agentStore.js');
    for (const agent of list) store.addAgent(agent);
  }, records);
}

/** What one chat window offers, once the server has said which model it runs on. */
async function controlsOf(page, id, model) {
  const frame = windowFrame(page, id);
  await frame.getByPlaceholder(/^Message /).first().waitFor({ timeout: 15_000 });
  const chip = frame.locator('[title*="Click to switch model"]').first();
  const until = Date.now() + 10_000;
  let title;
  while (!(title = (await chip.getAttribute('title').catch(() => '')) || '').startsWith(`${model}:`)) {
    if (Date.now() > until) throw new Error(`the chat says it runs on "${title.split(':')[0] || 'nothing'}", not ${model}`);
    await page.waitForTimeout(250);
  }
  return {
    picture: (await frame.getByRole('button', { name: 'Attach image' }).count()) > 0,
    mic: (await frame.getByRole('button', { name: MIC }).count()) > 0,
    video: (await frame.getByRole('button', { name: 'Attach video' }).count()) > 0,
  };
}

function compare(agent, seen) {
  const wrong = ['picture', 'mic'].filter((key) => seen[key] !== agent[key]);
  return wrong.length ? `${agent.model}: ${wrong.map((key) => `${key} ${seen[key] ? 'shown' : 'missing'}`).join(', ')}` : '';
}

export default {
  id: 'chatCapabilities',
  label: 'Chat buttons match the model',
  async run(t) {
    const { pat, sam, check } = t;
    const wins = {};
    let records = [];
    t.typed.push('Made-up question: what is in this picture?', 'Made-up sneaky picture', 'made-up-openai-key', 'made-up-zai-key');

    await check('walk', 'Pat makes three chat agents on made-up OpenAI and Z.ai keys', async () => {
      for (const provider of ['openai', 'zai']) {
        const key = await t.api(pat, 'POST', '/api/keys', { provider, apiKey: `made-up-${provider}-key` });
        if (key.status >= 400) throw new Error(`the ${provider} key was refused (${key.status})`);
      }
      for (const agent of AGENTS) {
        const res = await t.api(pat, 'POST', '/api/agents', {
          id: agent.id, name: agent.name, role: 'Made-up helper', model_provider: agent.provider, model_name: agent.model, hue: 200, glyph: 'M',
        });
        if (res.status >= 400) throw new Error(`${agent.name} was not saved (${res.status})`);
      }
      records = AGENTS.map((a) => ({ id: a.id, name: a.name, role: 'Made-up helper', model_provider: a.provider, model_name: a.model, hue: 200, glyph: 'M', kind: 'ai' }));
      return AGENTS.map((a) => `${a.name} on ${a.model}`).join(', ');
    });

    await check('walk', 'each chat shows only the buttons its model can use', async ({ shot }) => {
      await knowAgents(pat.page, records);
      const wrong = [];
      for (const [n, agent] of AGENTS.entries()) {
        wins[agent.id] = await spawnWindow(pat.page, 'chat', { agentId: agent.id }, { x: 40 + n * 470, y: 60 }, { w: 450, h: 520 });
      }
      for (const agent of AGENTS) wrong.push(compare(agent, await controlsOf(pat.page, wins[agent.id], agent.model)));
      await shot(pat.page, 'three-chats-three-models');
      if (wrong.some(Boolean)) throw new Error(wrong.filter(Boolean).join('; '));
      return 'glm-4.6: text only; glm-4.5v: picture; gpt-4.1: picture and mic';
    });

    await check('walk', 'a picture goes through to the vision model', async ({ shot }) => {
      const frame = windowFrame(pat.page, wins['pat-looker']);
      await frame.getByTestId('chat-image-input').setInputFiles({ name: 'made-up-bakery.png', mimeType: 'image/png', buffer: PNG });
      const box = frame.getByPlaceholder(/^Message /).first();
      await box.fill('Made-up question: what is in this picture?');
      await box.press('Enter');
      const answer = frame.getByText(/Stand-in answer: I see 1 picture/).first();
      await answer.waitFor({ timeout: 30_000 });
      const said = await answer.innerText();
      await shot(pat.page, 'the-picture-goes-through');
      if (!said.includes('glm-4.5v')) throw new Error(`the picture reached the wrong model: ${said}`);
      return said;
    });

    await check('walk', 'a video dropped on a model that cannot watch video gets a plain line', async ({ shot }) => {
      const frame = windowFrame(pat.page, wins['pat-writer']);
      await frame.locator('.hb-composer').first().evaluate((el) => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(64)], 'made-up-clip.mp4', { type: 'video/mp4' }));
        el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
      });
      const alert = frame.getByRole('alert').first();
      await alert.waitFor({ timeout: 10_000 });
      const said = await alert.innerText();
      await shot(pat.page, 'the-video-is-refused');
      if (!/can't watch video/.test(said)) throw new Error(`Pat saw "${said.slice(0, 120)}"`);
      return `Pat saw: ${said}`;
    });

    await check('walk', 'Sam sees the same chats with the same buttons', async ({ shot }) => {
      await knowAgents(sam.page, records);
      const wrong = [];
      for (const agent of AGENTS) wrong.push(compare(agent, await controlsOf(sam.page, wins[agent.id], agent.model)));
      await shot(sam.page, 'sam-sees-the-same-buttons');
      if (wrong.some(Boolean)) throw new Error(`on Sam's board: ${wrong.filter(Boolean).join('; ')}`);
      return 'the same buttons on Sam\'s board';
    });

    await check('hunt', 'a picture sent to the text-only model behind the window\'s back is refused plainly', async () => {
      const before = t.model.calls();
      const res = await t.api(pat, 'POST', '/api/chat', {
        agentId: 'pat-writer', workspaceId: t.workspaceId, stream: false,
        messages: [{ from: 'me', text: 'Made-up sneaky picture', attachments: [{ kind: 'image', name: 'made-up.png', dataUrl: PNG_URL }] }],
      });
      const reason = res.body?.error || res.body?.message || res.text;
      if (res.status !== 400 || !/image|picture/i.test(reason)) throw new Error(`answered ${res.status}: ${String(reason).slice(0, 120)}`);
      if (t.model.calls() !== before) throw new Error('the picture still reached the model');
      return `answered 400: ${String(reason).slice(0, 120)}`;
    });

    await check('hunt', 'an unknown model gets text only, not buttons that fail', async () => {
      const res = await t.api(pat, 'POST', '/api/agents', {
        id: 'pat-mystery', name: 'Made-up Mystery', role: 'Made-up helper', model_provider: 'zai', model_name: 'glm-made-up-9', hue: 200, glyph: 'M',
      });
      if (res.status >= 400) throw new Error(`not saved (${res.status})`);
      const caps = await t.api(pat, 'GET', `/api/chat/capabilities?agentId=pat-mystery&workspaceId=${encodeURIComponent(t.workspaceId)}`);
      const c = caps.body?.capabilities || {};
      if (c.image || c.pdf || c.audioInput || c.video || c.voiceInput) throw new Error(`it offers ${JSON.stringify(c).slice(0, 120)}`);
      return `glm-made-up-9: text${c.tools ? ' and tools' : ''} only`;
    });

    await check('redteam', 'signed out, the capability lookup and chat answer nothing', async () => {
      const before = t.model.calls();
      const caps = await t.api({ ctx: t.signedOut }, 'GET', '/api/chat/capabilities?agentId=pat-speaker');
      const chat = await t.api({ ctx: t.signedOut }, 'POST', '/api/chat', { agentId: 'pat-speaker', stream: false, messages: [{ from: 'me', text: 'x' }] });
      if (caps.status < 400 || chat.status < 400 || t.model.calls() !== before) throw new Error(`answered ${caps.status} and ${chat.status} with no sign-in`);
      return `answered ${caps.status} and ${chat.status}`;
    });
  },
};
