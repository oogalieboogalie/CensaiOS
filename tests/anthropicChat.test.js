import { jest } from '@jest/globals';

// Native Anthropic provider: OpenAI-shaped chat payloads become Messages API
// calls, Claude's stream comes back as the gateway's chat.completion shape,
// and tool rounds hand Claude's own content back unchanged.

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), startTimer: jest.fn(() => () => 5) };
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: jest.fn(() => logger) }));
jest.unstable_mockModule('../server/secrets.js', () => ({
  PRODUCTION_REQUIRED_SECRETS: [],
  initSecrets: jest.fn(),
  requireSecret: jest.fn(() => 'secret'),
  optionalSecret: jest.fn((name, fallback = null) => fallback),
  requireProductionSecret: jest.fn(() => 'secret'),
  getSecret: jest.fn((key) => (key === 'ANTHROPIC_API_KEY' ? 'server-claude-key' : '')),
}));

const { requestChatCompletion, resolveChatModelConfig } = await import('../server/aiGateway/index.js');
const {
  ANTHROPIC_DEFAULT_MODEL,
  toAnthropicRequest,
  toOpenAiChatCompletion,
} = await import('../server/aiGateway/anthropicChat.js');
const { inferUserApiKeyProvider, normalizeUserApiKeyProvider } = await import('../server/security/userApiKeys.js');
const { getModelCapabilities, capabilityProviderFor } = await import('../src/lib/chat/modelCapabilities.js');
const { MODEL_OPTIONS } = await import('../src/lib/agentModelOptions.js');
const { BYOK_PROVIDERS } = await import('../src/lib/byokProviders.js');
const { startAnthropicStandin } = await import('./fixtures/anthropicStandin.js');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQ=';
const TOOLS = [{ type: 'function', function: { name: 'web_search', description: 'Search the web', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } } }];

afterEach(() => jest.clearAllMocks());

describe('provider wiring', () => {
  test('resolves the anthropic provider with a Claude default model', () => {
    const config = resolveChatModelConfig({ modelProvider: 'anthropic' });
    expect(config).toMatchObject({ provider: 'anthropic', model: ANTHROPIC_DEFAULT_MODEL, baseUrl: 'https://api.anthropic.com', apiKey: 'server-claude-key' });
    expect(ANTHROPIC_DEFAULT_MODEL).toBe('claude-sonnet-5-5');
    expect(resolveChatModelConfig({ modelProvider: 'claude', modelName: 'claude-opus-5-5' })).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5' });
    // A model name left over from another provider never reaches Claude.
    expect(resolveChatModelConfig({ modelProvider: 'anthropic', modelName: 'gpt-4o' }).model).toBe(ANTHROPIC_DEFAULT_MODEL);
  });

  test('BYOK keys, capabilities and pickers know about Claude', () => {
    expect(normalizeUserApiKeyProvider('claude')).toBe('anthropic');
    expect(inferUserApiKeyProvider(null, 'https://api.anthropic.com')).toBe('anthropic');
    expect(capabilityProviderFor(null, 'https://api.anthropic.com')).toBe('anthropic');
    expect(BYOK_PROVIDERS.map(p => p.id)).toContain('anthropic');
    expect(MODEL_OPTIONS.anthropic.map(o => o.value)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
    const caps = getModelCapabilities('anthropic', 'claude-haiku-5-5');
    expect(caps).toMatchObject({ image: true, pdf: true, audioInput: false, video: false, tools: true, voiceInput: null });
    expect(getModelCapabilities('ollama', 'llama3.1:8b').tools).toBe(false);
  });
});

describe('request translation', () => {
  test('system prompt is cached, attachments become image and document blocks', () => {
    const params = toAnthropicRequest({
      model: 'claude-opus-5-5',
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are Atlas.' },
        { role: 'system', content: 'Board context: three windows.' },
        { role: 'user', content: [
          { type: 'text', text: 'What is in these?' },
          { type: 'image_url', image_url: { url: PNG } },
          { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
          { type: 'file', file: { filename: 'brief.pdf', file_data: PDF } },
        ] },
      ],
    });
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.max_tokens).toBe(16000);
    expect(params).not.toHaveProperty('temperature');
    expect(params.cache_control).toEqual({ type: 'ephemeral' });
    expect(params.system).toEqual([
      { type: 'text', text: 'You are Atlas.' },
      { type: 'text', text: 'Board context: three windows.', cache_control: { type: 'ephemeral' } },
    ]);
    expect(params.messages).toEqual([{ role: 'user', content: [
      { type: 'text', text: 'What is in these?' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
      { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQ=' }, title: 'brief.pdf' },
    ] }]);
  });

  test('tools, tool calls and parallel tool results map to Claude blocks', () => {
    const params = toAnthropicRequest({
      model: 'claude-sonnet-5-5',
      tools: TOOLS,
      tool_choice: 'required',
      messages: [
        { role: 'user', content: 'search twice' },
        { role: 'assistant', content: 'On it.', tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"q":"a"}' } },
          { id: 'call.2', type: 'function', function: { name: 'web_search', arguments: '{"q":"b"}' } },
        ] },
        { role: 'tool', tool_call_id: 'call_1', content: 'result a' },
        { role: 'tool', tool_call_id: 'call.2', content: '' },
        { role: 'system', content: 'Wrap up now.' },
      ],
    });
    expect(params.tools).toEqual([{ name: 'web_search', description: 'Search the web', input_schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }]);
    expect(params.tool_choice).toEqual({ type: 'auto' });
    expect(params.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'search twice' }] },
      { role: 'assistant', content: [
        { type: 'text', text: 'On it.' },
        { type: 'tool_use', id: 'call_1', name: 'web_search', input: { q: 'a' } },
        { type: 'tool_use', id: 'call_2', name: 'web_search', input: { q: 'b' } },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: 'result a' },
        { type: 'tool_result', tool_use_id: 'call_2', content: '(no output)' },
        { type: 'text', text: '[System note]\nWrap up now.' },
      ] },
    ]);
  });

  test('a round without tools folds tool history into text and drops thinking', () => {
    const params = toAnthropicRequest({
      messages: [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: '', anthropic_content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: { q: 'x' } },
        ] },
        { role: 'tool', tool_call_id: 'toolu_1', content: 'found x' },
        { role: 'user', content: 'Now answer.' },
      ],
    });
    expect(params).not.toHaveProperty('tools');
    expect(params.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: '[called web_search with {"q":"x"}]' }] });
    expect(params.messages[2]).toEqual({ role: 'user', content: [
      { type: 'text', text: '[tool result]\nfound x' },
      { type: 'text', text: 'Now answer.' },
    ] });
  });

  test('history that starts with the assistant gets a user turn first', () => {
    const params = toAnthropicRequest({ messages: [{ role: 'assistant', content: 'Hi, I am Atlas.' }, { role: 'user', content: 'hey' }] });
    expect(params.messages[0].role).toBe('user');
    expect(params.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});

describe('response translation', () => {
  test('text, tool calls, thinking and cache usage', () => {
    const data = toOpenAiChatCompletion({
      id: 'msg_1', model: 'claude-sonnet-5-5', stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: 'plan', signature: 's' },
        { type: 'text', text: 'Checking.' },
        { type: 'tool_use', id: 'toolu_9', name: 'web_search', input: { q: 'z' } },
      ],
      usage: { input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 900, cache_creation_input_tokens: 100 },
    });
    expect(data.choices[0].finish_reason).toBe('tool_calls');
    expect(data.choices[0].message).toMatchObject({
      role: 'assistant',
      content: 'Checking.',
      reasoning_content: 'plan',
      tool_calls: [{ id: 'toolu_9', type: 'function', function: { name: 'web_search', arguments: '{"q":"z"}' } }],
    });
    expect(data.choices[0].message.anthropic_content).toHaveLength(3);
    expect(data.usage).toEqual({ prompt_tokens: 1010, completion_tokens: 7, total_tokens: 1017, prompt_tokens_details: { cached_tokens: 900, cache_write_tokens: 100 } });
  });

  test('a refusal reads as a plain sentence, not an empty bubble', () => {
    const data = toOpenAiChatCompletion({ stop_reason: 'refusal', content: [] });
    expect(data.choices[0]).toMatchObject({ finish_reason: 'content_filter', message: { content: 'Claude declined to answer this request.' } });
  });
});

describe('against the stand-in Messages server', () => {
  let standin;
  afterEach(async () => { await standin?.close(); standin = null; });

  test('streams text, then runs a tool round that hands Claude its own content back', async () => {
    standin = await startAnthropicStandin((body, n) => (n === 1
      ? { stop_reason: 'tool_use', blocks: [
        { type: 'thinking', signature: 'sig-1' },
        { type: 'text', text: 'Let me look.' },
        { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: { q: 'censai' } },
      ], usage: { cache_creation_input_tokens: 1200 } }
      : { blocks: [{ type: 'text', text: 'Censai makes a canvas.' }], usage: { cache_read_input_tokens: 1200 } }));
    const config = { provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: standin.baseUrl, apiKey: 'user-byok-key' };
    const messages = [
      { role: 'system', content: 'You are Atlas on a shared board.' },
      { role: 'user', content: 'What is censai?' },
    ];

    const deltas = [];
    const first = await requestChatCompletion({ config, body: { model: 'claude-sonnet-5-5', max_tokens: 4096, messages, tools: TOOLS }, onDelta: d => deltas.push(d) });
    expect(deltas.join('')).toBe('Let me look.');
    expect(deltas.length).toBeGreaterThan(1);
    const msg = first.choices[0].message;
    expect(first.choices[0].finish_reason).toBe('tool_calls');
    expect(msg.tool_calls).toEqual([{ id: 'toolu_1', type: 'function', function: { name: 'web_search', arguments: '{"q":"censai"}' } }]);
    expect(first.usage.prompt_tokens_details.cache_write_tokens).toBe(1200);

    const req1 = standin.requests[0];
    expect(req1.headers['x-api-key']).toBe('user-byok-key');
    expect(req1.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(req1.body).toMatchObject({ model: 'claude-sonnet-5-5', stream: true, max_tokens: 16000, fallbacks: 'default', cache_control: { type: 'ephemeral' } });
    expect(req1.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req1.body.tools[0].name).toBe('web_search');

    // What the chat loop does after a tool round.
    messages.push({ ...msg, tool_calls: msg.tool_calls });
    messages.push({ role: 'tool', tool_call_id: 'toolu_1', content: 'Censai: the canvas for everyone.' });
    const second = await requestChatCompletion({ config, body: { model: 'claude-sonnet-5-5', messages, tools: TOOLS } });
    expect(second.choices[0].message.content).toBe('Censai makes a canvas.');
    expect(second.usage.prompt_tokens_details.cached_tokens).toBe(1200);
    const req2 = standin.requests[1].body;
    expect(req2.messages[1]).toEqual({ role: 'assistant', content: [
      { type: 'thinking', thinking: '', signature: 'sig-1' },
      { type: 'text', text: 'Let me look.' },
      { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: { q: 'censai' } },
    ] });
    expect(req2.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Censai: the canvas for everyone.' }] });
    expect(logger.info).toHaveBeenCalledWith('chat completion usage', expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet-5-5' }));
  });

  test('older Claude models skip the fallback beta; API errors keep their status', async () => {
    standin = await startAnthropicStandin((body) => (body.model === 'claude-haiku-4-5'
      ? { blocks: [{ type: 'text', text: 'ok' }] }
      : { status: 400, error: 'max_tokens too large' }));
    const ok = await requestChatCompletion({ config: { provider: 'anthropic', baseUrl: standin.baseUrl, apiKey: 'k' }, body: { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'hi' }] } });
    expect(ok.choices[0].message.content).toBe('ok');
    expect(standin.requests[0].headers['anthropic-beta']).toBeUndefined();
    expect(standin.requests[0].body).not.toHaveProperty('fallbacks');

    await expect(requestChatCompletion({ config: { provider: 'anthropic', baseUrl: standin.baseUrl, apiKey: 'k' }, body: { model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'hi' }] } }))
      .rejects.toMatchObject({ name: 'ChatCompletionHttpError', status: 400 });
  });

  test('a missing key fails before any request', async () => {
    await expect(requestChatCompletion({ config: { provider: 'anthropic', baseUrl: 'http://127.0.0.1:1', apiKey: '' }, body: { messages: [{ role: 'user', content: 'hi' }] } }))
      .rejects.toThrow('Anthropic API key is missing');
  });
});
