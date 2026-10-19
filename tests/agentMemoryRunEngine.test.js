// Agent memory in the run engine: every run (chat, help request, outside
// app) gets the agent's memory block in its instructions and the memory
// tools, and is recorded as an episode. Outside apps get the identity core
// only: no facts, no earlier conversations, no memory tools.
import { jest } from '@jest/globals';

const loopCalls = [];
let loopImpl = null;

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/memory.js', () => ({ logConversation: jest.fn(async () => {}) }));
jest.unstable_mockModule('../server/routes/chat/chatContext.js', () => ({
  prepareChatContext: jest.fn(async (_agentId, _project, messages, _userId, _role, workspaceId) => ({
    reqModel: 'model-a', reqBaseUrl: 'http://model', reqApiKey: 'k', reqProvider: 'openai',
    chatMessages: [{ role: 'system', content: 'sys' }, ...messages.map((m) => ({ role: 'user', content: m.text }))],
    toolsForCaller: [{ type: 'function', function: { name: 'recall', parameters: {} } }],
    workspaceId,
  })),
}));
jest.unstable_mockModule('../server/routes/chat/chatExecution.js', () => ({
  runChatLoop: jest.fn(async (input) => {
    loopCalls.push(input);
    if (loopImpl) return loopImpl(input);
    return { finalText: 'done', toolActions: [{ tool: 'recall' }] };
  }),
}));

const store = {
  getIdentity: jest.fn(async () => ({ core: 'I am Atlas, the planner.' })),
  currentFacts: jest.fn(async () => [{
    subject: 'the user', attribute: 'favorite color', value: 'green',
    valid_from: '2026-10-01T00:00:00Z', valid_to: null, recorded_at: '2026-10-01T00:00:00Z',
  }]),
  searchEpisodes: jest.fn(async () => [{ created_at: '2026-10-02T00:00:00Z', summary: 'Asked: brand color | Answered: yellow' }]),
  recordEpisode: jest.fn(async (_db, row) => ({ id: 1, ...row })),
  writeFact: jest.fn(),
  factHistory: jest.fn(),
};
jest.unstable_mockModule('../server/agentMemory/store.js', () => store);

const { runAgentTurn } = await import('../server/runEngine/index.js');
const { loadRunMemory } = await import('../server/agentMemory/forRun.js');
const noOutside = async () => ({ definitions: [], has: () => false, call: async () => '' });

beforeEach(() => {
  loopCalls.length = 0;
  loopImpl = null;
  Object.values(store).forEach((fn) => fn.mockClear());
});

test('a chat run reads memory, gets the memory tools, and is recorded as an episode', async () => {
  await runAgentTurn({
    origin: 'chat', agentId: 'atlas', messages: [{ from: 'me', text: 'What is my favorite color?' }],
    userId: 7, workspaceId: 'ws-1', loadOutside: noOutside,
  });
  const system = loopCalls[0].chatMessages[0].content;
  expect(system).toMatch(/^sys\n\n# Your memory/);
  expect(system).toContain('I am Atlas, the planner.');
  expect(system).toContain('favorite color of the user: green (true since 2026-10-01, learned 2026-10-01)');
  expect(system).toContain('2026-10-02 00:00:00 UTC: Asked: brand color | Answered: yellow');
  expect(system).toContain('## Right now');
  expect(loopCalls[0].toolsForCaller.map((t) => t.function.name)).toEqual(['recall', 'remember_fact', 'recall_memory', 'fact_history', 'link_things', 'end_link', 'what_was_true', 'recall_conversation']);
  expect(typeof loopCalls[0].runTool).toBe('function');
  expect(store.recordEpisode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    userId: 7, agentId: 'atlas', origin: 'chat', model: 'model-a', question: 'What is my favorite color?',
    answer: 'done', tools: ['recall'], summary: 'Asked: What is my favorite color? | Answered: done | Used: recall',
  }));
});

test('memory tool calls are routed to memory', async () => {
  store.writeFact.mockResolvedValueOnce({
    status: 'new', previous: null,
    fact: { subject: 'the user', attribute: 'dog name', value: 'Biscuit', valid_from: '2026-10-12T00:00:00Z', recorded_at: '2026-10-12T00:00:00Z' },
  });
  loopImpl = async (input) => ({ finalText: await input.runTool('atlas', 'remember_fact', { attribute: 'dog name', value: 'Biscuit' }, {}), toolActions: [] });
  const result = await runAgentTurn({
    origin: 'help', agentId: 'atlas', messages: [{ from: 'me', text: 'My dog is Biscuit' }], userId: 7, workspaceId: 'ws-1', loadOutside: noOutside,
  });
  expect(result.finalText).toBe('Saved: dog name of the user: Biscuit (true since 2026-10-12, learned 2026-10-12)');
  expect(store.writeFact.mock.calls[0][1]).toMatchObject({ userId: 7, agentId: 'atlas', input: { key: 'the user|dog name', value: 'Biscuit' } });
});

test('outside apps get the identity core only and no memory tools', async () => {
  await runAgentTurn({
    origin: 'endpoint', agentId: 'atlas', messages: [{ from: 'me', text: 'What is my favorite color?' }],
    userId: 7, workspaceId: 'ws-1', loadOutside: noOutside,
  });
  const system = loopCalls[0].chatMessages[0].content;
  expect(system).toContain('I am Atlas, the planner.');
  expect(system).not.toContain('green');
  expect(system).not.toContain('brand color');
  expect(store.currentFacts).not.toHaveBeenCalled();
  expect(loopCalls[0].toolsForCaller.map((t) => t.function.name)).toEqual(['recall']);
  expect(store.recordEpisode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ origin: 'endpoint' }));
});

test('memory never stops a run: a database error means no memory, the run goes on', async () => {
  store.getIdentity.mockRejectedValueOnce(new Error('relation "agent_identity" does not exist'));
  const memory = await loadRunMemory({ db: {}, userId: 7, agentId: 'atlas', messages: [{ from: 'me', text: 'hi' }] });
  expect(memory.block).toBe('');
  expect(memory.tools.definitions).toEqual([]);
  expect(await memory.record({ answer: 'x' })).toBeNull();
});

test('no signed-in person, no memory', async () => {
  const memory = await loadRunMemory({ db: {}, userId: null, agentId: 'atlas' });
  expect(memory.block).toBe('');
  expect(store.getIdentity).not.toHaveBeenCalled();
});
