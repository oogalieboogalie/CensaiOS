import { jest } from '@jest/globals';
import {
  __test__,
  fetchA2AImport,
  upsertA2AImport,
} from '../server/agent-registry/adapters/a2aImport.js';
import { RUNTIME_MODES } from '../server/middleware/runtimeMode.js';

const rawCard = {
  protocolVersion: '0.3.0', name: 'Local Agent', description: 'Local fixture.', version: '1.0.0',
  url: 'http://127.0.0.1:4111/a2a', preferredTransport: 'JSONRPC',
  defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
  skills: [{ id: 'echo', name: 'Echo', description: 'Echo text.', tags: ['test'] }],
};

describe('A2A import service', () => {
  test('fetches and validates a bounded local card in local desktop mode', async () => {
    const guardedFetch = jest.fn(async () => new Response(JSON.stringify(rawCard), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const result = await fetchA2AImport('http://127.0.0.1:4111/.well-known/agent-card.json', {
      mode: RUNTIME_MODES.LOCAL_DESKTOP, guardedFetch,
    });
    expect(result).toEqual(expect.objectContaining({ name: 'Local Agent', executable: true }));
    expect(guardedFetch).toHaveBeenCalledTimes(1);
  });

  test('revalidates redirects and rejects non-JSON responses', async () => {
    const redirectingFetch = jest.fn()
      .mockResolvedValueOnce(new Response('', {
        status: 302, headers: { location: '/next' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rawCard), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    const redirected = await fetchA2AImport('http://127.0.0.1:4111/card', {
      mode: RUNTIME_MODES.LOCAL_DESKTOP, guardedFetch: redirectingFetch,
    });
    expect(redirected).toEqual(expect.objectContaining({
      executable: true,
      cardUrl: 'http://127.0.0.1:4111/card',
      resolvedCardUrl: 'http://127.0.0.1:4111/next',
    }));

    await expect(fetchA2AImport('http://127.0.0.1:4111/card', {
      mode: RUNTIME_MODES.LOCAL_DESKTOP,
      guardedFetch: async () => new Response('<html />', {
        status: 200, headers: { 'content-type': 'text/html' },
      }),
    })).rejects.toMatchObject({ code: 'A2A_CONTENT_TYPE_INVALID' });
  });

  test('blocks redirect-to-private in server mode before a second request', async () => {
    const guardedFetch = jest.fn(async () => new Response('', {
      status: 302, headers: { location: 'https://127.0.0.1/private-card' },
    }));
    await expect(fetchA2AImport('https://agent.example/card', {
      mode: RUNTIME_MODES.PRIVATE_SERVER,
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      guardedFetch,
    })).rejects.toMatchObject({ code: 'A2A_EGRESS_DENIED' });
    expect(guardedFetch).toHaveBeenCalledTimes(1);
  });

  test('rejects an oversized response before parsing', async () => {
    await expect(fetchA2AImport('http://127.0.0.1:4111/card', {
      mode: RUNTIME_MODES.LOCAL_DESKTOP,
      guardedFetch: async () => new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '256001' },
      }),
    })).rejects.toMatchObject({ code: 'A2A_CARD_SIZE_INVALID' });
  });

  test('upserts a deterministic workspace-scoped executable card', async () => {
    const inspected = await fetchA2AImport('http://127.0.0.1:4111/card', {
      mode: RUNTIME_MODES.LOCAL_DESKTOP,
      guardedFetch: async () => new Response(JSON.stringify(rawCard), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    });
    const expectedId = __test__.importedCardId('ws-1', inspected.cardUrl);
    const query = jest.fn(async (_sql, params) => ({
      rows: [{ id: params[0], metadata: JSON.parse(params[8]), imported_created: true }],
    }));
    const result = await upsertA2AImport({
      db: { query }, workspaceId: 'ws-1', userId: 7, inspected,
    });
    expect(result.created).toBe(true);
    expect(result.card.id).toBe(expectedId);
    expect(result.card.metadata.executor).toEqual(expect.objectContaining({
      kind: 'a2a', status: 'executable', protocolVersion: '0.3.0',
    }));
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (id) DO UPDATE');
  });
});
