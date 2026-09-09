import { jest } from '@jest/globals';
import { createA2AImportClient } from '../src/lib/agentRegistry/importClient.js';

describe('external agent import client', () => {
  test('sends workspace-scoped same-origin requests', async () => {
    const fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ imported: true }),
    }));
    const client = createA2AImportClient({ fetch, workspaceId: 'ws-1' });
    await expect(client.importA2A('https://agent.example/card'))
      .resolves.toEqual({ imported: true });
    expect(fetch).toHaveBeenCalledWith('/api/agent-registry/imports/a2a', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'ws-1', cardUrl: 'https://agent.example/card' }),
    });
  });

  test('sends only the fixed n8n import fields to its dedicated route', async () => {
    const fetch = jest.fn(async () => ({
      ok: true, json: async () => ({ imported: true, protocolVersion: 'n8n-chat-v1' }),
    }));
    const client = createA2AImportClient({ fetch, workspaceId: 'ws-1' });
    const input = {
      webhookUrl: 'https://n8n.example/webhook/chat',
      name: 'Research workflow',
      description: 'Researches a topic.',
      metadata: { executor: { kind: 'forged' } },
    };
    await expect(client.importN8NChat(input)).resolves.toEqual({
      imported: true, protocolVersion: 'n8n-chat-v1',
    });
    expect(fetch).toHaveBeenCalledWith('/api/agent-registry/imports/n8n-chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws-1', webhookUrl: input.webhookUrl,
        name: input.name, description: input.description,
      }),
    });
  });

  test('requires workspace scope and preserves server error text', async () => {
    const unscoped = createA2AImportClient({ fetch: jest.fn(), workspaceId: '' });
    await expect(unscoped.importA2A('https://agent.example/card'))
      .rejects.toThrow('Open a workspace');
    await expect(unscoped.importN8NChat({}))
      .rejects.toThrow('Open a workspace');
    const denied = createA2AImportClient({
      workspaceId: 'ws-1',
      fetch: async () => ({
        ok: false, status: 403, json: async () => ({ error: 'Workspace access denied' }),
      }),
    });
    await expect(denied.importA2A('https://agent.example/card'))
      .rejects.toThrow('Workspace access denied');
  });
});
