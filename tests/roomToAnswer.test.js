import { jest } from '@jest/globals';

// A thinking model (Gemini) can spend the whole reply budget thinking and come
// back with nothing: "The model held back its reply: It hit its length limit
// before writing anything." That round is now asked once more with room to answer.
const callModel = jest.fn();

jest.unstable_mockModule('../server/tools.js', () => ({ executeTool: jest.fn(), TOOL_DEFINITIONS: [] }));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  aiGatewayLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  CHAT_COMPLETION_TIMEOUT_MS: 30000,
  DEFAULT_CHAT_BASE_URL: 'http://stub',
  DEFAULT_CHAT_MODEL: 'gemini',
  OLLAMA_CHAT_MODEL_ALIASES: [],
  getDefaultChatApiKey: jest.fn(() => 'key'),
  callModel,
  createModelAccessContext: jest.fn((value) => value),
  workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  shouldSynthesizeAfterToolBatch: () => false,
  buildToolSynthesisPrompt: () => '',
  summarizeToolActions: () => 'No response generated.',
}));

const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');
const {
  callWithRoomToAnswer, ranOutBeforeWriting, CHAT_MAX_TOKENS, ROOMY_MAX_TOKENS,
} = await import('../server/routes/chat/modelRound.js');

const ranOut = (reason = 'length', message = { role: 'assistant', content: '' }) => ({ choices: [{ finish_reason: reason, message }] });
const answer = (content) => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] });

describe('ranOutBeforeWriting', () => {
  test('is true only when the length limit stopped it before any text or tool call', () => {
    expect(ranOutBeforeWriting(ranOut('length').choices[0])).toBe(true);
    expect(ranOutBeforeWriting(ranOut('MAX_TOKENS').choices[0])).toBe(true);
    expect(ranOutBeforeWriting(ranOut('length', { content: null }).choices[0])).toBe(true);
    expect(ranOutBeforeWriting(ranOut('length', { content: 'half a reply' }).choices[0])).toBe(false);
    expect(ranOutBeforeWriting(ranOut('length', { content: '', tool_calls: [{ id: 't' }] }).choices[0])).toBe(false);
    expect(ranOutBeforeWriting(answer('').choices[0])).toBe(false);
    expect(ranOutBeforeWriting(ranOut('content_filter').choices[0])).toBe(false);
    expect(ranOutBeforeWriting(undefined)).toBe(false);
  });
});

describe('callWithRoomToAnswer', () => {
  test('asks once more with a bigger budget when the model ran out before writing', async () => {
    const call = jest.fn().mockResolvedValueOnce(ranOut()).mockResolvedValueOnce(answer('Done.'));
    const onRetry = jest.fn();
    const data = await callWithRoomToAnswer({ round: 1 }, { call, onRetry });
    expect(data.choices[0].message.content).toBe('Done.');
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[0][0].maxTokens).toBeUndefined();
    expect(call.mock.calls[1][0].maxTokens).toBe(ROOMY_MAX_TOKENS);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('a normal reply, a partly written one or a tool call is not asked again', async () => {
    for (const reply of [answer('Hi'), ranOut('length', { content: 'half' }), ranOut('length', { content: '', tool_calls: [{ id: 't' }] })]) {
      const call = jest.fn().mockResolvedValueOnce(reply);
      expect(await callWithRoomToAnswer({}, { call })).toBe(reply);
      expect(call).toHaveBeenCalledTimes(1);
    }
  });

  test('if the bigger budget is refused, the first answer stands; a stop still stops', async () => {
    const first = ranOut();
    const refused = jest.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('max_tokens too large'));
    expect(await callWithRoomToAnswer({}, { call: refused })).toBe(first);

    const stopped = jest.fn().mockResolvedValueOnce(ranOut())
      .mockRejectedValueOnce(Object.assign(new Error('Stopped'), { code: 'CHAT_ABORTED' }));
    await expect(callWithRoomToAnswer({}, { call: stopped })).rejects.toMatchObject({ code: 'CHAT_ABORTED' });
  });

  test('the native Gemini route, which does not use this budget, is not asked again', async () => {
    const call = jest.fn().mockResolvedValueOnce(ranOut('MAX_TOKENS'));
    await callWithRoomToAnswer({ reqProvider: 'google-native' }, { call });
    expect(call).toHaveBeenCalledTimes(1);
  });

  test('a person who pressed Stop gets no second call', async () => {
    const call = jest.fn().mockResolvedValueOnce(ranOut());
    const signal = { aborted: true };
    await expect(callWithRoomToAnswer({}, { call, signal })).rejects.toMatchObject({ code: 'CHAT_ABORTED' });
    expect(call).toHaveBeenCalledTimes(1);
  });

  test('the receipt counts the tokens of both calls', async () => {
    const call = jest.fn()
      .mockResolvedValueOnce({ ...ranOut(), usage: { prompt_tokens: 900, completion_tokens: 4096 } })
      .mockResolvedValueOnce({ ...answer('Done.'), usage: { prompt_tokens: 900, completion_tokens: 5000 } });
    const data = await callWithRoomToAnswer({}, { call });
    expect(data.usage).toMatchObject({ prompt_tokens: 1800, completion_tokens: 9096 });
  });

  test('the everyday budget is unchanged', () => {
    expect(CHAT_MAX_TOKENS).toBe(4096);
    expect(ROOMY_MAX_TOKENS).toBeGreaterThan(CHAT_MAX_TOKENS);
  });
});

test('in a chat, the person gets the answer instead of "held back its reply"', async () => {
  callModel.mockReset();
  callModel.mockResolvedValueOnce(ranOut('length')).mockResolvedValueOnce(answer('Here is the flyer.'));
  const sendEvent = jest.fn();

  const result = await runChatLoop({
    agentId: 'genesis',
    chatMessages: [{ role: 'user', content: 'build it' }],
    toolsForCaller: [],
    reqModel: 'gemini-flash',
    reqProvider: 'google',
    authorizationWorkspaceId: 'workspace-1',
    userId: 7,
    sendEvent,
    timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
  });

  expect(result.finalText).toBe('Here is the flyer.');
  expect(result.finalText).not.toMatch(/held back/);
  expect(callModel).toHaveBeenCalledTimes(2);
  expect(callModel.mock.calls[0][0].body.max_tokens).toBe(CHAT_MAX_TOKENS);
  expect(callModel.mock.calls[1][0].body.max_tokens).toBe(ROOMY_MAX_TOKENS);
  expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'thinking', detail: expect.objectContaining({ moreRoom: true }) }));
});
