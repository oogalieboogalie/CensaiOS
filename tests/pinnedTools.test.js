import { jest } from '@jest/globals';

// Card R3: an agent grouped with a CAD (yorCad) window has its CAD tools
// loaded on every message, with no get_tool call, but only the CAD tools it
// was already given. The people and boards here are made up.
const PAT = 1;
const executeTool = jest.fn(async (_agentId, name) => `${name} ran`);
const callModel = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.unstable_mockModule('../server/tools.js', () => ({ executeTool, filterToolsForAgent: jest.fn(), TOOL_DEFINITIONS: [] }));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  aiGatewayLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  CHAT_COMPLETION_TIMEOUT_MS: 30000,
  DEFAULT_CHAT_BASE_URL: 'http://made-up.invalid',
  DEFAULT_CHAT_MODEL: 'made-up-model',
  OLLAMA_CHAT_MODEL_ALIASES: [],
  getDefaultChatApiKey: jest.fn(() => 'made-up-key'),
  callModel,
  createModelAccessContext: jest.fn((value) => value),
  resolveChatModelConfig: jest.fn(() => ({ model: 'made-up-model' })),
  workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  shouldSynthesizeAfterToolBatch: () => false,
  buildToolSynthesisPrompt: () => '',
  summarizeToolActions: () => '',
}));

const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');
const { toolNotOfferedResult } = await import('../server/tools/rbac/offeredTools.js');
const {
  pinnedToolsFor, withPinnedTools, pinnedToolNamesOf, groupPinFilter, cleanGroupWindowKinds, PINNED_TOOLS_BY_WINDOW_KIND,
} = await import('../server/routes/chat/pinnedTools.js');
const { groupWindowKinds } = await import('../src/lib/chat/groupContext.js');

const CAD = ['read_cad_part', 'edit_cad_part'];
const tools = (...names) => names.map((name) => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } }));
const named = (list) => (list || []).map((t) => t.function.name);
// Enough tools that the chat starts search-first (only discovery tools loaded).
const MANY = Array.from({ length: 30 }, (_, i) => `made_up_tool_${i}`);
const given = (...extra) => tools('search_tools', 'get_tool', ...MANY, ...extra);
const silentLog = () => ({ info: jest.fn() });
const pinned = (toolsForCaller, kinds) => (groupPinFilter(kinds, { agentId: 'made-up-maker', log: silentLog() }) || ((t) => t))(toolsForCaller);
const says = (content) => ({ choices: [{ message: { role: 'assistant', content } }] });
const asks = (name) => ({
  choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'made-up-call-0', function: { name, arguments: '{}' } }] } }],
});
const firstRoundTools = () => named(callModel.mock.calls[0][0].body.tools);

const chat = (toolsForCaller) => runChatLoop({
  agentId: 'made-up-maker',
  chatMessages: [{ role: 'system', content: 'Made-up system words.' }, { role: 'user', content: 'Make the bracket 4 mm thicker.' }],
  toolsForCaller,
  reqModel: 'made-up-model',
  userId: PAT,
  authorizationWorkspaceId: 'made-up-board',
  sendEvent: jest.fn(),
  timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
});

beforeEach(() => {
  jest.clearAllMocks();
  callModel.mockReset();
});

describe('a CAD window in the group keeps the CAD tools loaded', () => {
  test('yorCad in the group: both CAD tools are offered on the first round, no get_tool call', async () => {
    callModel.mockResolvedValueOnce(says('Made-up answer.'));
    await chat(pinned(given(...CAD), ['chat', 'yorCad']));
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(firstRoundTools()).toEqual(expect.arrayContaining(CAD));
    expect(firstRoundTools()).not.toContain('made_up_tool_7');
    expect(executeTool).not.toHaveBeenCalled();
  });

  test('a pinned CAD tool runs on the first round', async () => {
    callModel.mockResolvedValueOnce(asks('edit_cad_part')).mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat(pinned(given(...CAD), ['yorCad']));
    expect(toolActions.map((a) => [a.tool, a.ok])).toEqual([['edit_cad_part', true]]);
    expect(executeTool.mock.calls.map(([, name]) => name)).toEqual(['edit_cad_part']);
  });

  test('no yorCad in the group: the first round is unchanged', async () => {
    callModel.mockResolvedValueOnce(says('Made-up answer.'));
    await chat(pinned(given(...CAD), ['chat', 'doc']));
    const withoutGroup = firstRoundTools();
    expect(withoutGroup).not.toContain('read_cad_part');
    expect(withoutGroup).not.toContain('edit_cad_part');

    callModel.mockReset();
    callModel.mockResolvedValueOnce(says('Made-up answer.'));
    await chat(given(...CAD));
    expect(firstRoundTools()).toEqual(withoutGroup);
  });

  test('an agent without the CAD modules gets nothing new, even with yorCad in the group', async () => {
    callModel.mockResolvedValueOnce(says('Made-up answer.'));
    const list = given();
    const marked = pinned(list, ['yorCad']);
    expect(named(marked)).toEqual(named(list));
    await chat(marked);
    expect(firstRoundTools()).not.toContain('read_cad_part');
    expect(firstRoundTools()).not.toContain('edit_cad_part');
  });

  test('a reader-only agent gets read_cad_part pinned and never edit_cad_part', async () => {
    callModel.mockResolvedValueOnce(says('Made-up answer.'));
    await chat(pinned(given('read_cad_part'), ['yorCad']));
    expect(firstRoundTools()).toContain('read_cad_part');
    expect(firstRoundTools()).not.toContain('edit_cad_part');
  });

  test('the offered-tool check still refuses a CAD tool the agent was not given', async () => {
    callModel.mockResolvedValueOnce(asks('edit_cad_part')).mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat(pinned(given('read_cad_part'), ['yorCad']));
    expect(executeTool).not.toHaveBeenCalled();
    expect(toolActions.map((a) => [a.tool, a.ok, a.result])).toEqual([
      ['edit_cad_part', false, toolNotOfferedResult('edit_cad_part')],
    ]);
  });
});

describe('the pin map and request field', () => {
  test('yorCad pins both CAD tools; other kinds pin nothing', () => {
    expect(PINNED_TOOLS_BY_WINDOW_KIND.yorCad).toEqual(CAD);
    expect(pinnedToolsFor({ groupWindowKinds: ['yorCad', 'yorCad', 'doc'] })).toEqual(CAD);
    expect(pinnedToolsFor({ groupWindowKinds: ['doc', 'toString', '__proto__'] })).toEqual([]);
    expect(pinnedToolsFor({})).toEqual([]);
    expect(pinnedToolsFor({ groupWindowKinds: 'yorCad' })).toEqual([]);
  });

  test('the request field keeps only short strings', () => {
    expect(cleanGroupWindowKinds(['yorCad', 7, null, '', 'x'.repeat(65), 'doc'])).toEqual(['yorCad', 'doc']);
    expect(cleanGroupWindowKinds(Array.from({ length: 100 }, (_, i) => `k${i}`))).toHaveLength(64);
  });

  test('marking never changes the tool list itself', () => {
    const list = given('read_cad_part');
    const marked = withPinnedTools(list, CAD);
    expect(named(marked)).toEqual(named(list));
    expect(pinnedToolNamesOf(marked)).toEqual(['read_cad_part']);
    expect(pinnedToolNamesOf(list)).toEqual([]);
    expect(Object.keys(marked)).toHaveLength(list.length);
  });

  test('logs once per request with the count and window kind only', () => {
    const log = silentLog();
    const filter = groupPinFilter(['chat', 'yorCad'], { agentId: 'made-up-maker', log });
    filter(given(...CAD));
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith('group tools pinned', { agentId: 'made-up-maker', count: 2, windowKinds: ['yorCad'] });

    const quiet = silentLog();
    groupPinFilter(['yorCad'], { log: quiet })(given());
    expect(quiet.info).not.toHaveBeenCalled();
    expect(groupPinFilter(['doc'])).toBeNull();
    expect(groupPinFilter(undefined)).toBeNull();
  });
});

describe('the chat window sends the kinds in its group', () => {
  const group = { id: 'g1', label: 'Bracket', x: 0, y: 0, w: 1000, h: 1000, attachedAgents: ['made-up-maker'] };
  const wins = [
    { id: 'chat-1', kind: 'chat', x: 10, y: 10, w: 200, h: 200 },
    { id: 'cad-1', kind: 'yorCad', x: 300, y: 300, w: 200, h: 200 },
    { id: 'far-1', kind: 'doc', x: 5000, y: 5000, w: 200, h: 200 },
  ];

  test('an attached agent gets the kinds of windows inside its group', () => {
    expect(groupWindowKinds([group], wins, 'made-up-maker').sort()).toEqual(['chat', 'yorCad']);
  });

  test('a chat window sitting in the group counts too', () => {
    const unattached = { ...group, attachedAgents: [] };
    expect(groupWindowKinds([unattached], wins, 'made-up-maker', 'chat-1').sort()).toEqual(['chat', 'yorCad']);
  });

  test('no group: no kinds', () => {
    expect(groupWindowKinds([{ ...group, attachedAgents: [] }], wins, 'made-up-maker', 'far-1')).toEqual([]);
    expect(groupWindowKinds(null, null, 'made-up-maker')).toEqual([]);
  });
});
