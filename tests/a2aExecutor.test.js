import { jest } from '@jest/globals';

const completeRun = jest.fn();
const failRun = jest.fn();
const recordRunAction = jest.fn();
const publishAgentCardEvent = jest.fn();

jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({ completeRun, failRun, recordRunAction }));
jest.unstable_mockModule('../server/agent-card-runs/events.js', () => ({ publishAgentCardEvent }));

const { executeA2AAgentCardRun, extractA2AText } = await import(
  '../server/agent-card-runs/executors/a2a.js'
);

const run = {
  id: 'run-a2a-1',
  metadata: { prompt: 'Hello remote agent', cardId: 'ext:a2a:1', workspaceId: 'ws-1' },
};
const executor = { protocolVersion: '0.3.0', sourceCard: { name: 'Remote' } };

describe('A2A durable executor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    completeRun.mockResolvedValue();
    failRun.mockResolvedValue();
    recordRunAction.mockResolvedValue();
  });

  test('sends a blocking text message and persists the observed response', async () => {
    const client = { sendMessage: jest.fn(async () => ({
      kind: 'message', role: 'agent', messageId: 'reply-1',
      parts: [{ kind: 'text', text: 'Remote result' }],
    })) };
    const outcome = await executeA2AAgentCardRun(run, executor, { client });
    expect(outcome).toEqual({ status: 'succeeded', result: 'Remote result' });
    expect(client.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({
        role: 'user', parts: [{ kind: 'text', text: 'Hello remote agent' }],
      }),
      configuration: expect.objectContaining({ blocking: true }),
    }));
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-a2a-1', metadata: expect.objectContaining({ result: 'Remote result' }),
    }));
    expect(failRun).not.toHaveBeenCalled();
  });

  test('fails nonterminal tasks instead of fabricating a result', async () => {
    const client = { sendMessage: jest.fn(async () => ({
      kind: 'task', id: 'task-1', status: { state: 'working' },
    })) };
    await expect(executeA2AAgentCardRun(run, executor, { client }))
      .resolves.toEqual(expect.objectContaining({ status: 'failed' }));
    expect(failRun).toHaveBeenCalledWith({ runId: 'run-a2a-1', error: expect.any(Error) });
    expect(completeRun).not.toHaveBeenCalled();
  });

  test('extracts completed task artifacts and rejects empty output', () => {
    expect(extractA2AText({
      kind: 'task', status: { state: 'completed' },
      artifacts: [{ parts: [{ kind: 'text', text: 'Artifact result' }] }],
    })).toBe('Artifact result');
    expect(() => extractA2AText({ kind: 'message', parts: [] })).toThrow('did not contain text');
  });
});
