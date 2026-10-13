import { jest } from '@jest/globals';

const getAgent = jest.fn();
const buildSystemPrompt = jest.fn();
const markMessageRead = jest.fn();
const sendAgentMessage = jest.fn();
const loadWakeupContext = jest.fn();
const getWakeupTasks = jest.fn();
const getThreadStats = jest.fn();
const updateWakeup = jest.fn();
const runWakeModel = jest.fn();
const beginWakeupRun = jest.fn();
const completeWakeupRun = jest.fn();
const failWakeupRun = jest.fn();
const recordWakeupPhase = jest.fn();

jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent,
  buildSystemPrompt,
  markMessageRead,
  sendAgentMessage,
}));
jest.unstable_mockModule('../server/agent-wakeups/store.js', () => ({
  loadWakeupContext,
  getWakeupTasks,
  getThreadStats,
  updateWakeup,
}));
jest.unstable_mockModule('../server/agent-wakeups/modelLoop.js', () => ({
  runWakeModel,
}));
jest.unstable_mockModule('../server/agent-wakeups/runLifecycle.js', () => ({
  beginWakeupRun,
  completeWakeupRun,
  failWakeupRun,
  recordWakeupPhase,
}));

const { runAgentWakeup } = await import('../server/agent-wakeups/execution.js');

const baseWake = {
  id: 'wake-1',
  message_id: 'message-1',
  agent_id: 'atlas',
  sender_id: 'architect',
  sender_name: 'The Architect',
  message_type: 'agent-to-agent',
  content: 'Implement the backend.',
  subject: 'Backend',
  phase: 'initial',
  workspace_id: 'workspace-1',
  created_by_user_id: 7,
};

describe('agent wake execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadWakeupContext.mockResolvedValue({ ...baseWake });
    getAgent.mockResolvedValue({ id: 'atlas', name: 'Atlas' });
    buildSystemPrompt.mockResolvedValue('Atlas system prompt');
    runWakeModel.mockResolvedValue({ text: 'I delegated the work.', toolCalls: ['dispatch_squad'] });
    beginWakeupRun.mockResolvedValue('run-1');
    completeWakeupRun.mockResolvedValue();
    failWakeupRun.mockResolvedValue();
    recordWakeupPhase.mockResolvedValue();
  });

  test('acknowledges once and waits when child tasks are active', async () => {
    getWakeupTasks
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'task-1', status: 'in_progress' }]);

    await runAgentWakeup({ id: 'wake-1' });

    expect(buildSystemPrompt).toHaveBeenCalledWith('atlas', 'Implement the backend.', {
      workspaceId: 'workspace-1', userId: 7,
    });

    expect(runWakeModel).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1', userId: 7, messageId: 'message-1', wakeId: 'wake-1',
    }));

    expect(sendAgentMessage).toHaveBeenCalledWith(
      'atlas', 'architect', expect.stringContaining('acknowledged'),
      expect.objectContaining({ messageType: 'agent_ack', wake: false })
    );
    expect(updateWakeup).toHaveBeenCalledWith('wake-1',
      expect.objectContaining({ status: 'waiting_children', phase: 'review' }));
    expect(recordWakeupPhase).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1', name: 'agent_wakeup.delegate',
    }));
    expect(completeWakeupRun).not.toHaveBeenCalled();
  });

  test('reviews terminal work and wakes the sender with a final report', async () => {
    loadWakeupContext.mockResolvedValue({ ...baseWake, phase: 'review' });
    getWakeupTasks.mockResolvedValue([
      { id: 'task-1', title: 'API work', status: 'completed', result: 'Green.' },
    ]);
    runWakeModel.mockResolvedValue({ text: 'Backend is verified and green.', toolCalls: [] });

    await runAgentWakeup({ id: 'wake-1' });

    expect(sendAgentMessage).toHaveBeenCalledWith(
      'atlas', 'architect', 'Backend is verified and green.',
      expect.objectContaining({ messageType: 'agent_report', wake: true })
    );
    expect(updateWakeup).toHaveBeenCalledWith('wake-1',
      expect.objectContaining({ status: 'completed' }));
    expect(completeWakeupRun).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }));
  });

  test('does not create acknowledgement loops for informational reports', async () => {
    loadWakeupContext.mockResolvedValue({
      ...baseWake,
      message_type: 'agent_report',
      content: 'Backend is complete.',
    });
    getWakeupTasks.mockResolvedValue([]);
    runWakeModel.mockResolvedValue({ text: 'No further action needed.', toolCalls: [] });

    await runAgentWakeup({ id: 'wake-1' });

    expect(sendAgentMessage).not.toHaveBeenCalled();
    expect(updateWakeup).toHaveBeenCalledWith('wake-1',
      expect.objectContaining({ status: 'completed' }));
  });

  test('keeps wake and run failure aligned', async () => {
    getWakeupTasks.mockResolvedValue([]);
    runWakeModel.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(runAgentWakeup({ id: 'wake-1' })).rejects.toThrow('provider unavailable');

    expect(failWakeupRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1', error: expect.any(Error),
    }));
    expect(updateWakeup).toHaveBeenCalledWith('wake-1', {
      status: 'failed', error: 'provider unavailable',
    });
  });

  test('stores bare-acknowledgement outcomes without waking the sender', async () => {
    getWakeupTasks.mockResolvedValue([]);
    runWakeModel.mockResolvedValue({ text: 'Done, thanks!', toolCalls: [] });

    await runAgentWakeup({ id: 'wake-1' });

    expect(sendAgentMessage).toHaveBeenCalledWith(
      'atlas', 'architect', 'Done, thanks!',
      expect.objectContaining({ messageType: 'agent_report', wake: false })
    );
    expect(updateWakeup).toHaveBeenCalledWith('wake-1',
      expect.objectContaining({ status: 'completed' }));
  });
});
