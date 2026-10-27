import { familyReplyNotice } from '../src/lib/chat/familyReply.js';

const now = Date.parse('2026-10-25T18:00:00Z');

function wake(overrides = {}) {
  return {
    id: 'wake-9',
    agent_id: 'censai',
    status: 'completed',
    message_type: 'agent_report',
    thread_id: 'thread-1',
    sender_name: 'Atlas',
    content: 'Two blocking issues in the plan.',
    response: 'I will fold both blockers into the plan.',
    updated_at: '2026-10-25T17:50:00Z',
    ...overrides,
  };
}

test('a finished reply wake becomes the sender\'s chat line, not a check-messages prompt', () => {
  const notice = familyReplyNotice(wake(), now);
  expect(notice.from).toBe('censai');
  expect(notice.from).not.toBe('me');
  expect(notice.text).toContain('Two blocking issues');
  expect(notice.text).toContain('fold both blockers');
  expect(notice.text).not.toMatch(/check your messages/i);
  expect(notice.familyReplyWakeId).toBe('wake-9');
});

test('a reply that has not finished, is not a return, or is only an instruction to check mail stays out of the chat', () => {
  expect(familyReplyNotice(wake({ status: 'queued' }), now)).toBeNull();
  expect(familyReplyNotice(wake({ message_type: 'agent-to-agent', thread_id: null }), now)).toBeNull();
  expect(familyReplyNotice(wake({ message_type: 'agent-to-agent', thread_id: 'thread-9' }), now)).toBeNull();
  expect(familyReplyNotice(wake({ message_type: 'work_request', thread_id: 'thread-9' }), now)).toBeNull();
  expect(familyReplyNotice(wake({ response: 'Please check your messages.' }), now)).toBeNull();
  expect(familyReplyNotice(wake({ updated_at: '2026-10-24T00:00:00Z' }), now)).toBeNull();
});
