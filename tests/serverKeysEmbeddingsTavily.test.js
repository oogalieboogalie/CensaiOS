import { jest } from '@jest/globals';

// Pat Example (account 1) owns this computer; Sam Example (account 2) is a teammate.
const lines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (namespace) => {
    const write = (level) => (msg, meta) => lines.push({ namespace, level, msg, meta });
    return { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {}, startTimer: () => () => 1 };
  },
}));
const roles = { 1: 'admin', 2: 'user' };
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn(async (_sql, [id]) => ({ rows: roles[id] ? [{ role: roles[id] }] : [] })) },
}));
const savedKeys = {};
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig: jest.fn(async (id, provider) => savedKeys[`${id}:${provider}`] || null),
  inferUserApiKeyProvider: (provider) => provider,
}));
const sentConfigs = [];
jest.unstable_mockModule('../server/aiGateway/embedding.js', () => ({
  EMBEDDING_MODEL_KIND: 'embedding',
  requestEmbedding: jest.fn(async ({ config }) => { sentConfigs.push(config); return { data: [] }; }),
}));
jest.unstable_mockModule('../server/aiGateway/modelAccess.js', () => ({
  resolveModelAccess: async () => ({ governed: false }),
  applyModelAccess: (_access, prepared) => prepared,
  settleModelAccessFailure: async () => {},
  settleModelAccessSuccess: async () => {},
}));

process.env.CENSAI_MODE = 'local_desktop';
process.env.TAVILY_API_KEY = 'tvly-made-up-server-key';
process.env.COHERE_API_KEY = 'cohere-made-up-server-key';

const { resolveTavilyKey, createTavilyClient } = await import('../server/leadhound/tavily.js');
const { callModel } = await import('../server/aiGateway/callModel.js');

const embedConfig = { provider: 'cohere', model: 'embed-v4.0', baseUrl: 'https://api.cohere.com', endpoint: '/v2/embed', apiKey: 'cohere-made-up-server-key' };
const embed = (userId) => callModel({ kind: 'embedding', config: embedConfig, body: { input: 'notes' }, accessContext: { userId } });

beforeEach(() => {
  lines.length = 0;
  sentConfigs.length = 0;
  for (const key of Object.keys(savedKeys)) delete savedKeys[key];
});

describe('Tavily lead search and the owner key', () => {
  test('Pat, the owner, falls back to the server key', async () => {
    await expect(resolveTavilyKey(1)).resolves.toEqual({ apiKey: 'tvly-made-up-server-key', source: 'server' });
  });

  test('Sam gets the plain "Add a Tavily API key" message and a held-back line', async () => {
    const { apiKey, source } = await resolveTavilyKey(2);
    expect({ apiKey, source }).toEqual({ apiKey: '', source: null });
    expect(() => createTavilyClient(apiKey)).toThrow('Add a Tavily API key to run LeadHound.');
    expect(lines).toContainEqual({ namespace: 'server-keys', level: 'info', msg: 'server key held back', meta: { service: 'tavily', userId: 2 } });
    expect(JSON.stringify(lines)).not.toContain('tvly-made-up');
  });

  test('Sam with a saved own key works', async () => {
    savedKeys['2:tavily'] = { apiKey: 'tvly-sams-own-key' };
    await expect(resolveTavilyKey(2)).resolves.toEqual({ apiKey: 'tvly-sams-own-key', source: 'byok' });
  });
});

describe('embeddings and the owner key', () => {
  test("Pat's embedding runs on the server key", async () => {
    await embed(1);
    expect(sentConfigs[0].apiKey).toBe('cohere-made-up-server-key');
  });

  test("Sam's embedding is refused with the plain add-your-key message", async () => {
    await expect(embed(2)).rejects.toThrow(/key/i);
    expect(sentConfigs).toHaveLength(0);
    expect(lines).toContainEqual({ namespace: 'server-keys', level: 'info', msg: 'server key held back', meta: { service: 'cohere', userId: 2 } });
    expect(JSON.stringify(lines)).not.toContain('cohere-made-up');
  });

  test("Sam's embedding uses Sam's own saved key", async () => {
    savedKeys['2:cohere'] = { apiKey: 'cohere-sams-own-key' };
    await embed(2);
    expect(sentConfigs[0].apiKey).toBe('cohere-sams-own-key');
  });
});
