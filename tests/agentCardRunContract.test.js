import {
  actorId,
  canInvokeCard,
  agentCardExecutorFingerprint,
  normalizeCallRequest,
  resolveAgentCardExecutor,
  resolveBuiltInAgentId,
  safeRuntimeEvent,
} from '../server/agent-card-runs/contract.js';

describe('AgentCard run contract', () => {
  const a2aCard = {
    id: 'ext:a2a:0123456789abcdef0123456789abcdef',
    owner_id: '7',
    workspace_id: 'ws-1',
    version: '1.2.3',
    endpoint: 'https://agent.example/a2a',
    auth: { type: 'none' },
    metadata: {
      import: { kind: 'a2a', sourceDigest: 'digest-1' },
      executor: {
        kind: 'a2a', status: 'executable', protocolVersion: '0.3.0', transport: 'JSONRPC',
        endpoint: 'https://agent.example/a2a', sourceDigest: 'digest-1', sourceCard: { name: 'Remote' },
      },
    },
  };
  const n8nCard = {
    id: 'ext:n8n:0123456789abcdef0123456789abcdef',
    owner_id: '7',
    workspace_id: 'ws-1',
    version: '1.0.0',
    endpoint: 'https://n8n.example/webhook/chat',
    auth: { type: 'none' },
    metadata: {
      import: {
        kind: 'n8n_chat', webhookUrl: 'https://n8n.example/webhook/chat', sourceDigest: 'digest-2',
      },
      executor: {
        kind: 'n8n_chat', status: 'executable', protocolVersion: 'n8n-chat-v1',
        transport: 'HTTP_JSON', endpoint: 'https://n8n.example/webhook/chat', sourceDigest: 'digest-2',
      },
    },
  };

  test('normalizes both REST and WebSocket actor shapes', () => {
    expect(actorId({ id: 7 })).toBe('7');
    expect(actorId({ userId: '8' })).toBe('8');
  });

  test('enforces private ownership with normalized actor ids', () => {
    const card = { visibility: 'private', owner_id: '7', workspace_id: 'ws-1' };
    expect(canInvokeCard(card, { userId: 7, workspaceIds: ['ws-1'] })).toBe(true);
    expect(canInvokeCard(card, { id: '7', workspaceIds: ['ws-2'] })).toBe(false);
    expect(canInvokeCard({ ...card, workspace_id: null }, { id: '7', workspaceIds: ['ws-1'] })).toBe(false);
  });

  test('maps only ownerless built-in cards to core agents', () => {
    expect(resolveBuiltInAgentId({ id: 'agent:atlas', owner_id: null })).toBe('atlas');
    expect(() => resolveBuiltInAgentId({ id: 'ext:7:atlas', owner_id: '7' }))
      .toThrow('no supported executable adapter');
    expect(() => resolveBuiltInAgentId({ id: 'agent:spoof', owner_id: '7' }))
      .toThrow('no supported executable adapter');
  });

  test('accepts only server-imported A2A v0.3 executors and fingerprints their contract', () => {
    expect(resolveAgentCardExecutor(a2aCard)).toEqual(expect.objectContaining({
      kind: 'a2a', protocolVersion: '0.3.0', endpoint: 'https://agent.example/a2a',
    }));
    expect(agentCardExecutorFingerprint(a2aCard)).toMatch(/^[a-f0-9]{64}$/);
    expect(agentCardExecutorFingerprint({ ...a2aCard, version: '1.2.4' }))
      .not.toBe(agentCardExecutorFingerprint(a2aCard));
    expect(() => resolveAgentCardExecutor({
      ...a2aCard,
      metadata: { ...a2aCard.metadata, import: undefined },
    })).toThrow('no supported executable adapter');
  });

  test('accepts only server-imported fixed-schema n8n executors', () => {
    expect(resolveAgentCardExecutor(n8nCard)).toEqual({
      kind: 'n8n_chat', protocolVersion: 'n8n-chat-v1',
      endpoint: 'https://n8n.example/webhook/chat', sourceDigest: 'digest-2',
    });
    expect(agentCardExecutorFingerprint(n8nCard)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => resolveAgentCardExecutor({
      ...n8nCard, auth: { type: 'bearer' },
    })).toThrow('no supported executable adapter');
    expect(() => resolveAgentCardExecutor({
      ...n8nCard,
      metadata: {
        ...n8nCard.metadata,
        executor: { ...n8nCard.metadata.executor, transport: 'CUSTOM' },
      },
    })).toThrow('no supported executable adapter');
  });

  test('normalizes supported prompt shapes and rejects empty input', () => {
    expect(normalizeCallRequest({ msg: '  hello  ' }, { workspaceId: 'ws-1' }))
      .toEqual({ prompt: 'hello', workspaceId: 'ws-1' });
    expect(() => normalizeCallRequest({}, {})).toThrow('requires a prompt');
  });

  test('removes raw tool arguments from persisted and streamed events', () => {
    const safe = safeRuntimeEvent({
      type: 'status',
      status: 'calling_tool',
      detail: { tool: 'remember', args: { content: 'private' }, summary: { target: 'memory' } },
    });
    expect(safe.detail.tool).toBe('remember');
    expect(safe.detail).not.toHaveProperty('args');
  });
});
