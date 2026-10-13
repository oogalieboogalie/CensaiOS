// "No key" is never a passing outage: the chat route answers it with code
// MODEL_KEY_MISSING (or MODEL_KEY_REJECTED) and the provider whose key it is,
// in plain words, never "try again shortly".
import { jest } from '@jest/globals';

const query = jest.fn();
const getUserApiKeyConfig = jest.fn();
let ready = true;
jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => ready }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({ getUserApiKeyConfig }));

const {
  assertProviderKey, localModelUnreachableError, missingKeyError, tagRejectedKey,
} = await import('../server/aiGateway/missingKey.js');
const { publicChatError } = await import('../server/routes/chat/httpErrors.js');
const { borrowKeyedModel, localModelReachable, pickFallbackProvider } = await import('../server/routes/chat/keyFallback.js');
const { chatCompletionHttpError } = await import('../server/aiGateway/retryPolicy.js');

beforeEach(() => {
  ready = true;
  query.mockReset();
  getUserApiKeyConfig.mockReset();
});

describe('missing keys', () => {
  test('a provider with no key fails with its name, before any request', () => {
    expect(() => assertProviderKey('openai', '')).toThrow(expect.objectContaining({ code: 'MODEL_KEY_MISSING', keyProvider: 'openai', statusCode: 400 }));
    expect(() => assertProviderKey('kimi', '')).toThrow(expect.objectContaining({ keyProvider: 'moonshot' }));
    // "ollama" is the local placeholder, never a real Gemini or Grok key.
    expect(() => assertProviderKey('google', 'ollama')).toThrow(expect.objectContaining({ keyProvider: 'google' }));
    expect(() => assertProviderKey('xai', 'ollama')).toThrow(expect.objectContaining({ keyProvider: 'xai' }));
    expect(() => assertProviderKey('openai', 'sk-1')).not.toThrow();
    expect(() => assertProviderKey('ollama', 'ollama')).not.toThrow();
    expect(() => assertProviderKey(null, '')).not.toThrow();
  });

  test('the chat says which key is missing, in plain words', () => {
    const { status, body } = publicChatError(missingKeyError('openai'));
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'MODEL_KEY_MISSING', keyProvider: 'openai' });
    expect(body.message).toBe('This chat runs on OpenAI, and no OpenAI key is saved yet. Paste your key to send your message.');
    expect(body.message).not.toMatch(/try again shortly|\.env|Vault/i);
  });

  test('nothing answering on this computer and no key: ask for one', () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const error = localModelUnreachableError(refused, 'http://localhost:11434/v1');
    expect(error).toMatchObject({ code: 'MODEL_KEY_MISSING', keyProvider: null });
    expect(publicChatError(error).body.message).toBe('No AI is set up for this chat yet. Paste a key from Claude, OpenAI or OpenRouter to send your message.');
    // A remote outage or a timeout is not a missing key.
    expect(localModelUnreachableError(refused, 'https://api.openai.com/v1')).toBeNull();
    expect(localModelUnreachableError(Object.assign(new Error('x'), { name: 'AbortError' }), 'http://localhost:11434/v1')).toBeNull();
  });

  test('a key the provider turns down says so and names the provider', () => {
    const error = tagRejectedKey(chatCompletionHttpError(401, '{"error":"invalid x-api-key"}'), 'anthropic');
    const { status, body } = publicChatError(error);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'MODEL_KEY_REJECTED', keyProvider: 'anthropic' });
    expect(body.message).toBe('Claude (Anthropic) did not accept the saved key. Paste a working key to send your message.');
    expect(tagRejectedKey(chatCompletionHttpError(500, 'x'), 'anthropic').code).toBeUndefined();
  });

  test('other failures keep their old answers', () => {
    expect(publicChatError(new Error('boom')).body.message).toBe('The AI request could not be completed. Try again shortly.');
    expect(publicChatError(new Error('boom')).body.keyProvider).toBeUndefined();
  });
});

describe('a keyed model stands in when nothing answers on this computer', () => {
  test('Claude is preferred, then OpenAI, Gemini and OpenRouter', () => {
    expect(pickFallbackProvider(['openrouter', 'openai'])).toBe('openai');
    expect(pickFallbackProvider(['tavily', 'figma'])).toBeNull();
    expect(pickFallbackProvider(['openrouter', 'anthropic'])).toBe('anthropic');
  });

  test('borrows the saved key when Ollama is not running', async () => {
    query.mockResolvedValue({ rows: [{ provider: 'tavily' }, { provider: 'anthropic' }] });
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'sk-ant-1', modelName: null });
    const borrowed = await borrowKeyedModel({ userId: 7, baseUrl: 'http://localhost:11434/v1', reachable: async () => false });
    expect(borrowed).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'sk-ant-1' });
    expect(getUserApiKeyConfig).toHaveBeenCalledWith(7, 'anthropic');
  });

  test('changes nothing when Ollama answers, the model is remote, there is no key, or no database', async () => {
    query.mockResolvedValue({ rows: [{ provider: 'anthropic' }] });
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'sk-ant-1' });
    const local = 'http://localhost:11434/v1';
    expect(await borrowKeyedModel({ userId: 7, baseUrl: local, reachable: async () => true })).toBeNull();
    expect(await borrowKeyedModel({ userId: 7, baseUrl: 'https://api.openai.com/v1', reachable: async () => false })).toBeNull();
    expect(await borrowKeyedModel({ userId: null, baseUrl: local, reachable: async () => false })).toBeNull();
    query.mockResolvedValue({ rows: [] });
    expect(await borrowKeyedModel({ userId: 7, baseUrl: local, reachable: async () => false })).toBeNull();
    ready = false;
    expect(await borrowKeyedModel({ userId: 7, baseUrl: local, reachable: async () => false })).toBeNull();
  });

  test('the reachability check is short and remembered for a moment', async () => {
    const fetchImpl = jest.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await localModelReachable('http://localhost:1/v1', { fetchImpl, now: 1000 })).toBe(false);
    expect(await localModelReachable('http://localhost:1/v1', { fetchImpl, now: 2000 })).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const up = jest.fn(async () => ({ status: 404 }));
    expect(await localModelReachable('http://localhost:2/v1', { fetchImpl: up, now: 1000 })).toBe(true);
  });
});
