import { jest } from '@jest/globals';

const createRun = jest.fn();
jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({ createRun }));

const {
  createAgentCardRun,
  claimNextAgentCardRun,
  recoverInProgressAgentCardRuns,
} = await import('../server/agent-card-runs/store.js');

const a2aCard = {
  id: 'ext:a2a:0123456789abcdef0123456789abcdef', owner_id: '7', workspace_id: 'ws-1',
  version: '1.0.0', endpoint: 'https://agent.example/a2a', auth: { type: 'none' },
  metadata: {
    import: { kind: 'a2a', sourceDigest: 'digest-1' },
    executor: {
      kind: 'a2a', status: 'executable', protocolVersion: '0.3.0', transport: 'JSONRPC',
      endpoint: 'https://agent.example/a2a', sourceDigest: 'digest-1', sourceCard: { name: 'Remote' },
    },
  },
};

describe('AgentCard durable run store', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a causal background run for a built-in card', async () => {
    createRun.mockResolvedValueOnce({ runId: 'run-1' });
    const result = await createAgentCardRun({
      db: { query: jest.fn() },
      card: { id: 'agent:atlas', owner_id: null },
      callerId: '7',
      payload: { message: 'Inspect the API.' },
      options: { workspaceId: 'ws-1' },
      clientTaskId: 'client-1',
    });

    expect(result).toEqual({ runId: 'run-1', taskId: 'client-1', status: 'queued' });
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'agent:atlas',
      principal: 'user:7',
      runtimeMode: 'background',
      workspaceId: 'ws-1',
      metadata: expect.objectContaining({
        kind: 'agent_card_call', cardId: 'agent:atlas', agentId: 'atlas', callerId: '7',
      }),
      cause: expect.objectContaining({ kind: 'user_dispatch', userDispatchRef: 'agent-registry:client-1' }),
    }));
  });

  test('accepts a typed schedule cause without weakening run identity', async () => {
    createRun.mockResolvedValueOnce({ runId: 'run-scheduled' });
    await createAgentCardRun({
      card: { id: 'agent:censai', owner_id: null },
      callerId: 'system:scheduler',
      payload: { prompt: 'Run the scheduled review.' },
      principal: 'system:scheduler',
      cause: { kind: 'schedule', scheduleId: 'schedule-1' },
      runMetadata: { scheduleId: 'schedule-1', userId: null, kind: 'spoofed' },
    });

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'agent:censai',
      principal: 'system:scheduler',
      metadata: expect.objectContaining({
        kind: 'agent_card_call', agentId: 'censai', scheduleId: 'schedule-1', userId: null,
      }),
      cause: { kind: 'schedule', scheduleId: 'schedule-1' },
    }));
  });

  test('queues an imported A2A card with a frozen executor fingerprint', async () => {
    createRun.mockResolvedValueOnce({ runId: 'run-a2a' });
    await createAgentCardRun({
      card: a2aCard, callerId: '7', payload: { prompt: 'Ask remote.' },
      options: { workspaceId: 'ws-1' }, clientTaskId: 'external-1',
    });
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      actor: `agent-card:${a2aCard.id}`,
      metadata: expect.objectContaining({
        executorKind: 'a2a', agentId: null,
        executorFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
  });

  test('claims pending runs atomically with a transaction and skip-locked query', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'running' }] })
      .mockResolvedValueOnce({});
    const client = { query, release: jest.fn() };
    const run = await claimNextAgentCardRun({ connect: jest.fn().mockResolvedValue(client) });
    expect(run).toEqual({ id: 'run-1', status: 'running' });
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[2][0]).toContain("status='running'");
    expect(client.release).toHaveBeenCalled();
  });

  test('fails uncertain external calls on restart and requeues only safe work', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000001' }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({});
    const client = { query, release: jest.fn() };
    const receipt = await recoverInProgressAgentCardRuns({
      connect: jest.fn().mockResolvedValue(client),
    });
    expect(receipt).toEqual({ requeued: 2, externalFailed: 1 });
    expect(query.mock.calls[1][0]).toContain("<> 'builtin'");
    expect(query.mock.calls[3][0]).toContain("= 'builtin'");
    expect(query.mock.calls[4][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
