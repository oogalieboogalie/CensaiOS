import { jest } from '@jest/globals';

const runChatLoop = jest.fn();
const getApiKey = jest.fn(() => 'legacy-key');
const isCloudRuntime = jest.fn(() => false);
const isFeatureEnabled = jest.fn(() => false);
const resolveFreeTierRuntime = jest.fn(() => ({ enabled: false }));
const prepareChatContext = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn() },
}));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => false }));
jest.unstable_mockModule('../server/memory.js', () => ({
  logConversation: jest.fn(),
  runHealingCascadeIfMentioned: jest.fn(),
}));
jest.unstable_mockModule('../server/routes/chat/shared.js', () => ({
  getApiKey,
  publicToolActions: value => value.length ? value : undefined,
  publicTimings: value => value,
}));
jest.unstable_mockModule('../server/routes/chat/chatContext.js', () => ({ prepareChatContext }));
jest.unstable_mockModule('../server/routes/chat/chatExecution.js', () => ({ runChatLoop }));
jest.unstable_mockModule('../server/operational-intelligence/traces.js', () => ({
  createSessionTrace: jest.fn(),
  finalizeTrace: jest.fn(),
}));
jest.unstable_mockModule('../server/middleware/runtimeMode.js', () => ({
  isCloudRuntime,
  isFeatureEnabled,
}));
jest.unstable_mockModule('../server/aiGateway/freeTierRuntime.js', () => ({
  resolveFreeTierRuntime,
}));

const { handleChat } = await import('../server/routes/chat/main.js');

function request() {
  return {
    body: {
      agentId: 'atlas',
      workspaceId: 'workspace-owned',
      messages: [{ from: 'me', text: 'hello' }],
      stream: true,
    },
    session: { userId: 7, userRole: 'user' },
  };
}

function responseDouble() {
  const state = { headers: {}, status: 200, writes: [], json: null, ended: false };
  return {
    state,
    setHeader: jest.fn((name, value) => { state.headers[name.toLowerCase()] = String(value); }),
    status: jest.fn(function setStatus(value) { state.status = value; return this; }),
    json: jest.fn((value) => { state.json = value; return value; }),
    write: jest.fn((value) => { state.writes.push(String(value)); }),
    end: jest.fn(() => { state.ended = true; }),
    flush: jest.fn(),
  };
}

function events(response) {
  return response.state.writes.map(line => JSON.parse(line));
}

beforeEach(() => {
  jest.clearAllMocks();
  getApiKey.mockReturnValue('legacy-key');
  isCloudRuntime.mockReturnValue(false);
  isFeatureEnabled.mockReturnValue(false);
  resolveFreeTierRuntime.mockReturnValue({ enabled: false });
  prepareChatContext.mockResolvedValue({
    reqModel: 'model',
    reqBaseUrl: 'http://provider',
    reqApiKey: 'key',
    reqProvider: 'test',
    chatMessages: [],
    toolsForCaller: [],
    changeImpact: { surface: 'chat' },
    projectContext: [],
    workspaceId: 'workspace-owned',
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test('returns a real JSON 429 before the first accepted model call', async () => {
  runChatLoop.mockRejectedValue(Object.assign(new Error('Free AI request allowance reached'), {
    code: 'FREE_TIER_USER_DAILY_LIMIT',
    statusCode: 429,
    retryAfter: 37,
  }));
  const response = responseDouble();

  await handleChat(request(), response);

  expect(response.state).toMatchObject({ status: 429, writes: [], ended: false });
  expect(response.state.headers).toEqual({ 'retry-after': '37' });
  expect(response.state.json).toMatchObject({
    code: 'FREE_TIER_USER_DAILY_LIMIT',
    message: 'Free AI request allowance reached',
    status: 429,
    retryAfter: 37,
  });
});

test('flushes buffered status in order only after model acceptance', async () => {
  runChatLoop.mockImplementation(async ({ sendEvent, onModelAccepted }) => {
    sendEvent({ type: 'status', status: 'provider_ready' });
    onModelAccepted();
    return { finalText: 'done', toolActions: [] };
  });
  const response = responseDouble();

  await handleChat(request(), response);

  expect(response.state.headers['content-type']).toBe('application/x-ndjson');
  expect(events(response).map(event => event.type)).toEqual([
    'status', 'change_impact', 'status', 'result',
  ]);
  expect(events(response).at(-1)).toMatchObject({ type: 'result', text: 'done' });
  expect(response.state.ended).toBe(true);
  expect(response.json).not.toHaveBeenCalled();
});

test('emits a terminal structured error when a later model round fails', async () => {
  runChatLoop.mockImplementation(async ({ onModelAccepted }) => {
    onModelAccepted();
    throw Object.assign(new Error('The free AI provider is temporarily unavailable'), {
      code: 'FREE_TIER_PROVIDER_UNAVAILABLE',
      statusCode: 503,
      retryAfter: 5,
    });
  });
  const response = responseDouble();

  await handleChat(request(), response);

  expect(response.status).not.toHaveBeenCalled();
  expect(events(response).some(event => event.type === 'result')).toBe(false);
  expect(events(response).at(-1)).toEqual({
    type: 'error',
    error: expect.objectContaining({
      code: 'FREE_TIER_PROVIDER_UNAVAILABLE', status: 503, retryAfter: 5,
    }),
  });
  expect(response.state.ended).toBe(true);
});

test('does not require the legacy key when the central cloud gateway is active', async () => {
  getApiKey.mockReturnValue('');
  isCloudRuntime.mockReturnValue(true);
  isFeatureEnabled.mockReturnValue(true);
  resolveFreeTierRuntime.mockReturnValue({ enabled: true });
  runChatLoop.mockImplementation(async ({ onModelAccepted }) => {
    onModelAccepted();
    return { finalText: 'free route', toolActions: [] };
  });

  await handleChat(request(), responseDouble());

  expect(runChatLoop).toHaveBeenCalledTimes(1);
});

test('allows cloud BYOK context resolution without a server-managed legacy key', async () => {
  getApiKey.mockReturnValue('');
  isCloudRuntime.mockReturnValue(true);
  resolveFreeTierRuntime.mockReturnValue({ enabled: false });
  runChatLoop.mockImplementation(async ({ onModelAccepted }) => {
    onModelAccepted();
    return { finalText: 'byok route', toolActions: [] };
  });

  await handleChat(request(), responseDouble());

  expect(prepareChatContext).toHaveBeenCalledTimes(1);
  expect(runChatLoop).toHaveBeenCalledTimes(1);
});

test('invalid free-tier activation fails before context or provider work', async () => {
  resolveFreeTierRuntime.mockImplementationOnce(() => {
    throw Object.assign(new Error('private configuration detail'), {
      code: 'FREE_TIER_CONFIG_INVALID',
    });
  });
  const response = responseDouble();

  await handleChat(request(), response);

  expect(response.state.status).toBe(503);
  expect(response.state.json).toMatchObject({
    code: 'FREE_TIER_CONFIG_UNAVAILABLE',
    message: 'AI access is temporarily unavailable',
  });
  expect(JSON.stringify(response.state.json)).not.toContain('private configuration detail');
  expect(prepareChatContext).not.toHaveBeenCalled();
  expect(runChatLoop).not.toHaveBeenCalled();
});
