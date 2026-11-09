import { jest } from '@jest/globals';

// An outside app calls Scout through the shared endpoint. Pat owns the
// endpoint, so the run is his, and the model is shown look-up tools plus
// the four markers that used to skip that list. The reply carries
// [MESSAGE_TO], [BROADCAST], [REMEMBER] and [JOURNAL]. None of them may run.
const PAT = 1;
const ran = jest.fn(async (_agentId, name) => `${name} ran`);
const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const callModel = jest.fn();
const prepareChatContext = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({
  TOOL_REGISTRY: {
    message_to: ran,
    broadcast: ran,
    remember: ran,
    journal: ran,
    web_search: ran,
    recall: ran,
    vex_run: ran,
  },
}));
jest.unstable_mockModule('../server/aiGateway/callModel.js', () => ({
  CHAT_COMPLETION_MODEL_KIND: 'chat.completion',
  callModel,
}));
jest.unstable_mockModule('../server/routes/chat/chatContext.js', () => ({
  prepareChatContext,
  formatWindowProjectForPrompt: () => '',
}));

const { OUTSIDE_CALLER_TOOLS, runAgentForOutsideCall } = await import('../server/agentEndpoints/runAgent.js');

const MARKERS = ['message_to', 'broadcast', 'remember', 'journal'];
const tool = (name) => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } });
const called = () => ran.mock.calls.map((entry) => entry[1]);

const priorMode = process.env.CENSAI_MODE;

beforeEach(() => {
  jest.clearAllMocks();
  ran.mockImplementation(async (_agentId, name) => `${name} ran`);
  process.env.CENSAI_MODE = 'local_desktop';
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes('FROM users')) return { rows: [{ role: 'admin' }] };
    return { rows: [] };
  });
  prepareChatContext.mockResolvedValue({
    reqModel: 'made-up-model',
    reqBaseUrl: 'http://made-up.invalid',
    reqApiKey: 'made-up-key',
    reqProvider: 'made-up',
    workspaceId: 'made-up-board',
    chatMessages: [
      { role: 'system', content: 'Made-up system words.' },
      { role: 'user', content: 'Made-up ask.' },
    ],
    toolsForCaller: [...OUTSIDE_CALLER_TOOLS.map(tool), ...MARKERS.map(tool)],
  });
  callModel.mockResolvedValue({
    choices: [{
      message: {
        role: 'assistant',
        content: [
          'Done.',
          '[MESSAGE_TO:atlas: hello from outside]',
          '[BROADCAST: hello board]',
          '[REMEMBER: the owner likes tea]',
          '[JOURNAL: a private note]',
        ].join('\n'),
      },
    }],
  });
});

afterAll(() => {
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

test('an outside endpoint refuses a marker it did not offer', async () => {
  const answer = await runAgentForOutsideCall({
    endpoint: {
      agent_id: 'made-up-scout',
      agent_name: 'Scout',
      user_id: PAT,
      workspace_id: 'made-up-board',
      window_id: null,
    },
    keyLabel: 'made-up-key',
    question: 'Made-up ask.',
  });
  const offered = callModel.mock.calls[0][0].body.tools.map((entry) => entry.function.name);
  expect(offered).toEqual([...OUTSIDE_CALLER_TOOLS]);
  // The markers were taken out of the reply, and none of the four tools ran.
  expect(answer).toBe('Done.');
  expect(called().filter((name) => MARKERS.includes(name))).toEqual([]);
});
