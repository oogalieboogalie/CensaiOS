import { jest } from '@jest/globals';
import { createFamilyToolRegistryClient } from '../src/lib/agentRegistry/toolClient.js';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('loads the signed workspace and encoded canonical agent route', async () => {
  const fetch = jest.fn(async () => response(200, { tools: [], counts: { active: 0 } }));
  const client = createFamilyToolRegistryClient({ fetch, workspaceId: 'workspace/a' });
  await expect(client.listTools('the architect')).resolves.toMatchObject({ tools: [] });
  expect(fetch).toHaveBeenCalledWith(
    '/api/agents/the%20architect/tool-registry?workspaceId=workspace%2Fa',
    { credentials: 'same-origin' },
  );
});

test('rejects missing scope and preserves the sanitized server error', async () => {
  expect(() => createFamilyToolRegistryClient({ fetch: jest.fn(), workspaceId: '' }))
    .toThrow('Tool registry requires a workspace.');
  const client = createFamilyToolRegistryClient({
    fetch: jest.fn(async () => response(403, { error: 'Workspace access denied' })),
    workspaceId: 'workspace-a',
  });
  await expect(client.listTools('atlas')).rejects.toMatchObject({
    message: 'Workspace access denied', status: 403,
  });
});
