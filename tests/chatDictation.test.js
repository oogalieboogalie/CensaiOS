import { jest } from '@jest/globals';

const logger = {
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  startTimer: jest.fn(() => () => 1),
};
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: jest.fn(() => logger) }));

const resolveChatTarget = jest.fn();
jest.unstable_mockModule('../server/routes/chat/chatTarget.js', () => ({ resolveChatTarget }));

const savedKeys = new Map();
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig: jest.fn(async (userId, provider) => savedKeys.get(`${userId}:${provider}`) || null),
}));

const { handleCapabilities, handleTranscribe } = await import('../server/routes/chat/media.js');
const { findDictationKey } = await import('../server/routes/chat/dictation.js');
const { getModelCapabilities } = await import('../src/lib/chat/modelCapabilities.js');

const WAV = `data:audio/wav;base64,${Buffer.from('RIFF....WAVEfmt fake').toString('base64')}`;
const claude = { provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'sk-ant-jordan', personalKey: true, capabilities: getModelCapabilities('anthropic', 'claude-sonnet-4-5') };
const grok = { provider: 'xai', model: 'grok-4', apiKey: 'xai-jordan', personalKey: true, capabilities: getModelCapabilities('xai', 'grok-4') };

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}
const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => '' });

let fetchMock;
beforeEach(() => {
  savedKeys.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});
afterEach(() => jest.clearAllMocks());

describe('Dictation in Claude and Grok chats', () => {
  test('no saved OpenAI or Google key: no mic, as before', async () => {
    resolveChatTarget.mockResolvedValue(claude);
    const res = mockRes();
    await handleCapabilities({ query: { agentId: 'a' }, session: { userId: 7 } }, res);
    expect(res.body.capabilities.voiceInput).toBeNull();
  });

  test('a saved OpenAI key turns on the Dictate mic in a Claude chat', async () => {
    savedKeys.set('7:openai', { apiKey: 'sk-openai-jordan' });
    resolveChatTarget.mockResolvedValue(claude);
    const res = mockRes();
    await handleCapabilities({ query: { agentId: 'a' }, session: { userId: 7 } }, res);
    expect(res.body.capabilities).toMatchObject({ voiceInput: 'transcribe', dictationProvider: 'openai' });
    expect(JSON.stringify(res.body)).not.toContain('sk-openai-jordan');
  });

  test('the clip is turned into text with the OpenAI key, and the log names the key, never the words', async () => {
    savedKeys.set('7:openai', { apiKey: 'sk-openai-jordan' });
    resolveChatTarget.mockResolvedValue(claude);
    fetchMock.mockResolvedValue(ok({ text: 'Book the venue for Pat' }));
    const res = mockRes();
    await handleTranscribe({ body: { agentId: 'a', audio: WAV }, session: { userId: 7 } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ text: 'Book the venue for Pat', dictationProvider: 'openai' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers.Authorization).toBe('Bearer sk-openai-jordan');
    expect(logger.info).toHaveBeenCalledWith('dictation: transcribed with the openai key for a anthropic chat');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Book the venue');
  });

  test('a Grok chat with only a Google key dictates through Gemini', async () => {
    savedKeys.set('7:google', { apiKey: 'AIza-jordan' });
    resolveChatTarget.mockResolvedValue(grok);
    fetchMock.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: 'Call Mo' }] } }] }));
    const res = mockRes();
    await handleTranscribe({ body: { agentId: 'a', audio: WAV }, session: { userId: 7 } }, res);
    expect(res.body).toMatchObject({ text: 'Call Mo', dictationProvider: 'google' });
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('AIza-jordan');
  });

  test('a refused key is logged with the reason, and the chat sees the error', async () => {
    savedKeys.set('7:openai', { apiKey: 'sk-bad' });
    resolveChatTarget.mockResolvedValue(claude);
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}), text: async () => 'bad key' });
    const res = mockRes();
    await handleTranscribe({ body: { agentId: 'a', audio: WAV }, session: { userId: 7 } }, res);
    expect(res.statusCode).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^dictation: failed with the openai key for a anthropic chat: OpenAI transcription was refused/));
  });

  test('without a key, transcribe is still refused for Claude', async () => {
    resolveChatTarget.mockResolvedValue(claude);
    const res = mockRes();
    await handleTranscribe({ body: { agentId: 'a', audio: WAV }, session: { userId: 7 } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('SPEECH_UNSUPPORTED');
  });

  test('only Claude and Grok chats borrow a key; signed-out people never do', async () => {
    savedKeys.set('7:openai', { apiKey: 'sk-openai-jordan' });
    expect(await findDictationKey(7, 'ollama')).toBeNull();
    expect(await findDictationKey(null, 'anthropic')).toBeNull();
    expect(await findDictationKey(7, 'xai')).toEqual({ provider: 'openai', apiKey: 'sk-openai-jordan' });
  });
});
