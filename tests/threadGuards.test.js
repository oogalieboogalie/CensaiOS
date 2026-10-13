import {
  MAX_THREAD_WAKES,
  THREAD_COOLDOWN_SENDER_LIMIT,
  PAIRWISE_VELOCITY_LIMIT,
  decideThreadWake,
  isAckMessage,
} from '../server/agent-wakeups/threadGuards.js';

describe('thread ack classifier', () => {
  test.each([
    'done',
    'Done.',
    'ok',
    'OK thanks!',
    'got it',
    'noted',
    'acknowledged',
    'will do',
    'on it',
    'thanks!',
    'thank you',
    'sounds good',
    '+1',
    '👍',
    'shipped',
    '',
    '   ',
  ])('treats "%s" as a bare acknowledgement', (content) => {
    expect(isAckMessage(content)).toBe(true);
  });

  test.each([
    'Backend is verified and green, all 42 tests pass.',
    'I delegated the work to two sub-agents.',
    'Done with the migration, but the index build failed on large tables.',
    'Fixed the auth bug by rotating the session secret.',
    'ok so the plan is to split this into three phases',
  ])('treats "%s" as substantive content', (content) => {
    expect(isAckMessage(content)).toBe(false);
  });
});

describe('thread wake decisions (balanced guards)', () => {
  const substantive = { messageType: 'agent-to-agent', content: 'Please review the migration plan.' };

  test('wakes a normal first reply', () => {
    expect(decideThreadWake(substantive, {
      hasThread: true, wakeCount: 0, recentSenderCount: 0,
    })).toEqual({ wake: true, reason: null });
  });

  test('never wakes bare acknowledgements', () => {
    expect(decideThreadWake(
      { messageType: 'agent-to-agent', content: 'done, thanks!' },
      { hasThread: true, wakeCount: 0, recentSenderCount: 0 },
    )).toEqual({ wake: false, reason: 'ack' });
  });

  test('honours explicit wake opt-out', () => {
    expect(decideThreadWake({ ...substantive, wake: false }, { hasThread: true }))
      .toEqual({ wake: false, reason: 'wake_opt_out' });
  });

  test(`stops waking at the ${MAX_THREAD_WAKES}-wake thread cap`, () => {
    expect(decideThreadWake(substantive, { hasThread: true, wakeCount: MAX_THREAD_WAKES, recentSenderCount: 0 }))
      .toEqual({ wake: false, reason: 'thread_cap' });
    expect(decideThreadWake(substantive, { hasThread: true, wakeCount: MAX_THREAD_WAKES - 1, recentSenderCount: 0 }).wake)
      .toBe(true);
  });

  test('cools down rapid same-sender replies in one thread', () => {
    expect(decideThreadWake(substantive, {
      hasThread: true, wakeCount: 2, recentSenderCount: THREAD_COOLDOWN_SENDER_LIMIT,
    })).toEqual({ wake: false, reason: 'cooldown' });
  });

  test('throttles cross-thread ping-pong velocity for fresh threads', () => {
    expect(decideThreadWake(substantive, {
      hasThread: false, wakeCount: 0, recentSenderCount: 0,
      pairwiseRecentCount: PAIRWISE_VELOCITY_LIMIT,
    })).toEqual({ wake: false, reason: 'velocity' });
    // Same velocity does not punish replies inside an established thread.
    expect(decideThreadWake(substantive, {
      hasThread: true, wakeCount: 2, recentSenderCount: 0,
    }).wake).toBe(true);
  });
});
