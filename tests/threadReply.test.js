import { jest } from '@jest/globals';

const sendAgentMessage = jest.fn();
const getAgentMessages = jest.fn().mockResolvedValue([]);
const markMessageRead = jest.fn().mockResolvedValue(true);
const getMessageThreadRoot = jest.fn();

jest.unstable_mockModule('../server/memory.js', () => ({
  storeMemory: jest.fn(),
  writeJournal: jest.fn(),
  addTriple: jest.fn(),
  addNugget: jest.fn(),
  addAssociation: jest.fn(),
  updateConsciousness: jest.fn(),
  sendAgentMessage,
  recallMemories: jest.fn(),
  readJournals: jest.fn(),
  queryGraph: jest.fn(),
  getAgentMessages,
  markMessageRead,
  getAssociations: jest.fn(),
}));
jest.unstable_mockModule('../server/agent-wakeups/store.js', () => ({
  getMessageThreadRoot,
}));

const { handleMemoryTool } = await import('../server/tools/handlers/memory.js');

const ctx = { workspaceId: 'workspace-1', userId: 7 };

describe('reply_to thread hook', () => {
  beforeEach(() => jest.clearAllMocks());

  test('resolves any message in the thread and reports the round', async () => {
    getMessageThreadRoot.mockResolvedValue('thread-1');
    sendAgentMessage.mockResolvedValue({
      id: 'reply-9', woke: true, wakeSuppressed: null,
      threadKey: 'thread-1', wakeCount: 2,
    });

    const result = await handleMemoryTool('censai', 'reply_to', {
      thread_id: 'some-message-in-thread', agent: 'atlas', content: 'Reviewed — two blockers inside.',
    }, ctx);

    expect(getMessageThreadRoot).toHaveBeenCalledWith('some-message-in-thread', { workspaceId: 'workspace-1' });
    expect(sendAgentMessage).toHaveBeenCalledWith(
      'censai', 'atlas', 'Reviewed — two blockers inside.',
      expect.objectContaining({ messageType: 'agent-to-agent', threadId: 'thread-1', verbose: true }),
    );
    expect(result).toContain('round 3 of 8');
  });

  test('rejects unknown threads without sending', async () => {
    getMessageThreadRoot.mockResolvedValue(null);

    await expect(handleMemoryTool('censai', 'reply_to', {
      thread_id: 'missing', agent: 'atlas', content: 'hello?',
    }, ctx)).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND', statusCode: 404 });
    expect(sendAgentMessage).not.toHaveBeenCalled();
  });

  test('tells the agent when a reply is stored without waking', async () => {
    getMessageThreadRoot.mockResolvedValue('thread-1');
    sendAgentMessage.mockResolvedValue({
      id: 'ack-2', woke: false, wakeSuppressed: 'ack',
      threadKey: 'thread-1', wakeCount: 4,
    });

    const result = await handleMemoryTool('atlas', 'reply_to', {
      thread_id: 'thread-1', agent: 'censai', content: 'done, thanks!',
    }, ctx);

    expect(result).toContain('will NOT be woken');
  });

  test('message_to teaches the thread id for follow-up replies', async () => {
    sendAgentMessage.mockResolvedValue({
      id: 'msg-7', woke: true, wakeSuppressed: null,
      threadKey: 'msg-7', wakeCount: 0,
    });

    const result = await handleMemoryTool('atlas', 'message_to', {
      agent: 'censai', content: 'Please review the migration plan.',
    }, ctx);

    expect(result).toContain('thread msg-7');
    expect(result).toContain('reply_to');
  });

  test('read_messages exposes reply tokens for every message', async () => {
    getAgentMessages.mockResolvedValue([{
      id: 'm-1', thread_id: null, from_agent: 'atlas', from_name: 'Atlas',
      priority: 'high', subject: null, content: 'ping',
    }]);

    const result = await handleMemoryTool('censai', 'read_messages', {}, ctx);

    expect(result).toContain('[msg:m-1 thread:m-1');
    expect(result).toContain('reply_to');
  });
});
