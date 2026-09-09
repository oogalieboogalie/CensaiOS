import { jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));

const {
  claimAgentWakeup,
  enqueueAgentWakeup,
  getMessageThreadRoot,
  getPairwiseRecentCount,
  getThreadStats,
  requeueInProgressAgentWakeups,
  shouldWakeForMessage,
} = await import('../server/agent-wakeups/store.js');
const { buildWakePrompt } = await import('../server/agent-wakeups/prompt.js');

describe('agent wakeup protocol', () => {
  beforeEach(() => query.mockReset());

  test('wakes direct work and report messages without waking acknowledgements or self-messages', () => {
    expect(shouldWakeForMessage('architect', 'atlas', { messageType: 'agent-to-agent' })).toBe(true);
    expect(shouldWakeForMessage('atlas', 'architect', { messageType: 'agent_report' })).toBe(true);
    expect(shouldWakeForMessage('atlas', 'architect', { messageType: 'agent_ack' })).toBe(false);
    expect(shouldWakeForMessage('atlas', 'atlas', { messageType: 'agent-to-agent' })).toBe(false);
    expect(shouldWakeForMessage('architect', 'atlas', { messageType: 'agent-to-agent', wake: false })).toBe(false);
  });

  test('enqueues idempotently by source message', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'wake-1' }] });
    await expect(enqueueAgentWakeup('message-1', 'atlas', 'architect'))
      .resolves.toEqual({ id: 'wake-1' });
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT(message_id)');
    expect(query.mock.calls[0][1]).toEqual(['message-1', 'atlas', 'architect']);
  });

  test('requeues waiting coordinators only after linked child work is terminal', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await claimAgentWakeup();
    expect(query.mock.calls[0][0]).toContain("aw.status='waiting_children'");
    expect(query.mock.calls[0][0]).toContain("t.status IN ('queued','in_progress','blocked')");
    expect(query.mock.calls[0][0]).toContain('am.workspace_id IS NOT NULL');
    expect(query.mock.calls[0][0]).toContain('am.created_by_user_id IS NOT NULL');
  });

  test('recovers terminal linked runs before requeueing remaining interrupted wakeups', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 3 });

    await expect(requeueInProgressAgentWakeups()).resolves.toEqual({
      completed: 1,
      failed: 2,
      requeued: 3,
    });
    expect(query.mock.calls[0][0]).toContain("r.status='succeeded'");
    expect(query.mock.calls[1][0]).toContain("r.status IN ('failed','cancelled')");
    expect(query.mock.calls[2][0]).toContain("SET status='queued'");
  });

  test('review prompt includes child results and requires critical review', () => {
    const prompt = buildWakePrompt({
      sender_name: 'The Architect',
      sender_id: 'architect',
      message_id: 'message-1',
      message_type: 'agent-to-agent',
      content: 'Build the backend.',
      phase: 'review',
    }, [{ title: 'API work', status: 'completed', result: 'Tests pass.' }]);
    expect(prompt).toContain('Delegated work to review');
    expect(prompt).toContain('Tests pass.');
    expect(prompt).toContain('Review the results critically');
  });

  test('wake prompt carries the thread round and reply_to guidance', () => {
    const prompt = buildWakePrompt({
      sender_name: 'The Architect',
      sender_id: 'architect',
      message_id: 'message-1',
      message_type: 'agent-to-agent',
      content: 'Build the backend.',
    }, [], { round: 3, maxRounds: 8 });
    expect(prompt).toContain('round 3 of 8');
    expect(prompt).toContain('reply_to');
    expect(prompt).not.toContain('null');
  });

  test('report prompt tells agents bare acks never wake anyone', () => {
    const prompt = buildWakePrompt({
      sender_name: 'Atlas',
      sender_id: 'atlas',
      message_id: 'message-2',
      message_type: 'agent_report',
      content: 'Backend is complete.',
    });
    expect(prompt).toContain('never wake');
  });

  test('thread stats count messages, wakes, and recent sender activity in one query', async () => {
    query.mockResolvedValueOnce({
      rows: [{ message_count: 5, wake_count: 3, recent_sender_count: 1 }],
    });
    await expect(getThreadStats('thread-1', { workspaceId: 'workspace-1', senderId: 'atlas' }))
      .resolves.toEqual({
        hasThread: true, messageCount: 5, wakeCount: 3,
        recentSenderCount: 1, pairwiseRecentCount: 0,
      });
    expect(query.mock.calls[0][0]).toContain('agent_wakeups');
    expect(query.mock.calls[0][1]).toEqual(['thread-1', 'workspace-1', 'atlas', 5]);
  });

  test('pairwise velocity counts recent wakeable sends between two agents', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: 4 }] });
    await expect(getPairwiseRecentCount('atlas', 'censai', { workspaceId: 'workspace-1' }))
      .resolves.toBe(4);
    expect(query.mock.calls[0][0]).toContain('agent-to-agent');
  });

  test('thread roots resolve through reply chains and miss cleanly', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'reply-2', thread_id: 'thread-1' }] });
    await expect(getMessageThreadRoot('reply-2', { workspaceId: 'workspace-1' }))
      .resolves.toBe('thread-1');
    query.mockResolvedValueOnce({ rows: [{ id: 'starter-1', thread_id: null }] });
    await expect(getMessageThreadRoot('starter-1', { workspaceId: 'workspace-1' }))
      .resolves.toBe('starter-1');
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getMessageThreadRoot('missing', { workspaceId: 'workspace-1' }))
      .resolves.toBeNull();
  });
});
