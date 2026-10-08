import { jest } from '@jest/globals';

const getAgent = jest.fn();
const getSubAgentById = jest.fn().mockResolvedValue(null);
const buildSystemPrompt = jest.fn().mockResolvedValue('agent prompt');
const getUserApiKeyConfig = jest.fn();
const resolveChatModelConfig = jest.fn();
const dbReady = jest.fn(() => true);

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady,
}));

jest.unstable_mockModule('../server/workspaces.js', () => ({
  openProject: jest.fn(),
}));

jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent,
  getSubAgentById,
  buildSystemPrompt,
}));

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  resolveChatModelConfig,
  ModelAccessError: class ModelAccessError extends Error {
    constructor(code, message, statusCode, retryAfter = null) {
      super(message);
      Object.assign(this, { name: 'ModelAccessError', code, statusCode, status: statusCode, retryAfter });
    }
  },
}));

jest.unstable_mockModule('../server/tools.js', () => ({
  filterToolsForAgent: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn() },
}));

jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: jest.fn((provider, baseUrl) => (
    provider || (baseUrl.includes('openrouter.ai') ? 'openrouter' : null)
  )),
}));

jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  buildSubAgentSystemPrompt: jest.fn(),
}));

const { prepareChatContext } = await import('../server/routes/chat/chatContext.js');

const b64 = (t) => Buffer.from(t).toString('base64');
const PNG = `data:image/png;base64,${b64('png')}`;
const PDF = `data:application/pdf;base64,${b64('%PDF')}`;
const MP4 = `data:video/mp4;base64,${b64('mp4')}`;

function useModel(provider, model) {
  resolveChatModelConfig.mockReturnValue({
    provider, model, baseUrl: provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.example/v1', apiKey: 'k',
  });
  getAgent.mockResolvedValue({ id: 'genesis', model_provider: provider, model_name: model });
}

describe('chat context: attachments follow the model capability map', () => {
  const originalMode = process.env.HOMEBASE_MODE;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HOMEBASE_MODE = 'local_desktop';
    getUserApiKeyConfig.mockResolvedValue(null);
  });
  afterAll(() => {
    if (originalMode === undefined) delete process.env.HOMEBASE_MODE;
    else process.env.HOMEBASE_MODE = originalMode;
  });

  test('a vision model gets image and PDF parts', async () => {
    useModel('openrouter', 'anthropic/claude-sonnet-4.5');
    const context = await prepareChatContext('genesis', null, [
      { from: 'me', text: 'read these', attachments: [
        { kind: 'image', name: 'a.png', dataUrl: PNG },
        { kind: 'file', name: 'spec.pdf', mime: 'application/pdf', dataUrl: PDF },
      ] },
    ]);
    const user = context.chatMessages[1];
    expect(user.role).toBe('user');
    expect(user.content.map((p) => p.type)).toEqual(['text', 'image_url', 'file']);
  });

  test('a text-only model rejects an image with a 400 instead of dropping it', async () => {
    useModel('ollama', 'llama3.1:8b');
    await expect(prepareChatContext('genesis', null, [
      { from: 'me', text: 'what is this', image: PNG },
    ])).rejects.toMatchObject({ statusCode: 400, code: 'ATTACHMENT_UNSUPPORTED' });
  });

  test('video only goes to models that watch video', async () => {
    useModel('openrouter', 'anthropic/claude-sonnet-4.5');
    await expect(prepareChatContext('genesis', null, [
      { from: 'me', text: 'summarize', attachments: [{ kind: 'video', name: 'c.mp4', mime: 'video/mp4', dataUrl: MP4 }] },
    ])).rejects.toMatchObject({ statusCode: 400 });

    useModel('google', 'gemini-2.5-flash');
    const context = await prepareChatContext('genesis', null, [
      { from: 'me', text: 'summarize', attachments: [{ kind: 'video', name: 'c.mp4', mime: 'video/mp4', dataUrl: MP4 }] },
    ]);
    expect(context.chatMessages[1].content[1]).toEqual({ type: 'video_url', video_url: { url: MP4 } });
  });

  test('a vault model override decides capabilities', async () => {
    useModel('openrouter', 'deepseek/deepseek-chat');
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'mine', modelName: 'openai/gpt-4.1' });
    const context = await prepareChatContext('genesis', null, [
      { from: 'me', text: 'look', image: PNG },
    ], 7, 'user');
    expect(context.reqModel).toBe('openai/gpt-4.1');
    expect(context.chatMessages[1].content[1].type).toBe('image_url');
  });

  test('plain text messages are unchanged', async () => {
    useModel('ollama', 'llama3.1:8b');
    const context = await prepareChatContext('genesis', null, [{ from: 'me', text: 'hi' }]);
    expect(context.chatMessages[1]).toEqual({ role: 'user', content: 'hi' });
  });
});
