import { jest } from '@jest/globals';

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  on: jest.fn(),
  end: jest.fn(),
  ended: false,
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: mockPool,
  createDbPool: () => mockPool,
}));

jest.unstable_mockModule('../server/embeddings.js', () => ({
  embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embeddingsAvailable: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('../server/qdrant.js', () => ({
  upsertVector: jest.fn().mockResolvedValue(true),
  searchVectors: jest.fn().mockResolvedValue([]),
}));

const {
  sendAgentMessage,
  getAgentMessages,
  markMessageRead,
} = await import('../server/memory/core.js');

describe('Agent Messaging System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('stores an agent-to-agent message through the memory layer', async () => {
    // First call checks for existing message (none found), second inserts new
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })  // idempotency check returns empty
      .mockResolvedValueOnce({ rows: [{ id: 'message-1' }] });  // insert returns new id

    const id = await sendAgentMessage('test-sender-agent', 'test-receiver-agent', 'hello', {
      priority: 'high',
      subject: 'Check in',
      messageType: 'coordination',
      importanceScore: 0.9,
      idempotencyKey: 'test-key-123',
      workspaceId: 'workspace-1',
      userId: 7,
    });

    expect(id).toBe('message-1');
    // First query should check for existing
    expect(mockPool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id FROM agent_messages'),
      ['test-key-123', 'test-sender-agent', 'workspace-1']
    );
    // Second query should insert
    expect(mockPool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO agent_messages'),
      expect.arrayContaining([
        'test-sender-agent',
        'test-receiver-agent',
        'hello',
      ])
    );
  });

  test('prevents duplicate messages with same idempotency key', async () => {
    // Idempotency check finds existing message
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-message-id' }] });

    const id = await sendAgentMessage('test-sender-agent', 'test-receiver-agent', 'hello', {
      idempotencyKey: 'duplicate-key-456',
      workspaceId: 'workspace-1',
      userId: 7,
    });

    // Should return existing ID instead of creating new message
    expect(id).toBe('existing-message-id');
    expect(mockPool.query).toHaveBeenCalledTimes(1);  // Only check, no insert
  });

  test('reads unread messages for an agent', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'message-1', from_agent: 'atlas', to_agent: 'censai', content: 'ping' }],
    });

    const messages = await getAgentMessages('censai', true, { workspaceId: 'workspace-1' });

    expect(messages).toHaveLength(1);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('am.read_at IS NULL'),
      ['censai', 'workspace-1', expect.arrayContaining(['atlas', 'censai'])],
    );
    expect(mockPool.query.mock.calls[0][0]).toContain('am.from_agent = ANY($3)');
  });

  test('retains unrestricted internal coordination reads for non-family agents', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await getAgentMessages('custom-agent', false, { workspaceId: 'workspace-1' });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.not.stringContaining('am.from_agent = ANY($3)'),
      ['custom-agent', 'workspace-1'],
    );
  });

  test('marks a message as read', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'message-1' }] });

    await markMessageRead('message-1', { workspaceId: 'workspace-1' });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id = $2'),
      ['message-1', 'workspace-1'],
    );
  });

  test('refuses to create an unowned family message', async () => {
    await expect(sendAgentMessage('atlas', 'censai', 'unscoped'))
      .rejects.toMatchObject({ code: 'AUTONOMY_OWNERSHIP_REQUIRED' });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test('stores bare acknowledgements without waking and without extra queries', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'ack-1' }] });

    const result = await sendAgentMessage('atlas', 'censai', 'ok thanks!', {
      messageType: 'agent-to-agent',
      idempotencyKey: 'ack-key',
      workspaceId: 'workspace-1',
      userId: 7,
      verbose: true,
    });

    expect(result).toEqual({
      id: 'ack-1', woke: false, wakeSuppressed: 'ack',
      threadKey: 'ack-1', wakeCount: 0,
    });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  test('suppresses the wake when a thread hits its round cap', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'capped-1' }] })
      .mockResolvedValueOnce({ rows: [{ message_count: 9, wake_count: 8, recent_sender_count: 1 }] });

    const result = await sendAgentMessage('atlas', 'censai', 'One more substantive update on the plan.', {
      messageType: 'agent-to-agent',
      threadId: 'thread-1',
      idempotencyKey: 'cap-key',
      workspaceId: 'workspace-1',
      userId: 7,
      verbose: true,
    });

    expect(result).toEqual({
      id: 'capped-1', woke: false, wakeSuppressed: 'thread_cap',
      threadKey: 'thread-1', wakeCount: 8,
    });
    // Idempotency check + insert + thread stats; no wakeup enqueue.
    expect(mockPool.query).toHaveBeenCalledTimes(3);
    expect(mockPool.query.mock.calls[2][0]).toContain('agent_wakeups');
  });

  test('wakes the first substantive reply inside a thread', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'reply-1' }] })
      .mockResolvedValueOnce({ rows: [{ message_count: 2, wake_count: 1, recent_sender_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'wake-9' }] });

    const result = await sendAgentMessage('censai', 'atlas', 'Reviewed — two blocking issues listed inside.', {
      messageType: 'agent-to-agent',
      threadId: 'thread-1',
      idempotencyKey: 'reply-key',
      workspaceId: 'workspace-1',
      userId: 7,
      verbose: true,
    });

    expect(result).toEqual({
      id: 'reply-1', woke: true, wakeSuppressed: null,
      threadKey: 'thread-1', wakeCount: 1,
    });
    expect(mockPool.query).toHaveBeenCalledTimes(4);
    expect(mockPool.query.mock.calls[3][0]).toContain('INTO agent_wakeups');
  });
});
