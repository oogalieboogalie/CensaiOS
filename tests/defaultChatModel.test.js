// The default chat model must never go stale silently. Offline only: the
// retirement dates live in shared/models/defaultChatModel.js and Ollama is faked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const completions = [];
jest.unstable_mockModule('../server/chatModel/completion.js', () => ({
  fetchChatCompletion: async (baseUrl, apiKey, body) => {
    completions.push({ baseUrl, apiKey, body });
    return { choices: [{ message: { content: '[0.2, 0.9]' } }] };
  },
}));

const {
  RETIRED_OLLAMA_MODELS, SHIPPED_DEFAULT_CHAT_MODEL, isRetiredOllamaModel, ollamaModelFamily, ollamaRetirementDate,
} = await import('../shared/models/defaultChatModel.js');
const {
  clearOllamaModelCache, localChatModelUsable, pickAvailableModel, sendWithOfferedModel,
} = await import('../server/aiGateway/ollamaModels.js');
const { chatCompletionHttpError } = await import('../server/aiGateway/retryPolicy.js');
const { publicChatError } = await import('../server/routes/chat/httpErrors.js');
const { MODEL_OPTIONS, defaultModelForProvider } = await import('../src/lib/agentModelOptions.js');
const { DEFAULT_CHAT_MODEL } = await import('../server/aiGateway/providers.js');
const { prioritizeArtifacts } = await import('../server/operational-intelligence/prioritization.js');

const DAY = 24 * 60 * 60 * 1000;
const LOCAL = 'http://localhost:11434/v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeOllama(models) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ object: 'list', data: models.map(id => ({ id })) }) };
  };
  return { fetchImpl, calls };
}

function notFound(model) {
  return chatCompletionHttpError(404, JSON.stringify({ error: { message: `model "${model}" not found, try pulling it first`, type: 'api_error' } }));
}

beforeEach(() => clearOllamaModelCache());

describe('the shipped default chat model', () => {
  test('is not retired and does not retire within 30 days', () => {
    const date = ollamaRetirementDate(SHIPPED_DEFAULT_CHAT_MODEL);
    if (date) {
      const daysLeft = (new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / DAY;
      // Failing here means: pick a new SHIPPED_DEFAULT_CHAT_MODEL in shared/models/defaultChatModel.js.
      expect({ model: SHIPPED_DEFAULT_CHAT_MODEL, retires: date, moreThan30DaysLeft: daysLeft > 30 })
        .toEqual({ model: SHIPPED_DEFAULT_CHAT_MODEL, retires: date, moreThan30DaysLeft: true });
    }
    expect(isRetiredOllamaModel(SHIPPED_DEFAULT_CHAT_MODEL)).toBe(false);
  });

  test('is the one the server, the model menu and the Ollama list start from', () => {
    expect(DEFAULT_CHAT_MODEL).toBe(process.env.AI_MODEL || SHIPPED_DEFAULT_CHAT_MODEL);
    expect(defaultModelForProvider('ollama')).toBe(SHIPPED_DEFAULT_CHAT_MODEL);
    for (const option of MODEL_OPTIONS.ollama) expect(isRetiredOllamaModel(option.value)).toBe(false);
  });

  test('no shipped file names a retired Ollama model', () => {
    const families = Object.keys(RETIRED_OLLAMA_MODELS).map(name => name.replace(/[.]/g, '\\.'));
    const retiredTag = new RegExp(`\\b(${families.join('|')})(:|-cloud)`, 'i');
    const files = ['.env.example', 'docker-compose.yml'];
    const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walk(rel);
      return /\.(m?js|jsx)$/.test(entry.name) ? [rel] : [];
    });
    const found = [...files, ...walk('server'), ...walk('src'), ...walk('shared')]
      .filter(file => file !== 'shared/models/defaultChatModel.js')
      .filter(file => retiredTag.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));
    expect(found).toEqual([]);
  });

  test('a made-up retired default is caught', () => {
    expect(ollamaModelFamily('MiniMax-M2.5:cloud')).toBe('minimax-m2.5');
    expect(isRetiredOllamaModel('minimax-m2.5:cloud', new Date('2026-08-01T00:00:00Z'))).toBe(true);
    expect(isRetiredOllamaModel('minimax-m2.7:cloud', new Date('2026-11-01T00:00:00Z'))).toBe(false);
    expect(isRetiredOllamaModel('minimax-m2.7:cloud', new Date('2026-11-18T00:00:00Z'))).toBe(true);
  });
});

describe('picking a model Ollama really offers', () => {
  test('keeps an offered model, else the default, else a cloud model, else any chat model', () => {
    expect(pickAvailableModel('llama3.1:8b', ['llama3.1:8b', SHIPPED_DEFAULT_CHAT_MODEL])).toBe('llama3.1:8b');
    expect(pickAvailableModel('qwen3-coder', ['qwen3-coder:latest'])).toBe('qwen3-coder:latest');
    expect(pickAvailableModel('minimax-m2.5:cloud', ['llama3.1:8b', SHIPPED_DEFAULT_CHAT_MODEL])).toBe(SHIPPED_DEFAULT_CHAT_MODEL);
    expect(pickAvailableModel('minimax-m2.5:cloud', ['nomic-embed-text:latest', 'llama3.1:8b', 'glm-4.6:cloud'])).toBe('glm-4.6:cloud');
    expect(pickAvailableModel('minimax-m2.5:cloud', ['nomic-embed-text:latest', 'llama3.1:8b'])).toBe('llama3.1:8b');
  });

  test('never picks a retired model, even one Ollama still lists', () => {
    expect(pickAvailableModel('minimax-m2.5:cloud', ['minimax-m2.5:cloud', 'llama3.1:8b'])).toBe('llama3.1:8b');
    expect(pickAvailableModel('minimax-m2.5:cloud', ['minimax-m2.5:cloud', 'nomic-embed-text'])).toBeNull();
  });

  test('Ollama with a stand-in counts as able to answer; empty or off does not', async () => {
    expect(await localChatModelUsable(LOCAL, 'minimax-m2.5:cloud', fakeOllama(['llama3.1:8b']))).toBe(true);
    clearOllamaModelCache();
    expect(await localChatModelUsable(LOCAL, 'minimax-m2.5:cloud', fakeOllama(['nomic-embed-text']))).toBe(false);
    clearOllamaModelCache();
    const off = { fetchImpl: async () => { throw new TypeError('fetch failed'); } };
    expect(await localChatModelUsable(LOCAL, 'llama3.1:8b', off)).toBe(false);
  });
});

describe('a chat sent to a model Ollama no longer offers', () => {
  const call = model => ({ config: { provider: null, model, baseUrl: LOCAL, apiKey: 'ollama' }, body: { model, messages: [] } });

  test('a retired model is swapped before sending, with no failed request', async () => {
    const ollama = fakeOllama(['llama3.1:8b', SHIPPED_DEFAULT_CHAT_MODEL]);
    const sent = [];
    const reply = await sendWithOfferedModel(call('minimax-m2.5:cloud'), async c => { sent.push(c.body.model); return 'ok'; }, ollama);
    expect(reply).toBe('ok');
    expect(sent).toEqual([SHIPPED_DEFAULT_CHAT_MODEL]);
  });

  test('"model not found" is retried once on a model Ollama offers', async () => {
    const ollama = fakeOllama(['llama3.1:8b']);
    const sent = [];
    const reply = await sendWithOfferedModel(call('made-up-gone:cloud'), async c => {
      sent.push(c.config.model);
      if (c.config.model === 'made-up-gone:cloud') throw notFound(c.config.model);
      return 'answered';
    }, ollama);
    expect(reply).toBe('answered');
    expect(sent).toEqual(['made-up-gone:cloud', 'llama3.1:8b']);
    // The next round of the same chat goes straight to the stand-in.
    await sendWithOfferedModel(call('made-up-gone:cloud'), async c => { sent.push(c.config.model); return 'again'; }, ollama);
    expect(sent).toEqual(['made-up-gone:cloud', 'llama3.1:8b', 'llama3.1:8b']);
  });

  test('a model Ollama still lists but cannot serve is passed over', async () => {
    const ollama = fakeOllama(['made-up-stub:cloud', 'llama3.1:8b']);
    const sent = [];
    const reply = await sendWithOfferedModel(call('made-up-stub:cloud'), async c => {
      sent.push(c.config.model);
      if (c.config.model === 'made-up-stub:cloud') throw notFound(c.config.model);
      return 'answered';
    }, ollama);
    expect(reply).toBe('answered');
    expect(sent).toEqual(['made-up-stub:cloud', 'llama3.1:8b']);
  });

  test('a working model costs no extra request', async () => {
    const ollama = fakeOllama([]);
    await sendWithOfferedModel(call('llama3.1:8b'), async () => 'ok', ollama);
    await sendWithOfferedModel({ ...call('gpt-4.1'), config: { provider: 'openai', model: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1' } },
      async () => 'ok', ollama);
    expect(ollama.calls).toEqual([]);
  });

  test('with nothing to stand in, the chat says so in plain words', async () => {
    const send = async c => { throw notFound(c.config.model); };
    const noList = { fetchImpl: async () => ({ ok: false, json: async () => ({}) }) };
    const error = await sendWithOfferedModel(call('made-up-gone:cloud'), send, noList).catch(e => e);
    const { body } = publicChatError(error);
    expect(body.code).toBe('MODEL_NOT_AVAILABLE');
    expect(body.message).toContain('(made-up-gone:cloud) is no longer offered');
    expect(body.message).not.toContain('try pulling');

    clearOllamaModelCache();
    const onlyEmbeddings = fakeOllama(['nomic-embed-text']);
    const keyless = await sendWithOfferedModel(call('made-up-gone:cloud'), send, onlyEmbeddings).catch(e => e);
    expect(publicChatError(keyless).body).toMatchObject({ code: 'MODEL_KEY_MISSING' });
    expect(publicChatError(keyless).body.message).toMatch(/^No AI is set up for this chat yet/);
  });

  test('other errors pass through unchanged', async () => {
    const boom = chatCompletionHttpError(500, 'made-up outage');
    const error = await sendWithOfferedModel(call('llama3.1:8b'), async () => { throw boom; }, fakeOllama([])).catch(e => e);
    expect(error).toBe(boom);
  });
});

test('ranking board items uses the chat model setting, not a hard-coded name', async () => {
  completions.length = 0;
  const artifacts = [
    { title: 'Made-up first', artifact_type: 'note', data: {}, created_at: '2026-01-01T00:00:00Z' },
    { title: 'Made-up second', artifact_type: 'note', data: {}, created_at: '2026-01-02T00:00:00Z' },
  ];
  const ranked = await prioritizeArtifacts(artifacts, { query: 'Made-up question' });
  expect(completions).toHaveLength(1);
  expect(completions[0].body.model).toBe(DEFAULT_CHAT_MODEL);
  expect(typeof completions[0].baseUrl).toBe('string');
  expect(ranked.map(a => a.title)).toEqual(['Made-up second', 'Made-up first']);
});
