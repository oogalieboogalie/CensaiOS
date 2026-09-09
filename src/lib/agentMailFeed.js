import { isAckMessage } from '../../server/agent-wakeups/threadGuards.js';

/**
 * Pure presentation helper for agent-mail toasts (unit-tested).
 * A send with no thread_id is a fresh "message complete"; anything carrying
 * a thread_id is a "reply complete". Bare acks get a quiet note so the
 * loop-guards are visible instead of mysterious.
 */
export function describeMailEvent(msg = {}) {
  const from = msg.from_name || msg.from_agent || 'Someone';
  const to = msg.to_name || msg.to_agent || 'everyone';
  const isReply = Boolean(msg.thread_id);
  const ack = isAckMessage(msg.content);
  const snippet = String(msg.content || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  return {
    isReply,
    ack,
    title: `${from} → ${to} · ${isReply ? 'reply complete' : 'message complete'}`,
    sub: ack ? `stored quietly (ack — no wake) · “${snippet}”` : `“${snippet}”`,
  };
}
