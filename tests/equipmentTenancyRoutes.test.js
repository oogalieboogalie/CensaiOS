import { jest } from '@jest/globals';
import request from 'supertest';

const loadAgentEquippedAttributeIds = jest.fn().mockResolvedValue(['technical']);
const loadAgentEquippedMindsetIds = jest.fn().mockResolvedValue(['mindset_first']);
const saveAgentAttributeIds = jest.fn().mockResolvedValue(undefined);
const saveAgentMindsetIds = jest.fn().mockResolvedValue(undefined);
const requireWorkspaceMember = jest.fn(async (_db, { userId, workspaceId, roles }) => {
  if (workspaceId === 'workspace-a' && userId !== 1) {
    throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  }
  const role = userId === 3 ? 'member' : 'owner';
  if (roles && !roles.includes(role)) {
    throw Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 });
  }
  return { id: workspaceId, role };
});

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/attributes/registry.js', () => ({
  listAttributeDefinitions: jest.fn().mockResolvedValue([]),
  listMindsetDefinitions: jest.fn().mockResolvedValue([]),
  loadAgentEquippedAttributeIds,
  loadAgentEquippedMindsetIds,
  loadAttributeValuesByIds: jest.fn().mockResolvedValue({}),
  saveAgentAttributeIds,
  saveAgentMindsetIds,
}));

const { attributesRouter } = await import('../server/routes/agents/attributes.js');

describe('agent equipment tenancy routes', () => {
  let app;
  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { userId: Number(req.get('x-user-id') || 1) };
      next();
    });
    app.use('/api', attributesRouter);
  });
  beforeEach(() => jest.clearAllMocks());

  test('allows member reads but denies outsider and noncanonical reads', async () => {
    const member = await request(app).get('/api/agents/atlas/attributes?workspaceId=workspace-a');
    expect(member.status).toBe(200);
    expect(loadAgentEquippedAttributeIds).toHaveBeenCalledWith(
      'atlas', expect.objectContaining({ workspaceId: 'workspace-a', userId: 1 })
    );
    const outsider = await request(app).get('/api/agents/atlas/attributes?workspaceId=workspace-a')
      .set('x-user-id', '2');
    expect(outsider.status).toBe(403);
    const duplicate = await request(app).get('/api/agents/atlas-1/attributes?workspaceId=workspace-b');
    expect(duplicate.status).toBe(422);
  });

  test('derives write ownership from the session and rejects non-admin members', async () => {
    const owner = await request(app).put('/api/agents/atlas/mindsets').send({
      workspaceId: 'workspace-a',
      workspace_id: 'workspace-b',
      userId: 999,
      mindsets: ['mindset_first'],
    });
    expect(owner.status).toBe(200);
    expect(saveAgentMindsetIds).toHaveBeenCalledWith(
      'atlas', ['mindset_first'], expect.objectContaining({ workspaceId: 'workspace-a', userId: 1 })
    );
    const member = await request(app).put('/api/agents/atlas/attributes')
      .set('x-user-id', '3')
      .send({ workspaceId: 'workspace-b', attributes: ['technical'] });
    expect(member.status).toBe(403);
    expect(saveAgentAttributeIds).not.toHaveBeenCalled();
  });

  test('requires an explicit, unambiguous workspace', async () => {
    const missing = await request(app).get('/api/agents/atlas/mindsets');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('AGENT_CONFIGURATION_SCOPE_REQUIRED');
    const conflict = await request(app).put('/api/agents/atlas/mindsets?workspaceId=workspace-a')
      .send({ workspaceId: 'workspace-b', mindsets: [] });
    expect(conflict.status).toBe(400);
    expect(conflict.body.code).toBe('AGENT_CONFIGURATION_SCOPE_CONFLICT');
  });
});
