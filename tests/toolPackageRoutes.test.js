import { jest } from '@jest/globals';
import request from 'supertest';

const listWorkspaceToolPackages = jest.fn();
const installWorkspaceToolPackage = jest.fn();
const removeWorkspaceToolPackage = jest.fn();
jest.unstable_mockModule('../server/capabilities/packageStore.js', () => ({
  ToolPackageError: class extends Error {
    constructor(message, statusCode = 400, code = 'INVALID') {
      super(message); this.statusCode = statusCode; this.code = code;
    }
  },
  listWorkspaceToolPackages, installWorkspaceToolPackage, removeWorkspaceToolPackage,
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));

const { default: express } = await import('express');
const { toolPackagesRouter } = await import('../server/routes/agents/toolPackages.js');

function app(userId = 7) {
  const result = express(); result.use(express.json());
  result.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  result.use('/api', toolPackagesRouter);
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  listWorkspaceToolPackages.mockResolvedValue({ canManage: true, packages: [] });
  installWorkspaceToolPackage.mockResolvedValue({ created: true, install: { package_id: 'censai/web-research' } });
  removeWorkspaceToolPackage.mockResolvedValue({ removed: true });
});

test('signed scope and encoded package IDs reach list, install, and remove', async () => {
  const read = await request(app()).get('/api/tool-packages?workspaceId=workspace-a');
  const put = await request(app()).put('/api/tool-packages/censai%2Fweb-research/install')
    .send({ workspaceId: 'workspace-a', userId: 999 });
  const remove = await request(app()).delete('/api/tool-packages/censai%2Fweb-research/install')
    .send({ workspaceId: 'workspace-a' });
  expect(read.status).toBe(200);
  expect(put.status).toBe(201);
  expect(remove.status).toBe(200);
  expect(listWorkspaceToolPackages).toHaveBeenCalledWith({}, { workspaceId: 'workspace-a', userId: 7 });
  expect(installWorkspaceToolPackage).toHaveBeenCalledWith({}, {
    workspaceId: 'workspace-a', userId: 7, packageId: 'censai/web-research',
  });
  expect(removeWorkspaceToolPackage).toHaveBeenCalledWith({}, {
    workspaceId: 'workspace-a', userId: 7, packageId: 'censai/web-research',
  });
});

test('authentication, explicit scope, and unambiguous scope are required', async () => {
  expect((await request(app(0)).get('/api/tool-packages?workspaceId=workspace-a')).status).toBe(401);
  expect((await request(app()).get('/api/tool-packages')).status).toBe(400);
  expect((await request(app()).put('/api/tool-packages/censai%2Fweb-research/install?workspaceId=a')
    .send({ workspaceId: 'b' })).status).toBe(400);
  expect(installWorkspaceToolPackage).not.toHaveBeenCalled();
});

test('stable policy errors pass through and unexpected failures are sanitized', async () => {
  const denied = Object.assign(new Error('Workspace role does not allow this operation'), {
    statusCode: 403, code: 'WORKSPACE_ROLE_FORBIDDEN',
  });
  installWorkspaceToolPackage.mockRejectedValueOnce(denied);
  const policy = await request(app()).put('/api/tool-packages/censai%2Fweb-research/install')
    .send({ workspaceId: 'workspace-a' });
  expect(policy.status).toBe(403);
  expect(policy.body).toEqual({ error: denied.message, code: denied.code });

  listWorkspaceToolPackages.mockRejectedValueOnce(new Error('password=never SELECT secret'));
  const failure = await request(app()).get('/api/tool-packages?workspaceId=workspace-a');
  expect(failure.status).toBe(500);
  expect(failure.body).toEqual({ error: 'Tool packages are temporarily unavailable.' });
});
