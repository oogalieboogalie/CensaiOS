import { jest } from '@jest/globals';
import request from 'supertest';

// Mocking Qdrant and Model Provider env/secrets
jest.unstable_mockModule('../server/qdrant.js', () => ({
  checkQdrantHealth: jest.fn(async () => ({ ready: true, connected: true })),
  upsertVector: jest.fn(),
  searchVectors: jest.fn(),
  deleteVector: jest.fn(),
}));

jest.unstable_mockModule('../server/secrets.js', () => ({
  initSecrets: jest.fn(),
  getSecret: jest.fn((key) => {
    if (key === 'AI_API_KEY') return 'test-key';
    return null;
  }),
  optionalSecret: jest.fn((_key, fallback = null) => fallback),
  requireProductionSecret: jest.fn(() => null),
}));

jest.unstable_mockModule('../server/memory/tenancyStatus.js', () => ({
  getMemoryOwnershipSummary: jest.fn(async () => ({
    ready: true,
    legacyQuarantinedCount: 0,
    scopedCount: 0,
    tables: {},
  })),
}));

jest.unstable_mockModule('../server/memory/subagentTenancyStatus.js', () => ({
  getSubAgentOwnershipSummary: jest.fn(async () => ({
    ready: true,
    legacyUnscopedCount: 0,
    scopedCount: 0,
    legacyScratchpadCount: 0,
    scopedScratchpadCount: 0,
  })),
}));

jest.unstable_mockModule('../server/attributes/tenancyStatus.js', () => ({
  getEquipmentOwnershipSummary: jest.fn(async () => ({
    ready: true,
    legacyQuarantinedCount: 0,
    legacyUnifiedCount: 0,
    legacyAttributeCount: 0,
    scopedCount: 0,
    scopedWorkspaceCount: 0,
    scopedAgentCount: 0,
  })),
}));

const getCapabilityOwnershipSummary = jest.fn(async () => ({
  ready: true,
  legacyQuarantinedCount: 0,
  scopedCount: 0,
  scopedWorkspaceCount: 0,
  scopedAgentCount: 0,
}));
jest.unstable_mockModule('../server/capabilities/tenancyStatus.js', () => ({
  getCapabilityOwnershipSummary,
}));

const getToolApprovalOwnershipSummary = jest.fn(async () => ({
  ready: true, totalCount: 0, pendingCount: 0, executingCount: 0, staleExecutingCount: 0,
}));
jest.unstable_mockModule('../server/approvals/tenancyStatus.js', () => ({
  getToolApprovalOwnershipSummary,
}));

const getAgentCardInstallOwnershipSummary = jest.fn(async () => ({
  ready: true, totalCount: 0, workspaceCount: 0, cardCount: 0,
}));
jest.unstable_mockModule('../server/agent-registry/installStatus.js', () => ({
  getAgentCardInstallOwnershipSummary,
}));

const getToolPackageOwnershipSummary = jest.fn(async () => ({
  ready: true, totalCount: 0, workspaceCount: 0, validCount: 0,
  invalidCount: 0, orphanCapabilityCount: 0,
}));
jest.unstable_mockModule('../server/capabilities/packageStatus.js', () => ({
  getToolPackageOwnershipSummary,
}));

const getFamilyBoundaryStatus = jest.fn(async () => ({
  ready: true,
  blueprint: { version: 'test-v1', hash: 'a'.repeat(64), agentCount: 7, watchEdgeCount: 9 },
  legacy: {},
  healing: { ready: true, enabled: false, state: 'disabled' },
}));
jest.unstable_mockModule('../server/agents/familyBoundaryStatus.js', () => ({
  getFamilyBoundaryStatus,
}));

const getFreeTierReadiness = jest.fn(() => ({ ready: true, enabled: false }));
jest.unstable_mockModule('../server/aiGateway/freeTierRuntime.js', () => ({
  getFreeTierReadiness,
  resolveFreeTierRuntime: jest.fn(() => ({ enabled: false })),
}));

const { app } = await import('../server.js');
const { default: pool } = await import('../server/db.js');

describe('Readiness and Health API', () => {
  let querySpy;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for DB success
    querySpy = jest.spyOn(pool, 'query').mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    querySpy.mockRestore();
  });

  it('GET /api/health returns 200 and legacy format', async () => {
    expect(app.get('sessionStore').cleanupTimer).toBeNull();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('database', true);
    expect(res.body).toHaveProperty('modelProvider');
    expect(res.body.modelProvider).toHaveProperty('ready', true);
    expect(res.body).toHaveProperty('agentCardWorker');
    expect(res.body).toHaveProperty('agentWakeupWorker');
  });

  it('GET /api/ready returns 200 when all critical systems are up', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it('GET /api/ready returns 503 when database is down', async () => {
    querySpy.mockRejectedValueOnce(new Error('DB Down'));
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.database.connected).toBe(false);
  });

  it('GET /api/ready fails closed when enabled free AI configuration is invalid', async () => {
    getFreeTierReadiness.mockReturnValueOnce({
      ready: false,
      enabled: true,
      error: 'free_ai_configuration_invalid',
    });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.freeAiAccess).toEqual({
      ready: false,
      enabled: true,
      error: 'free_ai_configuration_invalid',
    });
  });

  it('GET /api/ready fails closed when legacy family healing is enabled', async () => {
    getFamilyBoundaryStatus.mockResolvedValueOnce({
      ready: false,
      reason: 'family_healing_untrusted',
      healing: { ready: false, enabled: true, state: 'blocked' },
    });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.degradedState).toBe('family_healing_untrusted');
    expect(res.body.familyBoundary.healing).toEqual({
      ready: false,
      enabled: true,
      state: 'blocked',
    });
  });

  it('GET /api/ready fails closed when capability tenancy is unavailable', async () => {
    getCapabilityOwnershipSummary.mockResolvedValueOnce({ ready: false, schema: { present: false } });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.degradedState).toBe('agent_capability_ownership_unavailable');
    expect(res.body.capabilityOwnership).toEqual({ ready: false, schema: { present: false } });
  });

  it('GET /api/ready fails closed when tool approval tenancy is unavailable', async () => {
    getToolApprovalOwnershipSummary.mockResolvedValueOnce({ ready: false, schema: { present: false } });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.degradedState).toBe('tool_approval_ownership_unavailable');
    expect(res.body.toolApprovalOwnership).toEqual({ ready: false, schema: { present: false } });
  });

  it('GET /api/ready fails closed when reviewed tool package ownership is unavailable', async () => {
    getToolPackageOwnershipSummary.mockResolvedValueOnce({
      ready: false, invalidCount: 1, orphanCapabilityCount: 0,
    });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.degradedState).toBe('tool_package_ownership_unavailable');
    expect(res.body.toolPackageOwnership).toEqual({
      ready: false, invalidCount: 1, orphanCapabilityCount: 0,
    });
  });

  it('GET /api/ready fails closed when AgentCard install tenancy is unavailable', async () => {
    getAgentCardInstallOwnershipSummary.mockResolvedValueOnce({ ready: false, schema: { present: false } });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.degradedState).toBe('agent_card_install_ownership_unavailable');
    expect(res.body.agentCardInstallOwnership).toEqual({ ready: false, schema: { present: false } });
  });

  it('GET /api/ready returns 200 even if Qdrant is down (optional)', async () => {
    const { checkQdrantHealth } = await import('../server/qdrant.js');
    checkQdrantHealth.mockResolvedValueOnce({ ready: false, connected: false, error: 'Connection refused' });

    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200); // Still 200 because Qdrant is optional
    expect(res.body.qdrant.ready).toBe(false);
    expect(res.body.ready).toBe(true); // App is still "ready" for core tasks
  });
});
