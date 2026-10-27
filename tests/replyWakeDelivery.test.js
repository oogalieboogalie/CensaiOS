import { jest } from '@jest/globals';

const getAgent = jest.fn();
const buildSystemPrompt = jest.fn();
const markMessageRead = jest.fn();
const sendAgentMessage = jest.fn();
const logConversation = jest.fn();
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
  logConversation,
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
const { buildWakePrompt } = await import('../server/agent-wakeups/prompt.js');

// Atlas is answering the message Censai already sent. Censai is the original
// sender and the one this wake is for. Nobody types "check your messages".
const replyWake = {
  id: 'wake-reply',
  message_id: 'reply-1',
  agent_id: 'censai',
  sender_id: 'atlas',
  sender_name: 'Atlas',
  message_type: 'agent_report',
  thread_id: 'thread-1',
  content: 'The plan has two blocking issues. Details are in the notes.',
  subject: 'From Censai: review the plan',
  phase: 'initial',
  workspace_id: 'workspace-1',
  created_by_user_id: 7,
};

function deliveredText() {
  return logConversation.mock.calls.map((call) => String(call[2] || '')).join('\n');
}

describe('a reply reaches the sender without a user check-messages turn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadWakeupContext.mockResolvedValue({ ...replyWake });
    getAgent.mockResolvedValue({ id: 'censai', name: 'Censai' });
    buildSystemPrompt.mockResolvedValue('Censai system prompt');
    getWakeupTasks.mockResolvedValue([]);
    runWakeModel.mockResolvedValue({
      text: 'Got Atlas\'s notes. I will fold the two blockers into the plan.',
      toolCalls: [],
    });
    beginWakeupRun.mockResolvedValue('run-reply');
    completeWakeupRun.mockResolvedValue();
    failWakeupRun.mockResolvedValue();
    recordWakeupPhase.mockResolvedValue();
    logConversation.mockResolvedValue();
  });

  test('the wake delivers the reply and the sender\'s acceptance', async () => {
    await runAgentWakeup({ id: 'wake-reply' });

    const delivered = deliveredText();
    expect(delivered).toContain('The plan has two blocking issues');
    expect(delivered).toContain('two blockers into the plan');
    expect(delivered).not.toMatch(/check your messages/i);
    expect(logConversation.mock.calls.every((call) => call[0] === 'censai')).toBe(true);
    // Accepting a report must not mail another wake back.
    expect(sendAgentMessage).not.toHaveBeenCalled();
    expect(markMessageRead).toHaveBeenCalledWith('reply-1', {
      workspaceId: 'workspace-1', userId: 7,
    });
  });

  test('the wake prompt tells the sender to take the reply in', () => {
    const prompt = buildWakePrompt(replyWake, [], { round: 2, maxRounds: 8 });
    expect(prompt).toMatch(/take it in/i);
    expect(prompt).not.toMatch(/check your messages/i);
    expect(prompt).not.toMatch(/finish silently/i);
    expect(prompt).toContain('The plan has two blocking issues');
  });
});
