import { jest } from '@jest/globals';
import {
  __test__,
  inspectN8NImport,
  normalizeN8NImportInput,
  upsertN8NImport,
} from '../server/agent-registry/adapters/n8nImport.js';
import { RUNTIME_MODES } from '../server/middleware/runtimeMode.js';

describe('n8n Chat Trigger import service', () => {
  const input = {
    name: 'Research workflow',
    description: 'Answers questions from the research index.',
    webhookUrl: 'http://127.0.0.1:5678/webhook/chat-1#ignored',
  };

  test('normalizes bounded identity without touching the network', () => {
    expect(normalizeN8NImportInput({ ...input, name: '  Research workflow  ' }))
      .toEqual(expect.objectContaining({ name: 'Research workflow' }));
    expect(() => normalizeN8NImportInput({ ...input, description: '' }))
      .toThrow('description is required');
    expect(() => normalizeN8NImportInput({ ...input, name: 'x'.repeat(161) }))
      .toThrow('name is too long');
  });

  test('validates local endpoints without executing the workflow', async () => {
    const lookup = jest.fn();
    const inspected = await inspectN8NImport(input, {
      mode: RUNTIME_MODES.LOCAL_DESKTOP,
      lookup,
    });
    expect(inspected).toEqual(expect.objectContaining({
      kind: 'n8n_chat', protocolVersion: 'n8n-chat-v1',
      endpoint: 'http://127.0.0.1:5678/webhook/chat-1',
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(lookup).not.toHaveBeenCalled();
  });

  test('fails cloud private and embedded-credential targets closed', async () => {
    await expect(inspectN8NImport({ ...input, webhookUrl: 'https://127.0.0.1/webhook/chat' }, {
      mode: RUNTIME_MODES.PRIVATE_SERVER,
    })).rejects.toMatchObject({ code: 'N8N_EGRESS_DENIED', statusCode: 403 });
    await expect(inspectN8NImport({ ...input, webhookUrl: 'https://user:pass@n8n.example/webhook/chat' }, {
      mode: RUNTIME_MODES.PRIVATE_SERVER,
    })).rejects.toMatchObject({ code: 'N8N_URL_INVALID', statusCode: 400 });
  });

  test('upserts a deterministic workspace-scoped card with fixed executor metadata', async () => {
    const inspected = await inspectN8NImport(input, { mode: RUNTIME_MODES.LOCAL_DESKTOP });
    const query = jest.fn(async (_sql, params) => ({
      rows: [{ id: params[0], metadata: JSON.parse(params[7]), imported_created: true }],
    }));
    const result = await upsertN8NImport({
      db: { query }, workspaceId: 'ws-1', userId: 7, inspected,
    });
    expect(result.created).toBe(true);
    expect(result.card.id).toBe(__test__.importedCardId('ws-1', inspected.endpoint));
    expect(result.card.metadata.executor).toEqual({
      kind: 'n8n_chat', status: 'executable', protocolVersion: 'n8n-chat-v1',
      transport: 'HTTP_JSON', endpoint: inspected.endpoint, sourceDigest: inspected.sourceDigest,
    });
    expect(query.mock.calls[0][0]).toContain("metadata->'import'->>'kind'='n8n_chat'");
  });

  test('isolates deterministic ids by workspace', () => {
    expect(__test__.importedCardId('ws-1', input.webhookUrl))
      .not.toBe(__test__.importedCardId('ws-2', input.webhookUrl));
  });
});
