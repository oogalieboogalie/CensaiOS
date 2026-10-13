import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn(), connect: jest.fn() };
const listWorkspaceCapabilityModules = jest.fn();
const loadWorkspaceCapabilityToolNames = jest.fn();
const replaceWorkspaceCapabilityModules = jest.fn();
const loadInstalledToolPackageModuleIds = jest.fn();
const filterToolsForAgent = jest.fn();
const buildFamilyToolRegistry = jest.fn();
const requireWorkspaceMember = jest.fn(async (_db, { userId, workspaceId, roles }) => {
  if (workspaceId === 'owned' && userId === 2) {
    throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  }
  const role = userId === 3 ? 'viewer' : 'owner';
  if (roles && !roles.includes(role)) {
    throw Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 });
  }
  return { id: workspaceId, role };
});

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/tools.js', () => ({ filterToolsForAgent }));
jest.unstable_mockModule('../server/tools/familyRegistry.js', () => ({ buildFamilyToolRegistry }));
jest.unstable_mockModule('../server/capabilities/workspaceCapabilities.js', () => ({
  listWorkspaceCapabilityModules,
  loadWorkspaceCapabilityToolNames,
  replaceWorkspaceCapabilityModules,
}));
jest.unstable_mockModule('../server/capabilities/packageStore.js', () => ({
  loadInstalledToolPackageModuleIds,
}));

const { default: express } = await import('express');
const { capabilitiesRouter } = await import('../server/routes/agents/capabilities.js');

function app(userId = 1) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  instance.use('/api', capabilitiesRouter);
  return instance;
}

beforeEach(() => {
  jest.clearAllMocks();
  listWorkspaceCapabilityModules.mockResolvedValue([{ module_id: 'web-research' }]);
  replaceWorkspaceCapabilityModules.mockResolvedValue({ changed: true, eventId: 'event-1', capabilities: [] });
  filterToolsForAgent.mockResolvedValue([{ function: { name: 'web_search' } }]);
  loadWorkspaceCapabilityToolNames.mockResolvedValue(['web_search']);
  loadInstalledToolPackageModuleIds.mockResolvedValue(['web-research']);
  buildFamilyToolRegistry.mockReturnValue({ tools: [{ name: 'web_search', status: 'active' }], counts: { active: 1 } });
});

test('signed members read and signed owners replace without caller-controlled attribution', async () => {
  const read = await request(app()).get('/api/agents/atlas/capabilities?workspaceId=owned');
  const write = await request(app()).put('/api/agents/atlas/capabilities').send({
    workspaceId: 'owned', modules: ['web-research'], userId: 999, mode: 'execute_with_approval',
  });
  const debug = await request(app()).get('/api/agents/atlas/debug-tools?workspaceId=owned');
  const registry = await request(app()).get('/api/agents/atlas/tool-registry?workspaceId=owned');

  expect(read.body).toMatchObject({
    modules: ['web-research'], installedModuleIds: ['web-research'], workspaceId: 'owned',
  });
  expect(write.status).toBe(200);
  expect(replaceWorkspaceCapabilityModules).toHaveBeenCalledWith(pool, expect.objectContaining({
    workspaceId: 'owned', userId: 1, agentId: 'atlas', moduleIds: ['web-research'],
  }));
  expect(debug.body).toEqual({ tools: ['web_search'], moduleTools: ['web_search'], workspaceId: 'owned' });
  expect(registry.body).toMatchObject({
    agentId: 'atlas', workspaceId: 'owned', canManage: true,
    tools: [{ name: 'web_search', status: 'active' }],
  });
  expect(buildFamilyToolRegistry).toHaveBeenCalledWith(expect.objectContaining({
    agentId: 'atlas', capabilities: [{ module_id: 'web-research' }],
    installedModuleIds: ['web-research'],
  }));
  expect(filterToolsForAgent).toHaveBeenCalledWith('atlas', expect.objectContaining({ workspaceId: 'owned' }));
});

test('viewer and outsider writes fail before mutation while viewer reads remain available', async () => {
  expect((await request(app(3)).get('/api/agents/atlas/capabilities?workspaceId=viewed')).status).toBe(200);
  expect((await request(app(3)).get('/api/agents/atlas/tool-registry?workspaceId=viewed')).body.canManage).toBe(false);
  expect((await request(app(3)).put('/api/agents/atlas/capabilities')
    .send({ workspaceId: 'viewed', modules: [] })).status).toBe(403);
  expect((await request(app(2)).put('/api/agents/atlas/capabilities')
    .send({ workspaceId: 'owned', modules: [] })).status).toBe(403);
  expect(replaceWorkspaceCapabilityModules).not.toHaveBeenCalled();
});

test('authentication, canonical identity, and unambiguous workspace are required', async () => {
  expect((await request(app(0)).get('/api/agents/atlas/capabilities?workspaceId=owned')).status).toBe(401);
  expect((await request(app(0)).get('/api/agents/atlas/tool-registry?workspaceId=owned')).status).toBe(401);
  expect((await request(app()).get('/api/agents/atlas/capabilities')).status).toBe(400);
  expect((await request(app()).put('/api/agents/atlas/capabilities?workspaceId=a')
    .send({ workspaceId: 'b', modules: [] })).status).toBe(400);
  expect((await request(app()).get('/api/agents/guardian/capabilities?workspaceId=owned')).status).toBe(422);
});

test('internal failures are sanitized', async () => {
  listWorkspaceCapabilityModules.mockRejectedValueOnce(new Error('password=never SELECT secret'));
  const response = await request(app()).get('/api/agents/atlas/capabilities?workspaceId=owned');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: 'Agent modules are temporarily unavailable.' });
});
