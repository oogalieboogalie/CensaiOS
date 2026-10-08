import { jest } from '@jest/globals';

const logger = {
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  startTimer: jest.fn(() => () => 1),
};
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: jest.fn(() => logger) }));

const resolveChatTarget = jest.fn();
jest.unstable_mockModule('../server/routes/chat/chatTarget.js', () => ({ resolveChatTarget }));

const {
  pcmToWav,
  speakableText,
  synthesizeSpeech,
  transcribeAudio,
} = await import('../server/aiGateway/speech.js');
const { handleCapabilities, handleSpeech, handleTranscribe } = await import('../server/routes/chat/media.js');
const { getModelCapabilities } = await import('../src/lib/chat/modelCapabilities.js');

const WAV_B64 = Buffer.from('RIFF....WAVEfmt fake').toString('base64');
const envSnapshot = { ...process.env };

function response({ ok = true, status = 200, json = null, bytes = null, text = '' } = {}) {
  return {
    ok, status,
    json: async () => json,
    text: async () => text,
    arrayBuffer: async () => Uint8Array.from(bytes || []).buffer,
    headers: { get: () => null },
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}

let fetchMock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  delete process.env.HOMEBASE_MODE;
  delete process.env.CENSAI_MODE;
});
afterEach(() => jest.clearAllMocks());
afterAll(() => { process.env = envSnapshot; });

describe('speech-to-text', () => {
  test('OpenAI: multipart upload to /audio/transcriptions with the user key', async () => {
    fetchMock.mockResolvedValue(response({ json: { text: ' hello world ' } }));
    const result = await transcribeAudio({
      provider: 'openai', apiKey: 'sk-user', baseUrl: 'https://api.openai.com/v1',
      audio: { mime: 'audio/wav', base64: WAV_B64 }, fetchImpl: fetchMock,
    });
    expect(result.text).toBe('hello world');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers.Authorization).toBe('Bearer sk-user');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('model')).toBe('gpt-4o-mini-transcribe');
    const file = init.body.get('file');
    expect(file.name).toBe('speech.wav');
    expect(Buffer.from(await file.arrayBuffer()).toString('base64')).toBe(WAV_B64);
  });

  test('Gemini: generateContent with the clip inline', async () => {
    fetchMock.mockResolvedValue(response({ json: { candidates: [{ content: { parts: [{ text: 'hola' }] } }] } }));
    const result = await transcribeAudio({
      provider: 'google', apiKey: 'AIza-user', audio: { mime: 'audio/wav', base64: WAV_B64 }, fetchImpl: fetchMock,
    });
    expect(result.text).toBe('hola');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('AIza-user');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'audio/wav', data: WAV_B64 } });
  });

  test('a refused key becomes a clear 401', async () => {
    fetchMock.mockResolvedValue(response({ ok: false, status: 401, text: 'bad key' }));
    await expect(transcribeAudio({ provider: 'openai', apiKey: 'nope', audio: { mime: 'audio/wav', base64: WAV_B64 }, fetchImpl: fetchMock }))
      .rejects.toMatchObject({ statusCode: 401, code: 'SPEECH_AUTH_FAILED' });
  });

  test('providers without a speech API are refused before any request', async () => {
    await expect(transcribeAudio({ provider: 'ollama', apiKey: 'x', audio: { base64: WAV_B64 }, fetchImpl: fetchMock }))
      .rejects.toMatchObject({ statusCode: 400, code: 'SPEECH_UNSUPPORTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('text-to-speech', () => {
  test('OpenAI: /audio/speech returns mp3 bytes', async () => {
    fetchMock.mockResolvedValue(response({ bytes: Buffer.from('ID3fake-mp3') }));
    const result = await synthesizeSpeech({ provider: 'openai', apiKey: 'sk-user', text: '**Hello** `there`', fetchImpl: fetchMock });
    expect(result.mime).toBe('audio/mpeg');
    expect(Buffer.from(result.base64, 'base64').toString()).toBe('ID3fake-mp3');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(JSON.parse(init.body)).toEqual({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'Hello there', response_format: 'mp3' });
  });

  test('Gemini: PCM from the TTS model is wrapped as WAV', async () => {
    const pcm = Buffer.alloc(480, 1);
    fetchMock.mockResolvedValue(response({
      json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] },
    }));
    const result = await synthesizeSpeech({ provider: 'google', apiKey: 'AIza', text: 'hi', fetchImpl: fetchMock });
    expect(result.mime).toBe('audio/wav');
    const wav = Buffer.from(result.base64, 'base64');
    expect(wav.slice(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.length).toBe(44 + pcm.length);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
  });

  test('speakableText drops code blocks and markdown', () => {
    expect(speakableText('# Title\nSee [docs](http://x) and\n```js\nconst a=1\n```')).toBe('Title See docs and (code omitted)');
  });

  test('pcmToWav writes a valid header', () => {
    const wav = pcmToWav(Buffer.alloc(10), { sampleRate: 16000 });
    expect(wav.slice(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(40)).toBe(10);
  });
});

describe('chat media routes', () => {
  const openaiTarget = {
    provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-user', personalKey: true,
    capabilities: getModelCapabilities('openai', 'gpt-4o'),
  };

  test('capabilities returns model and capability map without the key', async () => {
    resolveChatTarget.mockResolvedValue(openaiTarget);
    const res = mockRes();
    await handleCapabilities({ query: { agentId: 'genesis' }, session: { userId: 'u1' } }, res);
    expect(resolveChatTarget).toHaveBeenCalledWith({ agentId: 'genesis', workspaceId: null, userId: 'u1' });
    expect(res.body.model).toBe('gpt-4o');
    expect(res.body.capabilities.image).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('sk-user');
  });

  test('transcribe goes through the agent provider', async () => {
    resolveChatTarget.mockResolvedValue(openaiTarget);
    fetchMock.mockResolvedValue(response({ json: { text: 'ship it' } }));
    const res = mockRes();
    await handleTranscribe({ body: { agentId: 'genesis', audio: `data:audio/wav;base64,${WAV_B64}` }, session: { userId: 'u1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'ship it', model: 'gpt-4o-mini-transcribe' });
  });

  test('transcribe is refused for a model with native audio (the clip goes to the model instead)', async () => {
    resolveChatTarget.mockResolvedValue({ ...openaiTarget, provider: 'google', capabilities: getModelCapabilities('google', 'gemini-2.5-flash') });
    const res = mockRes();
    await handleTranscribe({ body: { agentId: 'a', audio: `data:audio/wav;base64,${WAV_B64}` } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('SPEECH_UNSUPPORTED');
  });

  test('speech is refused for providers without TTS', async () => {
    resolveChatTarget.mockResolvedValue({ provider: 'ollama', model: 'llama3.1:8b', capabilities: getModelCapabilities('ollama', 'llama3.1:8b') });
    const res = mockRes();
    await handleSpeech({ body: { agentId: 'a', text: 'hello' } }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('hosted users must bring their own key for voice', async () => {
    process.env.HOMEBASE_MODE = 'cloud_saas';
    resolveChatTarget.mockResolvedValue({ ...openaiTarget, personalKey: false, apiKey: 'server-key' });
    const res = mockRes();
    await handleSpeech({ body: { agentId: 'a', text: 'hello' }, session: { userId: 'u1', userRole: 'user' } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('SPEECH_PERSONAL_KEY_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('speech returns a playable data URL', async () => {
    resolveChatTarget.mockResolvedValue(openaiTarget);
    fetchMock.mockResolvedValue(response({ bytes: Buffer.from('mp3') }));
    const res = mockRes();
    await handleSpeech({ body: { agentId: 'a', text: 'hello' } }, res);
    expect(res.body.audio).toBe(`data:audio/mpeg;base64,${Buffer.from('mp3').toString('base64')}`);
  });
});
