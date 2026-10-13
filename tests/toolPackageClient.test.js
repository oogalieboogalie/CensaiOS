import { jest } from '@jest/globals';
import { createToolPackageClient } from '../src/lib/agentRegistry/packageClient.js';

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: jest.fn(async () => body) };
}

test('client encodes authoritative workspace and slash-bearing package IDs', async () => {
  const fetch = jest.fn()
    .mockResolvedValueOnce(response({ packages: [] }))
    .mockResolvedValueOnce(response({ created: true }, { status: 201 }))
    .mockResolvedValueOnce(response({ removed: true }));
  const client = createToolPackageClient({ fetch, workspaceId: 'workspace a' });
  await client.listToolPackages();
  await client.installToolPackage('censai/web-research');
  await client.removeToolPackage('censai/web-research');
  expect(fetch.mock.calls[0]).toEqual([
    '/api/tool-packages?workspaceId=workspace%20a', { credentials: 'same-origin' },
  ]);
  expect(fetch.mock.calls[1][0]).toBe('/api/tool-packages/censai%2Fweb-research/install');
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', credentials: 'same-origin' });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ workspaceId: 'workspace a' });
  expect(fetch.mock.calls[2][1]).toMatchObject({ method: 'DELETE', credentials: 'same-origin' });
});

test('client rejects missing scope and preserves safe server policy errors', async () => {
  expect(() => createToolPackageClient({ fetch: jest.fn(), workspaceId: '' })).toThrow(/Open a workspace/);
  const fetch = jest.fn(async () => response({
    error: 'Workspace role does not allow this operation', code: 'WORKSPACE_ROLE_FORBIDDEN',
  }, { ok: false, status: 403 }));
  const client = createToolPackageClient({ fetch, workspaceId: 'workspace-a' });
  await expect(client.installToolPackage('censai/web-research')).rejects.toMatchObject({
    message: 'Workspace role does not allow this operation', status: 403,
    code: 'WORKSPACE_ROLE_FORBIDDEN',
  });
});
