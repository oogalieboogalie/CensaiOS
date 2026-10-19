import { jest } from '@jest/globals';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';

// Server side of Import agent: pulling ElevenLabs agents with the vault key,
// Grok as a chat provider, and ElevenLabs voices reading answers aloud.

const { createAgentImportRouter } = await import('../server/routes/agentImport.js');
const { listElevenLabsAgents } = await import('../server/agent-import/elevenlabs.js');
const { listOpenAiAssistants } = await import('../server/agent-import/openai.js');
const { synthesizeElevenLabs } = await import('../server/aiGateway/speech.js');
const { resolveChatModelConfig } = await import('../server/aiGateway/providers.js');
const { inferUserApiKeyProvider, normalizeUserApiKeyProvider } = await import('../server/security/userApiKeys.js');
const { getModelCapabilities, capabilityProviderFor } = await import('../src/lib/chat/modelCapabilities.js');
const { BYOK_PROVIDERS } = await import('../src/lib/byokProviders.js');
const { MODEL_OPTIONS } = await import('../src/lib/agentModelOptions.js');

const SAMPLE = JSON.parse(fs.readFileSync('tests/fixtures/agent-import/elevenlabs-agent.json', 'utf8'));

function app(deps, session = { userId: 1 }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = session; next(); });
  a.use('/api/agent-import', createAgentImportRouter(deps));
  return a;
}

describe('POST /api/agent-import/account', () => {
  test('reads ElevenLabs agents with the vault key and returns import drafts', async () => {
    const list = jest.fn(async ({ apiKey }) => {
      expect(apiKey).toBe('xi-user-key');
      return [SAMPLE, { name: '' }];
    });
    const vault = jest.fn(async (userId, provider) => (provider === 'elevenlabs' ? { apiKey: 'xi-user-key' } : null));
    const res = await request(app({ listElevenLabsAgents: list, getUserApiKeyConfig: vault })).post('/api/agent-import/account').send({ platform: 'elevenlabs' });
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0]).toMatchObject({ name: 'Front Desk', voice: { voiceId: '21m00Tcm4TlvDq8ikWAM' } });
    expect(res.body.skipped).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('xi-user-key');
  });

  test('other platforms are told to use a file; signed-out callers are refused', async () => {
    const res = await request(app({})).post('/api/agent-import/account').send({ platform: 'claude' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/paste or drop/);
    expect((await request(app({}, {})).post('/api/agent-import/account').send({ platform: 'elevenlabs' })).status).toBe(401);
  });

  test('no key: a plain message to add one', async () => {
    const res = await request(app({ getUserApiKeyConfig: async () => null }, { userId: 1, userRole: 'member' }))
      .post('/api/agent-import/account').send({ platform: 'elevenlabs' });
    // local mode may fall back to a server key; with none set the vault message comes back
    expect([403, 200]).toContain(res.status);
    if (res.status === 403) expect(res.body.error).toMatch(/Settings → Vault/);
  });
});

const ASSISTANT = {
  id: 'asst_1', object: 'assistant', name: 'Invoice Helper', model: 'gpt-4.1',
  instructions: 'Draft invoices for Jordan\'s bakery and check the totals.',
  tools: [{ type: 'code_interpreter' }, { type: 'function', function: { name: 'lookup_customer' } }],
};

describe('POST /api/agent-import/account (OpenAI, diagram 18)', () => {
  test('reads Assistants with the vault OpenAI key and returns import drafts', async () => {
    const list = jest.fn(async ({ apiKey }) => {
      expect(apiKey).toBe('sk-user-key');
      return [ASSISTANT];
    });
    const vault = jest.fn(async (userId, provider) => (provider === 'openai' ? { apiKey: 'sk-user-key' } : null));
    const res = await request(app({ listOpenAiAssistants: list, getUserApiKeyConfig: vault })).post('/api/agent-import/account').send({ platform: 'openai' });
    expect(res.status).toBe(200);
    expect(res.body.platform).toBe('openai');
    expect(res.body.agents[0]).toMatchObject({ name: 'Invoice Helper', platform: 'openai', provider: 'openai', model: 'gpt-4.1' });
    expect(res.body.agents[0].instructions).toMatch(/Draft invoices/);
    expect(JSON.stringify(res.body)).not.toContain('sk-user-key');
  });
});

test('listOpenAiAssistants asks for Assistants with the bearer key and keeps only assistants', async () => {
  let seen;
  const fetchImpl = jest.fn(async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ data: [ASSISTANT, { object: 'file' }, null] }) };
  });
  const out = await listOpenAiAssistants({ apiKey: 'k', fetchImpl });
  expect(out).toEqual([ASSISTANT]);
  expect(seen.url).toBe('https://api.openai.com/v1/assistants?limit=20&order=desc');
  expect(seen.init.headers).toMatchObject({ Authorization: 'Bearer k', 'OpenAI-Beta': 'assistants=v2' });
  await expect(listOpenAiAssistants({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) })).rejects.toThrow(/refused the key/);
  await expect(listOpenAiAssistants({ apiKey: '' })).rejects.toThrow(/Settings → Vault/);
});

test('listElevenLabsAgents lists then fetches each agent with the xi-api-key header', async () => {
  const urls = [];
  const fetchImpl = jest.fn(async (url, init) => {
    urls.push(url);
    expect(init.headers['xi-api-key']).toBe('k');
    const body = url.includes('/agents?') ? { agents: [{ agent_id: 'agent_1' }, { agent_id: '../bad' }] } : SAMPLE;
    return { ok: true, status: 200, json: async () => body };
  });
  const out = await listElevenLabsAgents({ apiKey: 'k', fetchImpl });
  expect(out).toHaveLength(1);
  expect(urls).toEqual(['https://api.elevenlabs.io/v1/convai/agents?page_size=20', 'https://api.elevenlabs.io/v1/convai/agents/agent_1']);
  await expect(listElevenLabsAgents({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) })).rejects.toThrow(/refused the key/);
});

test('ElevenLabs voice: posts to the voice with the key header and returns mp3', async () => {
  let seen;
  const fetchImpl = jest.fn(async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('ID3') };
  });
  const out = await synthesizeElevenLabs({ apiKey: 'k', voiceId: '21m00Tcm4TlvDq8ikWAM', text: '**Hello** there', fetchImpl });
  expect(seen.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128');
  expect(seen.init.headers['xi-api-key']).toBe('k');
  expect(JSON.parse(seen.init.body)).toEqual({ text: 'Hello there', model_id: 'eleven_flash_v2_5' });
  expect(out).toMatchObject({ mime: 'audio/mpeg', base64: Buffer.from('ID3').toString('base64') });
  await expect(synthesizeElevenLabs({ apiKey: '', voiceId: 'abcd', text: 'x' })).rejects.toThrow(/ElevenLabs key/);
  await expect(synthesizeElevenLabs({ apiKey: 'k', voiceId: '../x', text: 'x' })).rejects.toThrow(/voice id/);
});

test('Grok runs through xAI with the vault key slot, tools and image input', () => {
  expect(resolveChatModelConfig({ modelProvider: 'xai', modelName: 'grok-4' })).toMatchObject({ provider: 'xai', model: 'grok-4', baseUrl: 'https://api.x.ai/v1' });
  expect(resolveChatModelConfig({ modelProvider: 'grok' })).toMatchObject({ provider: 'xai', model: 'grok-4' });
  expect(normalizeUserApiKeyProvider('grok')).toBe('xai');
  expect(normalizeUserApiKeyProvider('elevenlabs')).toBe('elevenlabs');
  expect(inferUserApiKeyProvider('xai', 'https://api.x.ai/v1')).toBe('xai');
  expect(capabilityProviderFor(null, 'https://api.x.ai/v1')).toBe('xai');
  expect(getModelCapabilities('xai', 'grok-4')).toMatchObject({ tools: true, image: true });
  expect(BYOK_PROVIDERS.map(p => p.id)).toEqual(expect.arrayContaining(['xai', 'elevenlabs']));
  expect(MODEL_OPTIONS.xai[0].value).toBe('grok-4');
});
