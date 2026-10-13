import { jest } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const resolveWorkspaceContext = jest.fn();
const getRuntimeMode = jest.fn();
const isFeatureEnabled = jest.fn();
const getSecret = jest.fn();
const loadFreeTierConfig = jest.fn();
const getFreeTierAllowanceStatus = jest.fn();
const resolveFreeTierRuntime = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext,
}));
jest.unstable_mockModule('../server/middleware/runtimeMode.js', () => ({
  getRuntimeMode,
  isFeatureEnabled,
  RUNTIME_MODES: {
    LOCAL_DESKTOP: 'local_desktop',
    PRIVATE_SERVER: 'private_server',
    CLOUD_SAAS: 'cloud_saas',
  },
}));
jest.unstable_mockModule('../server/secrets.js', () => ({ getSecret }));
jest.unstable_mockModule('../server/aiGateway/freeTierConfig.js', () => ({
  loadFreeTierConfig,
}));
jest.unstable_mockModule('../server/aiGateway/freeTierAllowance.js', () => ({
  getFreeTierAllowanceStatus,
}));
jest.unstable_mockModule('../server/aiGateway/freeTierRuntime.js', () => ({
  resolveFreeTierRuntime,
}));

const { default: express } = await import('express');
const { freeTierStatusRouter } = await import('../server/routes/freeTierStatus.js');

const config = Object.freeze({
  enabled: true,
  provider: 'openrouter',
  model: 'openrouter/free',
  userDailyLimit: 8,
  sharedDailyLimit: 40,
  sharedMinuteLimit: 10,
  retries: 0,
});
const allowance = Object.freeze({
  user: { limit: 8, used: 2, reserved: 1, remaining: 5, resetsAt: '2026-07-14T00:00:00.000Z' },
  shared: { limit: 40, used: 7, reserved: 1, remaining: 32, resetsAt: '2026-07-14T00:00:00.000Z' },
  minute: { limit: 10, used: 3, reserved: 0, remaining: 7, resetsAt: '2026-07-13T13:01:00-05:00' },
  otherUser: { id: 999, used: 8 },
});
const unavailable = {
  error: 'free_ai_status_unavailable',
  message: 'Free AI allowance status is temporarily unavailable.',
};

function app(session = { userId: 7 }) {
  const instance = express();
  instance.use((req, _res, next) => {
    req.session = session;
    next();
  });
  instance.use('/api/ai/free-tier', freeTierStatusRouter);
  return instance;
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-owned', role: 'member' });
  getRuntimeMode.mockReturnValue('cloud_saas');
  isFeatureEnabled.mockReturnValue(true);
  getSecret.mockReturnValue('platform-secret');
  loadFreeTierConfig.mockReturnValue(config);
  resolveFreeTierRuntime.mockReturnValue({ enabled: true, config });
  query.mockResolvedValue({ rows: [{ configured: true }] });
  getFreeTierAllowanceStatus.mockResolvedValue(allowance);
});

test('requires an authenticated session before workspace or status reads', async () => {
  const response = await request(app({})).get('/api/ai/free-tier/status?workspaceId=workspace-owned');
  expect(response.status).toBe(401);
  expect(resolveWorkspaceContext).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
  expect(getFreeTierAllowanceStatus).not.toHaveBeenCalled();
});

test('requires an explicit workspace before resolving membership', async () => {
  const response = await request(app()).get('/api/ai/free-tier/status');
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: 'workspace_required' });
  expect(resolveWorkspaceContext).not.toHaveBeenCalled();
});

test('denies a foreign workspace before config, BYOK, or ledger reads', async () => {
  resolveWorkspaceContext.mockRejectedValueOnce(
    Object.assign(new Error('Workspace access denied'), { statusCode: 403 })
  );
  const response = await request(app()).get('/api/ai/free-tier/status?workspaceId=workspace-foreign');
  expect(response.status).toBe(403);
  expect(response.body).toEqual({ error: 'workspace_access_denied' });
  expect(getRuntimeMode).not.toHaveBeenCalled();
  expect(getSecret).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
  expect(getFreeTierAllowanceStatus).not.toHaveBeenCalled();
});

test.each([
  ['dark', 'cloud_saas', false],
  ['non-cloud', 'private_server', true],
])('reports disabled without secret, BYOK, or ledger reads when %s', async (_label, mode, feature) => {
  resolveFreeTierRuntime.mockReturnValueOnce({ enabled: false, mode, feature });
  const response = await request(app()).get('/api/ai/free-tier/status?workspaceId=workspace-owned');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ enabled: false });
  expect(getSecret).not.toHaveBeenCalled();
  expect(loadFreeTierConfig).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
  expect(getFreeTierAllowanceStatus).not.toHaveBeenCalled();
});

test('returns only authorized allowance and exact-user BYOK status', async () => {
  const response = await request(app()).get(
    '/api/ai/free-tier/status?workspaceId=workspace-owned&userId=999'
  );
  expect(response.status).toBe(200);
  expect(resolveWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
    userId: 7,
    workspaceId: 'workspace-owned',
  });
  expect(query).toHaveBeenCalledWith(expect.stringMatching(/SELECT EXISTS[\s\S]*user_id = \$1/), [
    7,
    'openrouter',
  ]);
  expect(query.mock.calls[0][0]).not.toMatch(/api_key_encrypted/);
  expect(getFreeTierAllowanceStatus).toHaveBeenCalledWith({
    db: expect.anything(),
    config,
    userId: 7,
    workspaceId: 'workspace-owned',
    source: 'http.free-tier-status',
  });
  expect(response.body).toEqual({
    enabled: true,
    provider: 'openrouter',
    model: 'openrouter/free',
    allowance: {
      user: allowance.user,
      shared: allowance.shared,
      minute: { ...allowance.minute, resetsAt: '2026-07-13T18:01:00.000Z' },
    },
    resets: {
      timezone: 'UTC',
      userDailyAt: allowance.user.resetsAt,
      sharedDailyAt: allowance.shared.resetsAt,
      sharedMinuteAt: '2026-07-13T18:01:00.000Z',
    },
    byok: { provider: 'openrouter', configured: true },
  });
  expect(JSON.stringify(response.body)).not.toContain('platform-secret');
  expect(response.body).not.toHaveProperty('otherUser');
});

test('normalizes config failures to a stable safe 503', async () => {
  resolveFreeTierRuntime.mockImplementationOnce(() => {
    throw new Error('OPENROUTER_API_KEY value leaked');
  });
  const response = await request(app()).get('/api/ai/free-tier/status?workspaceId=workspace-owned');
  expect(response.status).toBe(503);
  expect(response.body).toEqual(unavailable);
  expect(JSON.stringify(response.body)).not.toContain('OPENROUTER_API_KEY');
  expect(query).not.toHaveBeenCalled();
  expect(getFreeTierAllowanceStatus).not.toHaveBeenCalled();
});

test('normalizes ledger failures to the same stable safe 503', async () => {
  getFreeTierAllowanceStatus.mockRejectedValueOnce(new Error('ledger internals'));
  const response = await request(app()).get('/api/ai/free-tier/status?workspaceId=workspace-owned');
  expect(response.status).toBe(503);
  expect(response.body).toEqual(unavailable);
  expect(JSON.stringify(response.body)).not.toContain('ledger internals');
});

test('normalizes BYOK status-store failures without attempting the ledger', async () => {
  query.mockRejectedValueOnce(new Error('encrypted key internals'));
  const response = await request(app()).get('/api/ai/free-tier/status?workspaceId=workspace-owned');
  expect(response.status).toBe(503);
  expect(response.body).toEqual(unavailable);
  expect(JSON.stringify(response.body)).not.toContain('encrypted key internals');
  expect(getFreeTierAllowanceStatus).not.toHaveBeenCalled();
});
