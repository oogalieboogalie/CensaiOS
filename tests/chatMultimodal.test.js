import { jest } from '@jest/globals';

const envSnapshot = { ...process.env };
const logger = {
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  startTimer: jest.fn(() => () => 5),
};
const generateContent = jest.fn();
const GoogleGenAI = jest.fn(() => ({ models: { generateContent } }));

jest.unstable_mockModule('../server/secrets.js', () => ({
  getSecret: jest.fn((key) => ({ OPENAI_API_KEY: 'server-openai-key' }[key] || '')),
}));
jest.unstable_mockModule('../server/googleKeys.js', () => ({
  getGeminiApiKey: jest.fn(() => 'gemini-key'),
}));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: jest.fn(() => logger),
}));
jest.unstable_mockModule('@google/genai', () => ({ GoogleGenAI }));

const {
  AttachmentError,
  buildContentParts,
  messageAttachments,
  parseDataUrl,
  payloadNeedsGeminiNative,
} = await import('../server/aiGateway/multimodal.js');
const { resolveChatModelConfig, requestChatCompletion } = await import('../server/aiGateway/index.js');
const { toGeminiRequest } = await import('../server/aiGateway/geminiNativeChat.js');
const { getModelCapabilities } = await import('../src/lib/chat/modelCapabilities.js');

const b64 = (text) => Buffer.from(text).toString('base64');
const PNG = `data:image/png;base64,${b64('fake-png')}`;
const PDF = `data:application/pdf;base64,${b64('%PDF-1.4 fake')}`;
const WAV = `data:audio/wav;base64,${b64('RIFFfakeWAVE')}`;
const MP4 = `data:video/mp4;base64,${b64('fake-mp4')}`;
const CSV = `data:text/csv;base64,${b64('name,score\nada,10')}`;

function okJson(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data), headers: { get: () => null } };
}

const chatReply = (content = 'done') => ({
  id: 'x', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

let fetchMock;
beforeEach(() => {
  fetchMock = jest.fn(async () => okJson(chatReply()));
  global.fetch = fetchMock;
});
afterEach(() => jest.clearAllMocks());
afterAll(() => { process.env = envSnapshot; });

describe('parseDataUrl', () => {
  test('reads mime, base64 and size', () => {
    expect(parseDataUrl(PNG)).toEqual({ mime: 'image/png', base64: b64('fake-png'), bytes: 8 });
  });
  test('rejects remote URLs', () => {
    expect(parseDataUrl('https://example.com/cat.png')).toBeNull();
  });
});

describe('buildContentParts', () => {
  const gpt = getModelCapabilities('openai', 'gpt-4o');
  const gemini = getModelCapabilities('google', 'gemini-2.5-flash');
  const llama = getModelCapabilities('ollama', 'llama3.1:8b');

  test('maps images, PDFs and text files to OpenAI parts', () => {
    const parts = buildContentParts({
      text: 'compare these',
      attachments: [
        { kind: 'image', name: 'chart.png', dataUrl: PNG },
        { kind: 'file', name: 'report.pdf', mime: 'application/pdf', dataUrl: PDF },
        { kind: 'file', name: 'scores.csv', mime: 'text/csv', dataUrl: CSV },
      ],
    }, gpt);
    expect(parts[0].type).toBe('text');
    expect(parts[0].text).toContain('compare these');
    expect(parts[0].text).toContain('--- attached file: scores.csv ---\nname,score\nada,10');
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: PNG } });
    expect(parts[2]).toEqual({ type: 'file', file: { filename: 'report.pdf', file_data: `data:application/pdf;base64,${b64('%PDF-1.4 fake')}` } });
  });

  test('maps audio and video for a model that takes them', () => {
    const parts = buildContentParts({
      text: '',
      attachments: [
        { kind: 'audio', name: 'voice message.wav', mime: 'audio/wav', dataUrl: WAV },
        { kind: 'video', name: 'clip.mp4', mime: 'video/mp4', dataUrl: MP4 },
      ],
    }, gemini);
    expect(parts[0].text).toBe('Take a look at the attached content.');
    expect(parts[1]).toEqual({ type: 'input_audio', input_audio: { data: b64('RIFFfakeWAVE'), format: 'wav' } });
    expect(parts[2]).toEqual({ type: 'video_url', video_url: { url: MP4 } });
  });

  test('throws a 400 for an attachment the model cannot take', () => {
    let error;
    try {
      buildContentParts({ text: 'see', attachments: [{ kind: 'image', name: 'a.png', dataUrl: PNG }] }, llama);
    } catch (err) { error = err; }
    expect(error).toBeInstanceOf(AttachmentError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('ATTACHMENT_UNSUPPORTED');
    expect(error.message).toMatch(/can't read images/);
  });

  test('stubs without data become a note, not a failure', () => {
    const parts = buildContentParts({ text: 'and now?', attachments: [{ kind: 'video', name: 'old.mp4' }] }, llama);
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toMatch(/\[earlier attachment: old\.mp4 \(video\)/);
  });

  test('enforces the per-request total across messages', () => {
    const budget = { used: 19.9 * 1024 * 1024 };
    expect(() => buildContentParts({ text: '', attachments: [{ kind: 'image', name: 'a.png', dataUrl: `data:image/png;base64,${'A'.repeat(400000)}` }] }, gpt, { budget }))
      .toThrow(/20 MB request limit/);
  });

  test('folds the legacy image field into attachments', () => {
    expect(messageAttachments({ image: PNG })).toEqual([{ kind: 'image', name: 'image', dataUrl: PNG }]);
  });
});

describe('gateway routing', () => {
  test('OpenAI provider goes to api.openai.com with the image + PDF parts intact', async () => {
    const config = resolveChatModelConfig({ modelProvider: 'openai', modelName: 'gpt-4o' });
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.apiKey).toBe('server-openai-key');

    const content = buildContentParts({
      text: 'what is this',
      attachments: [{ kind: 'image', name: 'a.png', dataUrl: PNG }, { kind: 'file', name: 'r.pdf', mime: 'application/pdf', dataUrl: PDF }],
    }, getModelCapabilities('openai', 'gpt-4o'));
    await requestChatCompletion({
      config: { ...config, apiKey: 'user-vault-key' },
      body: { messages: [{ role: 'user', content }] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer user-vault-key');
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe('gpt-4o');
    expect(sent.messages[0].content.map((p) => p.type)).toEqual(['text', 'image_url', 'file']);
  });

  test('OpenAI provider without any key fails loudly instead of hitting the local default', async () => {
    await expect(requestChatCompletion({
      config: { provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: '' },
      body: { messages: [{ role: 'user', content: 'hi' }] },
    })).rejects.toThrow(/OpenAI API key is missing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Gemini via the compat endpoint keeps images on the compat path', async () => {
    const content = buildContentParts({ text: 'look', attachments: [{ kind: 'image', name: 'a.png', dataUrl: PNG }] }, getModelCapabilities('google', 'gemini-2.5-flash'));
    await requestChatCompletion({
      config: { provider: 'google', model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'g' },
      body: { messages: [{ role: 'user', content }] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  test('Gemini turns with a PDF or video switch to the native API as inlineData', async () => {
    generateContent.mockResolvedValue({ text: 'a cat video', candidates: [{ finishReason: 'STOP' }] });
    const content = buildContentParts({
      text: 'summarize',
      attachments: [{ kind: 'video', name: 'clip.mp4', mime: 'video/mp4', dataUrl: MP4 }, { kind: 'file', name: 'r.pdf', mime: 'application/pdf', dataUrl: PDF }],
    }, getModelCapabilities('google', 'gemini-2.5-flash'));
    const payload = { messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content }] };
    expect(payloadNeedsGeminiNative(payload)).toBe(true);

    const result = await requestChatCompletion({
      config: { provider: 'google', model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'g-key' },
      body: payload,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'g-key' });
    const request = generateContent.mock.calls[0][0];
    expect(request.config.systemInstruction).toBe('be brief');
    expect(request.contents[0].parts).toEqual([
      { text: 'summarize' },
      { inlineData: { mimeType: 'video/mp4', data: b64('fake-mp4') } },
      { inlineData: { mimeType: 'application/pdf', data: b64('%PDF-1.4 fake') } },
    ]);
    expect(result.choices[0].message.content).toBe('a cat video');
  });

  test('native Gemini request carries audio as inlineData', () => {
    const request = toGeminiRequest({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'input_audio', input_audio: { data: 'QUJD', format: 'wav' } }] }],
    });
    expect(request.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'audio/wav', data: 'QUJD' } });
  });
});
