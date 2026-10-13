import { jest } from '@jest/globals';

// Spec 3: replies stream token by token from OpenAI-compatible providers,
// and the loop still gets one assembled completion per round.

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), startTimer: jest.fn(() => () => 5) };
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: jest.fn(() => logger) }));
jest.unstable_mockModule('../server/secrets.js', () => ({ getSecret: jest.fn(() => '') }));

const { requestChatCompletion } = await import('../server/aiGateway/index.js');
const { createStreamAssembler, canStreamChat, streamingPayload } = await import('../server/aiGateway/chatStream.js');
const { forwardDeltas, throwIfChatAborted } = await import('../server/routes/chat/modelRound.js');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  const text = chunks.map(c => `data: ${typeof c === 'string' ? c : JSON.stringify(c)}\n\n`).join('');
  // Split mid-line to prove partial lines are buffered.
  const parts = [text.slice(0, 17), text.slice(17, 60), text.slice(60)];
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: { getReader: () => ({ read: async () => (i < parts.length ? { done: false, value: encoder.encode(parts[i++]) } : { done: true }) }) },
  };
}

describe('chat token streaming', () => {
  test('only OpenAI-style providers stream; usage is requested where supported', () => {
    expect(canStreamChat({ provider: 'openai' })).toBe(true);
    expect(canStreamChat({ provider: 'ollama' })).toBe(true);
    expect(canStreamChat({ provider: 'cohere' })).toBe(false);
    expect(canStreamChat({ provider: null })).toBe(false);
    expect(streamingPayload({ provider: 'openrouter' }, { model: 'm' })).toEqual({ model: 'm', stream: true, stream_options: { include_usage: true } });
    expect(streamingPayload({ provider: 'ollama' }, { model: 'm' })).toEqual({ model: 'm', stream: true });
  });

  test('the assembler folds content and split tool-call deltas into one message', () => {
    const deltas = [];
    const a = createStreamAssembler(t => deltas.push(t));
    a.push({ id: 'c1', model: 'gpt', choices: [{ delta: { content: 'Let me ' } }] });
    a.push({ choices: [{ delta: { content: 'check.' } }] });
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'web_', arguments: '{"q":' } }] } }] });
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'search', arguments: '"x"}' } }] }, finish_reason: 'tool_calls' }] });
    a.push({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } });
    expect(deltas).toEqual(['Let me ', 'check.']);
    expect(a.result()).toEqual({
      id: 'c1', object: 'chat.completion', model: 'gpt',
      choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: 'Let me check.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"q":"x"}' } }] } }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    });
  });

  test('requestChatCompletion streams deltas and returns the assembled completion', async () => {
    const bodies = [];
    global.fetch = jest.fn(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return sseResponse([
        { choices: [{ delta: { role: 'assistant', content: 'Hel' } }] },
        { choices: [{ delta: { content: 'lo there' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } },
        '[DONE]',
      ]);
    });
    const deltas = [];
    const data = await requestChatCompletion({
      config: { provider: 'openai', model: 'gpt-4o', baseUrl: 'http://p.test/v1', apiKey: 'k' },
      body: { messages: [{ role: 'user', content: 'hi' }] },
      onDelta: t => deltas.push(t),
    });
    expect(bodies[0]).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(deltas.join('')).toBe('Hello there');
    expect(data.choices[0].message.content).toBe('Hello there');
    expect(data.usage).toEqual({ prompt_tokens: 1, completion_tokens: 2 });
  });

  test('without onDelta, or when the provider answers with JSON, nothing changes', async () => {
    global.fetch = jest.fn(async (url, init) => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ stream: JSON.parse(init.body).stream ?? false, choices: [{ message: { content: 'whole' } }] }),
    }));
    const config = { provider: 'openai', model: 'gpt-4o', baseUrl: 'http://p.test/v1', apiKey: 'k' };
    const plain = await requestChatCompletion({ config, body: { messages: [] } });
    expect(plain.stream).toBe(false);
    const deltas = [];
    const fallback = await requestChatCompletion({ config, body: { messages: [] }, onDelta: t => deltas.push(t) });
    expect(fallback.choices[0].message.content).toBe('whole');
    expect(deltas).toEqual([]);
  });

  test('deltas become NDJSON delta events and open the stream once', () => {
    const events = [];
    const onFirst = jest.fn();
    const forward = forwardDeltas(2, e => events.push(e), onFirst);
    forward('a');
    forward('b');
    expect(events).toEqual([{ type: 'delta', round: 2, text: 'a' }, { type: 'delta', round: 2, text: 'b' }]);
    expect(onFirst).toHaveBeenCalled();
  });

  test('a stopped request ends the loop with CHAT_ABORTED', () => {
    const controller = new AbortController();
    expect(() => throwIfChatAborted(controller.signal)).not.toThrow();
    controller.abort();
    expect(() => throwIfChatAborted(controller.signal)).toThrow(expect.objectContaining({ code: 'CHAT_ABORTED' }));
  });
});
