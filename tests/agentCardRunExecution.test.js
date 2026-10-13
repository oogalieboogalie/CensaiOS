import { jest } from '@jest/globals';

const getAgent = jest.fn();
const logConversation = jest.fn();
const getAgentCard = jest.fn();
const prepareChatContext = jest.fn();
const runChatLoop = jest.fn();
const completeRun = jest.fn();
const failRun = jest.fn();
const recordRunAction = jest.fn();
const publishAgentCardEvent = jest.fn();

jest.unstable_mockModule('../server/memory.js', () => ({ getAgent, logConversation }));
jest.unstable_mockModule('../server/agent-registry/factories.js', () => ({ getAgentCard }));
jest.unstable_mockModule('../server/routes/chat/chatContext.js', () => ({ prepareChatContext }));
jest.unstable_mockModule('../server/routes/chat/chatExecution.js', () => ({ runChatLoop }));
jest.unstable_mockModule('../server/routes/chat/shared.js', () => ({
  publicTimings: (value) => value,
  publicToolActions: (value) => value,
}));
jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({ completeRun, failRun, recordRunAction }));
jest.unstable_mockModule('../server/agent-card-runs/events.js', () => ({ publishAgentCardEvent }));

const { executeAgentCardRun } = await import('../server/agent-card-runs/execution.js');
const { agentCardExecutorFingerprint } = await import('../server/agent-card-runs/contract.js');

const run = {
  id: 'run-1',
  metadata: {
    cardId: 'agent:atlas', agentId: 'atlas', callerId: '7', clientTaskId: 'client-1',
    prompt: 'Inspect the API.', workspaceId: 'ws-1',
  },
};

describe('real AgentCard execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAgentCard.mockResolvedValue({ id: 'agent:atlas', owner_id: null });
    getAgent.mockResolvedValue({ id: 'atlas', name: 'Atlas' });
    prepareChatContext.mockResolvedValue({
      reqModel: 'model', reqBaseUrl: 'http://model', reqApiKey: 'key', reqProvider: 'test',
      chatMessages: [{ role: 'system', content: 'Atlas' }], toolsForCaller: [],
    });
    logConversation.mockResolvedValue();
    recordRunAction.mockResolvedValue();
    completeRun.mockResolvedValue();
    failRun.mockResolvedValue();
  });

  test('runs the extracted core chat/tool loop and persists its observed result', async () => {
    runChatLoop.mockImplementationOnce(async ({ sendEvent }) => {
      sendEvent({ type: 'status', status: 'calling_tool', detail: { tool: 'project_read', args: { path: 'secret' } } });
      return { finalText: 'Actual model result', toolActions: [{ tool: 'project_read', ok: true }] };
    });
    const outcome = await executeAgentCardRun(run);
    expect(outcome).toEqual({ status: 'succeeded', result: 'Actual model result' });
    expect(runChatLoop).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'atlas', userId: '7' }));
    expect(logConversation).toHaveBeenCalledWith('atlas', 'user', 'Inspect the API.', {
      workspaceId: 'ws-1', userId: '7',
    });
    expect(recordRunAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'agent_card.calling_tool' }));
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1', metadata: expect.objectContaining({ result: 'Actual model result' }),
    }));
    expect(publishAgentCardEvent).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1' }),
      expect.objectContaining({ type: 'call.complete', result: 'Actual model result' })
    );
  });

  test('persists model failures and never converts them to completion', async () => {
    runChatLoop.mockRejectedValueOnce(new Error('provider unavailable'));
    const outcome = await executeAgentCardRun(run);
    expect(outcome).toEqual({ status: 'failed', error: 'provider unavailable' });
    expect(failRun).toHaveBeenCalledWith({ runId: 'run-1', error: expect.any(Error) });
    expect(completeRun).not.toHaveBeenCalled();
    expect(publishAgentCardEvent).toHaveBeenCalledWith(
      expect.any(Object), expect.objectContaining({ type: 'call.failed', error: 'provider unavailable' })
    );
  });

  test('keeps a system caller out of integer user-id lookups', async () => {
    runChatLoop.mockResolvedValueOnce({ finalText: 'Scheduled result', toolActions: [] });
    const scheduledRun = {
      ...run,
      metadata: {
        ...run.metadata,
        callerId: 'system:scheduler',
        userId: null,
      },
    };

    await executeAgentCardRun(scheduledRun);

    expect(prepareChatContext).toHaveBeenCalledWith(
      'atlas', null, expect.any(Array), null, null, 'ws-1'
    );
    expect(runChatLoop).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  test('fails an imported card changed after queueing before any external request', async () => {
    const card = {
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
    getAgentCard.mockResolvedValueOnce({ ...card, version: '1.0.1' });
    const outcome = await executeAgentCardRun({
      id: 'run-external',
      metadata: {
        cardId: card.id, prompt: 'Never send', workspaceId: 'ws-1',
        executorFingerprint: agentCardExecutorFingerprint(card),
      },
    });
    expect(outcome).toEqual({ status: 'failed', error: 'AgentCard executor changed after queueing.' });
    expect(failRun).toHaveBeenCalledWith({ runId: 'run-external', error: expect.any(Error) });
    expect(completeRun).not.toHaveBeenCalled();
  });

  test('applies executor-drift protection to n8n cards before dispatch', async () => {
    const card = {
      id: 'ext:n8n:0123456789abcdef0123456789abcdef', owner_id: '7', workspace_id: 'ws-1',
      version: '1.0.0', endpoint: 'https://n8n.example/webhook/chat', auth: { type: 'none' },
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
    getAgentCard.mockResolvedValueOnce({ ...card, version: '1.0.1' });
    const outcome = await executeAgentCardRun({
      id: 'run-n8n-drift',
      metadata: {
        cardId: card.id, prompt: 'Never send', workspaceId: 'ws-1',
        executorFingerprint: agentCardExecutorFingerprint(card),
      },
    });
    expect(outcome).toEqual({ status: 'failed', error: 'AgentCard executor changed after queueing.' });
    expect(failRun).toHaveBeenCalledWith({ runId: 'run-n8n-drift', error: expect.any(Error) });
    expect(completeRun).not.toHaveBeenCalled();
  });
});
