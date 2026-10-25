import { jest } from '@jest/globals';

const discoverAgents = jest.fn();
const createHelpRequest = jest.fn();
const getHelpRequest = jest.fn();
const boardAgents = jest.fn(async () => ({ 'agent:nexus': [{ window_id: 'w-nexus', kind: 'chat' }] }));
const placeHelpCard = jest.fn(async () => ({ id: 'help-r1' }));
const settleHelpCard = jest.fn(async () => true);
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/agent-registry/discovery.js', () => ({ discoverAgents }));
jest.unstable_mockModule('../server/agent-registry/helpRequests.js', () => ({ createHelpRequest, getHelpRequest }));
jest.unstable_mockModule('../server/agent-registry/helpCards.js', () => ({ boardAgents, placeHelpCard, settleHelpCard }));
const listBoardHelpers = jest.fn(async () => []);
const requestBoardHelp = jest.fn();
const boardHelpStatus = jest.fn();
jest.unstable_mockModule('../server/agent-registry/boardHelp.js', () => ({
  listBoardHelpers, requestBoardHelp, boardHelpStatus,
  isBoardWindowCard: (id) => String(id || '').startsWith('window:'),
  isBoardRequestId: (id) => /^(cli|module):/.test(String(id || '')),
}));

const { handleAgentNetworkTool, __setSleepForTests } = await import('../server/tools/handlers/agentNetwork.js');
const { agentNetworkTools } = await import('../server/tools/definitions/agentNetwork.js');
const { FAMILY_DEFAULT_TOOL_NAMES, familyToolPolicy } = await import('../server/tools/rbac/familyBaseline.js');
const { TOOL_CATALOG_OVERRIDES } = await import('../server/tools/catalog.js');

const NAMES = ['discover_agents', 'request_agent_help', 'agent_help_status'];
const context = { workspaceId: 'ws-a', userId: 7 };
const sleeps = [];

beforeEach(() => {
  jest.clearAllMocks();
  sleeps.length = 0;
  __setSleepForTests(async (ms) => { sleeps.push(ms); });
});

test('network tools are defined, catalogued and granted to every family agent', () => {
  expect(agentNetworkTools.map((tool) => tool.function.name)).toEqual(NAMES);
  for (const name of NAMES) expect(TOOL_CATALOG_OVERRIDES[name]).toMatchObject({ category: 'Coordination', scopeKind: 'agents' });
  for (const [agentId, names] of Object.entries(FAMILY_DEFAULT_TOOL_NAMES)) {
    expect(names).toEqual(expect.arrayContaining(NAMES));
    expect(familyToolPolicy(agentId, 'request_agent_help')).toMatchObject({ risk: 'write', mode: 'autonomous_internal' });
    expect(familyToolPolicy(agentId, 'discover_agents')).toMatchObject({ risk: 'read' });
  }
});

test('discover_agents excludes the calling agent and reports who it may request', async () => {
  discoverAgents.mockResolvedValue({ query: 'sql', items: [
    { cardId: 'agent:nexus', name: 'Nexus', description: 'db', matchedSkills: [{ id: 's', name: 'Schema', tags: [] }], callable: true, acceptsRequests: true, agentCanRequest: true },
    { cardId: 'ext:9:x', name: 'X', description: 'x', matchedSkills: [], callable: true, acceptsRequests: true, agentCanRequest: false },
  ] });
  const out = JSON.parse(await handleAgentNetworkTool('Atlas', 'discover_agents', { query: 'sql', limit: 99 }, context));
  expect(discoverAgents).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    workspaceId: 'ws-a', userId: 7, query: 'sql', limit: 20, excludeCardIds: ['agent:atlas'],
  }));
  expect(out.agents.map((agent) => [agent.card_id, agent.you_can_request])).toEqual([['agent:nexus', true], ['ext:9:x', false]]);
  expect(out.agents[0].matched_skills).toEqual([{ id: 's', name: 'Schema' }]);
  expect(out.agents[0].on_board).toEqual([{ window_id: 'w-nexus', kind: 'chat' }]);
  expect(out.agents[1].on_board).toBeUndefined();
  expect(out.board_helpers).toBeUndefined();
});

test('discover_agents lists the coding CLIs and modules on the board', async () => {
  discoverAgents.mockResolvedValue({ query: 'tests', items: [] });
  listBoardHelpers.mockResolvedValueOnce([{ card_id: 'window:w-cli', name: 'Claude Code', kind: 'coding_cli', you_can_request: true }]);
  const out = JSON.parse(await handleAgentNetworkTool('atlas', 'discover_agents', { query: 'run the tests' }, context));
  expect(listBoardHelpers).toHaveBeenCalledWith('ws-a', 'run the tests', 5, { excludeAgentId: 'atlas' });
  expect(out.board_helpers).toEqual([{ card_id: 'window:w-cli', name: 'Claude Code', kind: 'coding_cli', you_can_request: true }]);
});

test('request_agent_help with a window card asks the CLI or module on the board', async () => {
  requestBoardHelp.mockResolvedValueOnce({ request_id: 'cli:abc', agent: 'Claude Code', status: 'needs approval' });
  const out = JSON.parse(await handleAgentNetworkTool('atlas', 'request_agent_help', {
    card_id: 'window:w-cli', task: 'fix the failing test', wait_seconds: 20,
  }, { ...context, windowId: 'w-atlas' }));
  expect(requestBoardHelp).toHaveBeenCalledWith({ workspaceId: 'ws-a', userId: 7 }, expect.objectContaining({
    cardId: 'window:w-cli', task: 'fix the failing test', fromWindowId: 'w-atlas', requesterAgentId: 'atlas', fromLabel: 'Atlas', waitSeconds: 20,
  }));
  expect(createHelpRequest).not.toHaveBeenCalled();
  expect(out).toMatchObject({ request_id: 'cli:abc', status: 'needs approval' });
  expect(out.note).toMatch(/Agent Console/);
  boardHelpStatus.mockResolvedValueOnce({ request_id: 'cli:abc', status: 'completed', result: 'Fixed.' });
  expect(JSON.parse(await handleAgentNetworkTool('atlas', 'agent_help_status', { request_id: 'cli:abc' }, context)))
    .toMatchObject({ status: 'completed', result: 'Fixed.' });
});

test('request_agent_help files as the agent and can wait for the answer', async () => {
  createHelpRequest.mockResolvedValue({ id: 'r1', cardId: 'agent:nexus', cardName: 'Nexus', status: 'queued' });
  getHelpRequest
    .mockResolvedValueOnce({ id: 'r1', cardId: 'agent:nexus', cardName: 'Nexus', status: 'working' })
    .mockResolvedValueOnce({ id: 'r1', cardId: 'agent:nexus', cardName: 'Nexus', status: 'completed', result: 'CREATE INDEX ...' });
  const out = JSON.parse(await handleAgentNetworkTool('atlas', 'request_agent_help', {
    card_id: ' agent:nexus ', task: 'index it', skill_id: 'write-migration', wait_seconds: 30,
  }, { ...context, windowId: 'w-atlas' }));
  expect(placeHelpCard).toHaveBeenCalledWith('ws-a', {
    request: expect.objectContaining({ id: 'r1' }), fromWindowId: 'w-atlas', requesterAgentId: 'atlas', awaitingTool: true,
  });
  // The agent got the answer inside its tool call, so the card is settled as delivered.
  expect(settleHelpCard).toHaveBeenCalledWith('ws-a', { id: 'help-r1' }, expect.objectContaining({ status: 'completed' }));
  expect(createHelpRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    workspaceId: 'ws-a', userId: 7, cardId: 'agent:nexus', task: 'index it', skillId: 'write-migration',
    requester: { kind: 'agent', id: 'atlas' }, autonomous: true,
  }));
  expect(out).toMatchObject({ request_id: 'r1', status: 'completed', result: 'CREATE INDEX ...' });
  expect(sleeps).toEqual([2000, 2000]);
});

test('without wait_seconds the request returns immediately with a hint', async () => {
  createHelpRequest.mockResolvedValue({ id: 'r2', cardId: 'ext:9:x', cardName: 'X', status: 'pending' });
  const out = JSON.parse(await handleAgentNetworkTool('atlas', 'request_agent_help', { card_id: 'ext:9:x', task: 't' }, context));
  expect(out.status).toBe('pending');
  expect(out.note).toMatch(/owner to accept/);
  expect(getHelpRequest).not.toHaveBeenCalled();
  expect(placeHelpCard).toHaveBeenCalledWith('ws-a', expect.objectContaining({ awaitingTool: false }));
  expect(settleHelpCard).not.toHaveBeenCalled();
});

test('agent_help_status validates ids and surfaces store errors as JSON', async () => {
  expect(JSON.parse(await handleAgentNetworkTool('atlas', 'agent_help_status', { request_id: 'nope' }, context)))
    .toEqual({ error: 'Unknown request_id.' });
  const error = Object.assign(new Error('Help request not found.'), { code: 'AGENT_HELP_NOT_FOUND' });
  getHelpRequest.mockRejectedValueOnce(error);
  const id = '3f1c9a52-6a7e-4c1b-9a51-2d3e4f5a6b7c';
  expect(JSON.parse(await handleAgentNetworkTool('atlas', 'agent_help_status', { request_id: id }, context)))
    .toEqual({ error: 'Help request not found.', code: 'AGENT_HELP_NOT_FOUND' });
});

test('every network tool requires a signed workspace context', async () => {
  for (const name of NAMES) {
    const out = JSON.parse(await handleAgentNetworkTool('atlas', name, { query: 'x' }, {}));
    expect(out.error).toMatch(/authenticated workspace context/);
  }
});
