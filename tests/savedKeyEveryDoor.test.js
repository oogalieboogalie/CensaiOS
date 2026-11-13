import { jest } from '@jest/globals';

// To-do 159: the key a person saved in Settings is the key every AI call made
// for them sends. keyWiringMap.test.js checks each place still takes the road
// to the saved key; this file drives four of those places for real, end to
// end, and reads the key that reaches the model:
//   - Workflows (an agent step in a workflow window)
//   - Scheduler runs (a scheduled agent card)
//   - the MCP door (an outside app asking a board agent)
//   - Idea Pad's Expand
// Two made-up people: Sam Example (owner) and Pat Example (teammate). The
// setup file (.env) holds an older key that must never be sent for them once
// they have saved their own. Made-up keys only; no real model is called.

const OLD_ENV_KEY = 'sk-ant-api03-made-up-old-env-key';
const SAVED = {
  7: 'sk-ant-api03-made-up-sam-saved-key',
  8: 'sk-ant-api03-made-up-pat-saved-key',
};
const ROLES = { 7: 'admin', 8: 'user' };

const getUserApiKeyConfig = jest.fn(async (userId, provider) => (
  provider === 'anthropic' && SAVED[userId] ? { apiKey: SAVED[userId], modelName: null, source: 'vault' } : null
));
const dbQuery = jest.fn(async (sql, params = []) => {
  if (/SELECT role FROM users/.test(sql)) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
  if (/SELECT provider FROM user_api_keys/.test(sql)) return { rows: SAVED[params[0]] ? [{ provider: 'anthropic' }] : [] };
  return { rows: [] };
});
const loopKeys = [];
const runChatLoop = jest.fn(async (input) => {
  loopKeys.push(input.reqApiKey);
  return { finalText: 'Stand-in answer.', toolActions: [] };
});
const requestChatCompletion = jest.fn(async () => ({ choices: [{ message: { content: 'Expanded.' } }] }));
const ATLAS = { id: 'atlas', name: 'Atlas', model_provider: 'anthropic', model_name: 'claude-sonnet-4-5' };

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: dbQuery, on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: jest.fn((provider) => (provider === 'anthropic' ? 'anthropic' : null)),
}));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: jest.fn(async () => ATLAS),
  getSubAgentById: jest.fn(async () => null),
  buildSystemPrompt: jest.fn(async () => 'agent prompt'),
  logConversation: jest.fn(async () => undefined),
  getAgentsByIds: jest.fn(async () => []),
}));
jest.unstable_mockModule('../server/memory/core/agents.js', () => ({ getAgent: jest.fn(async () => ATLAS) }));
jest.unstable_mockModule('../server/tools.js', () => ({ filterToolsForAgent: jest.fn(async () => []) }));
jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({ buildSubAgentSystemPrompt: jest.fn() }));
jest.unstable_mockModule('../server/workspaces/context.js', () => {
  const board = async (_db, { workspaceId } = {}) => ({ id: workspaceId || 'ws-home' });
  return {
    requireWorkspaceMember: jest.fn(board),
    ensureUserDefaultWorkspace: jest.fn(async () => ({ id: 'ws-home' })),
    ensurePersonalWorkspace: jest.fn(async () => ({ id: 'ws-home' })),
    resolveWorkspaceContext: jest.fn(board),
  };
});
jest.unstable_mockModule('../server/chatModel/runLoop.js', () => ({ runChatLoop }));
jest.unstable_mockModule('../server/aiGateway/chatCompletion.js', () => ({
  aiGatewayLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  CHAT_COMPLETION_TIMEOUT_MS: 1000,
  requestChatCompletion,
}));
jest.unstable_mockModule('../server/hostedAgents/store.js', () => ({ findHostedAgent: jest.fn(async () => null) }));
jest.unstable_mockModule('../server/outsideTools/forAgent.js', () => ({
  EMPTY_OUTSIDE_TOOLS: { definitions: [], has: () => false, call: async () => '' },
  loadOutsideTools: jest.fn(async () => ({ definitions: [], has: () => false, call: async () => '' })),
}));
jest.unstable_mockModule('../server/agentMemory/forRun.js', () => {
  const none = { block: '', tools: { definitions: [], has: () => false, call: async () => '' }, record: async () => null };
  return { NO_MEMORY: none, loadRunMemory: jest.fn(async () => none) };
});
jest.unstable_mockModule('../server/sevenContexts/index.js', () => ({ gatherSevenContexts: jest.fn(async () => null) }));
jest.unstable_mockModule('../server/collab/agentPresence.js', () => ({
  beginAgentPresence: jest.fn(async () => ({ wrap: (fn) => fn, finish: () => undefined })),
}));
jest.unstable_mockModule('../server/social/agentNotes.js', () => ({ noteAgentWork: jest.fn(async () => undefined) }));
jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({
  completeRun: jest.fn(async () => undefined),
  failRun: jest.fn(async () => undefined),
  recordRunAction: jest.fn(async () => undefined),
}));
jest.unstable_mockModule('../server/scheduler/lastRun.js', () => ({ recordScheduleRunOutcome: jest.fn(async () => undefined) }));
jest.unstable_mockModule('../server/agent-card-runs/events.js', () => ({ publishAgentCardEvent: jest.fn() }));

const { startWorkflowRun, resetWorkflowRuns } = await import('../server/workflows/runner.js');
const { executeBuiltInAgentCardRun } = await import('../server/agent-card-runs/executors/builtin.js');
const { runAgentForOutsideCall } = await import('../server/agentEndpoints/runAgent.js');
const { handleIdeaExpand } = await import('../server/routes/chat/handlers.js');
const { resetKeySharingCache } = await import('../server/security/keySharing.js');

const ENV_NAMES = ['CENSAI_MODE', 'ANTHROPIC_API_KEY', 'AI_API_KEY', 'AI_BASE_URL', 'IDEA_EXPAND_MODEL'];
const savedEnv = {};

beforeAll(() => {
  for (const name of ENV_NAMES) savedEnv[name] = process.env[name];
});
beforeEach(() => {
  jest.clearAllMocks();
  loopKeys.length = 0;
  process.env.CENSAI_MODE = 'local_desktop';
  process.env.ANTHROPIC_API_KEY = OLD_ENV_KEY;
  delete process.env.IDEA_EXPAND_MODEL;
  resetKeySharingCache();
});
afterEach(() => resetWorkflowRuns());
afterAll(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  resetKeySharingCache();
});

async function workflowKey(userId) {
  const node = (id, type, extra = {}) => ({ id, type, x: 0, y: 0, title: id, ...extra });
  const win = {
    id: 'wf-1', kind: 'workflow', title: 'Open house', graph: {
      nodes: [node('s', 'trigger', { input: 'three ideas' }), node('a', 'agent', { agentId: 'atlas', instructions: 'Plan.' })],
      edges: [{ id: '1', from: 's', to: 'a' }],
    },
  };
  const deps = {
    db: { query: jest.fn(async () => ({ rows: [] })) },
    runAgent: (await import('../server/runEngine/index.js')).runAgentTurn,
    runTool: jest.fn(),
    readWindow: jest.fn(async () => win),
    patchWindow: jest.fn(async () => true),
    placeCard: jest.fn(async () => ({ id: 'card-1' })),
  };
  const { run, done } = await startWorkflowRun({ workspaceId: 'ws-home', windowId: 'wf-1', userId }, deps);
  await done;
  expect(run.status).toBe('complete');
  return loopKeys.at(-1);
}

async function schedulerKey(userId) {
  const result = await executeBuiltInAgentCardRun(
    { id: 'run-1', metadata: { agentId: 'atlas', userId, prompt: 'Morning summary.', workspaceId: 'ws-home' } },
    { id: 'agent:atlas' },
  );
  expect(result.status).toBe('succeeded');
  return loopKeys.at(-1);
}

async function mcpDoorKey(userId) {
  const answer = await runAgentForOutsideCall({
    endpoint: { agent_id: 'atlas', agent_name: 'Atlas', user_id: userId, workspace_id: 'ws-home' },
    keyLabel: 'made-up app', question: 'What is on the board?',
  });
  expect(answer).toBe('Stand-in answer.');
  return loopKeys.at(-1);
}

async function ideaPadKey(userId) {
  const res = { status: jest.fn(function status() { return this; }), json: jest.fn() };
  await handleIdeaExpand({ body: { ideas: ['A morning brief'], workspaceId: 'ws-home' }, session: { userId } }, res);
  expect(res.status).not.toHaveBeenCalled();
  return requestChatCompletion.mock.calls.at(-1)[0].config.apiKey;
}

const DOORS = [
  ['Workflows', workflowKey],
  ['Scheduler runs', schedulerKey],
  ['MCP door (outside app)', mcpDoorKey],
  ['Idea Pad expand', ideaPadKey],
];

describe('every door sends the key saved in Settings, never the old setup-file key', () => {
  test.each(DOORS)('%s: the owner\'s saved key is sent', async (_name, keyAt) => {
    const key = await keyAt(7);
    expect(key).toBe(SAVED[7]);
    expect(key).not.toBe(OLD_ENV_KEY);
  });

  test.each(DOORS)('%s: a teammate\'s own saved key is sent, not the owner\'s', async (_name, keyAt) => {
    const key = await keyAt(8);
    expect(key).toBe(SAVED[8]);
    expect([OLD_ENV_KEY, SAVED[7]]).not.toContain(key);
  });

  test.each(DOORS)('%s: reads the same saved-key store (user_api_keys) for that person', async (_name, keyAt) => {
    await keyAt(7);
    const asked = getUserApiKeyConfig.mock.calls;
    expect(asked).toContainEqual([expect.anything(), 'anthropic']);
    expect(asked.every(([userId]) => String(userId) === '7')).toBe(true);
  });
});
