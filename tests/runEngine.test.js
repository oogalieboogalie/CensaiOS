// The run engine: every way an agent starts (chat, a help request, an outside
// app through Share) goes through runAgentTurn, which adds the outside MCP
// tools the owner gave that agent and routes their calls to the right server.
// Pins: outside tools reach the model and are called by their real name,
// outside callers never get them, calls are logged, a time limit stops a
// run, and the exchange is remembered when asked.
import { jest } from '@jest/globals';

const loopCalls = [];
const logged = [];
let loopImpl = null;

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/memory.js', () => ({
  logConversation: jest.fn(async (...args) => { logged.push(args); }),
}));
jest.unstable_mockModule('../server/routes/chat/chatContext.js', () => ({
  prepareChatContext: jest.fn(async (agentId, _project, messages, _userId, _role, workspaceId) => ({
    reqModel: 'm', reqBaseUrl: 'http://model', reqApiKey: 'k', reqProvider: 'openai',
    chatMessages: [{ role: 'system', content: 'sys' }, ...messages.map((m) => ({ role: 'user', content: m.text }))],
    toolsForCaller: [{ type: 'function', function: { name: 'recall', parameters: {} } }],
    workspaceId,
  })),
}));
jest.unstable_mockModule('../server/routes/chat/chatExecution.js', () => ({
  runChatLoop: jest.fn(async (input) => {
    loopCalls.push(input);
    if (loopImpl) return loopImpl(input);
    return { finalText: 'done', toolActions: [] };
  }),
}));

const { runAgentTurn, runSignal, withOutsideTools } = await import('../server/runEngine/index.js');
const { loadOutsideTools, outsideArgs } = await import('../server/outsideTools/forAgent.js');

const weather = {
  definitions: [{ type: 'function', function: { name: 'mcp__weather__get_forecast', parameters: {} } }],
  has: (name) => name === 'mcp__weather__get_forecast',
  call: jest.fn(async (_name, args) => `Sunny in ${args.city}`),
};

beforeEach(() => { loopCalls.length = 0; logged.length = 0; loopImpl = null; weather.call.mockClear(); });

describe('runAgentTurn', () => {
  test('adds the outside tools the agent was given and routes their calls', async () => {
    const loadOutside = jest.fn(async () => weather);
    loopImpl = async (input) => ({ finalText: await input.runTool('atlas', 'mcp__weather__get_forecast', { city: 'Austin' }, {}), toolActions: [] });
    const result = await runAgentTurn({
      origin: 'chat', agentId: 'atlas', messages: [{ from: 'me', text: 'weather?' }], userId: 7, workspaceId: 'ws-1', loadOutside,
    });
    expect(loadOutside).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, agentId: 'atlas', origin: 'chat' }));
    expect(loopCalls[0].toolsForCaller.map((t) => t.function.name)).toEqual(['recall', 'mcp__weather__get_forecast']);
    expect(loopCalls[0].workspaceId).toBe('ws-1');
    expect(result.finalText).toBe('Sunny in Austin');
    expect(weather.call).toHaveBeenCalledWith('mcp__weather__get_forecast', { city: 'Austin' });
  });

  test('outside callers keep only what the filter allows (no outside tools)', async () => {
    await runAgentTurn({
      origin: 'endpoint', agentId: 'atlas', messages: [{ from: 'me', text: 'hi' }], userId: 7, workspaceId: 'ws-1',
      loadOutside: async () => weather,
      toolFilter: (tools) => tools.filter((t) => t.function.name === 'recall'),
    });
    expect(loopCalls[0].toolsForCaller.map((t) => t.function.name)).toEqual(['recall']);
  });

  test('without outside tools the loop keeps its own tool runner', async () => {
    await runAgentTurn({
      agentId: 'atlas', messages: [{ from: 'me', text: 'hi' }], userId: 7, workspaceId: 'ws-1',
      loadOutside: async () => ({ definitions: [], has: () => false, call: async () => '' }),
    });
    expect(loopCalls[0].runTool).toBeUndefined();
  });

  test('remembers the exchange when asked, and hands the context to onPrepared', async () => {
    const onPrepared = jest.fn(async () => ({ traceId: 'trace-1' }));
    await runAgentTurn({
      agentId: 'atlas', messages: [{ from: 'me', text: 'q' }], userId: 7, workspaceId: 'ws-1',
      loadOutside: async () => weather, rememberQuestion: 'q', onPrepared,
    });
    expect(onPrepared).toHaveBeenCalledWith(expect.objectContaining({ reqModel: 'm', workspaceId: 'ws-1' }));
    expect(loopCalls[0].traceId).toBe('trace-1');
    expect(logged).toEqual([
      ['atlas', 'user', 'q', { workspaceId: 'ws-1', userId: 7 }],
      ['atlas', 'assistant', 'done', { workspaceId: 'ws-1', userId: 7 }],
    ]);
  });

  test('adds the seven-contexts block to the instructions and hands its report on', async () => {
    const gatherContexts = jest.fn(async () => ({ block: '## Looked up before answering\n- Nugget: x', report: { addedChars: 40 } }));
    const onPrepared = jest.fn(async () => ({}));
    await runAgentTurn({
      agentId: 'atlas', messages: [{ from: 'me', text: 'flowers' }], userId: 7, workspaceId: 'ws-1',
      loadOutside: async () => weather, gatherContexts, onPrepared,
    });
    expect(gatherContexts).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'atlas', workspaceId: 'ws-1', systemPrompt: 'sys' }));
    expect(loopCalls[0].chatMessages[0].content).toBe('sys\n\n## Looked up before answering\n- Nugget: x');
    expect(onPrepared).toHaveBeenCalledWith(expect.objectContaining({ sevenContexts: { addedChars: 40 } }));
  });

  test('a time limit aborts the run', async () => {
    loopImpl = (input) => new Promise((_resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(Object.assign(new Error('stopped'), { code: 'CHAT_ABORTED' })));
    });
    await expect(runAgentTurn({
      agentId: 'atlas', messages: [{ from: 'me', text: 'slow' }], userId: 7, workspaceId: 'ws-1',
      loadOutside: async () => weather, timeoutMs: 30,
    })).rejects.toMatchObject({ code: 'CHAT_ABORTED' });
  });
});

describe('helpers', () => {
  test('runSignal follows the caller and the clock', () => {
    const caller = new AbortController();
    const limit = runSignal(caller.signal, 10000);
    expect(limit.signal.aborted).toBe(false);
    caller.abort();
    expect(limit.signal.aborted).toBe(true);
    limit.done();
    const none = runSignal(null, 0);
    expect(none.signal).toBeNull();
  });

  test('censaiOS tools win a name clash with an outside tool', () => {
    const own = [{ function: { name: 'mcp__weather__get_forecast' } }];
    expect(withOutsideTools(own, weather)).toHaveLength(1);
    expect(withOutsideTools(null, weather)).toBeNull();
  });

  test('outside servers never see the loop bookkeeping', () => {
    expect(outsideArgs({ city: 'Austin', __provenance: { agent_id: 'a' }, __window_id: 'w' })).toEqual({ city: 'Austin' });
  });
});

describe('loadOutsideTools', () => {
  const server = {
    id: 's1', name: 'Weather', slug: 'weather', transport: 'http', url: 'http://127.0.0.1:1/mcp', has_secret: false,
    tools: [{ name: 'get_forecast', description: 'Forecast', inputSchema: { type: 'object' } }], updated_at: 1,
  };

  test('builds definitions from the cached tool list and logs every call', async () => {
    const queries = [];
    const db = { query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('JOIN outside_tool_grants')) return { rows: [server] };
      return { rows: [] };
    }) };
    const tools = await loadOutsideTools({ db, userId: 7, agentId: 'atlas', origin: 'help' });
    expect(tools.definitions.map((d) => d.function.name)).toEqual(['mcp__weather__get_forecast']);
    expect(tools.has('mcp__weather__get_forecast')).toBe(true);
    const text = await tools.call('mcp__weather__get_forecast', { city: 'Austin' });
    expect(text).toMatch(/^Error: Weather \(outside tool\)/);
    await new Promise((r) => setTimeout(r, 10));
    const insert = queries.find((q) => q.sql.includes('INSERT INTO outside_tool_calls'));
    expect(insert.params).toEqual(['s1', 7, 'atlas', 'get_forecast', 'help', false, expect.any(Number), 0, expect.any(String)]);
  });

  test('carries on with no outside tools when the table is missing', async () => {
    const db = { query: jest.fn(async () => { throw new Error('relation "outside_tool_servers" does not exist'); }) };
    const tools = await loadOutsideTools({ db, userId: 7, agentId: 'atlas' });
    expect(tools.definitions).toEqual([]);
    expect(await loadOutsideTools({ db, userId: null, agentId: 'atlas' })).toMatchObject({ definitions: [] });
  });
});
