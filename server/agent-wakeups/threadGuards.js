// Thread loop-guards for family agent mail.
//
// The wakeup worker wakes an agent for every `agent-to-agent` / `work_request`
// / `agent_report` message. Without brakes, two polite agents reply
// "done" / "ok" at each other forever, burning model calls. These guards are
// the brakes — pure functions (easy to test) plus the tuned constants in one
// place. DB-backed stats live in ./store.js (getThreadStats).

// Balanced preset: threads stay useful for real back-and-forth but die on
// their own instead of looping forever.
export const MAX_THREAD_WAKES = 8;
export const THREAD_COOLDOWN_WINDOW_MINUTES = 5;
export const THREAD_COOLDOWN_SENDER_LIMIT = 3;
export const PAIRWISE_VELOCITY_WINDOW_MINUTES = 10;
export const PAIRWISE_VELOCITY_LIMIT = 4;

const ACK_PHRASES = [
  'ok', 'okay', 'k', 'done', 'noted', 'ack', 'acknowledged',
  'thanks', 'thank you', 'thx', 'got it', 'got it, thanks',
  'copy', 'copy that', 'roger', 'wilco', 'sure', 'yes', 'yeah',
  'yep', 'nope', 'no', 'will do', 'on it', 'looking into it',
  'fixed', 'shipped', 'all set', 'great', 'perfect', 'nice', 'cool',
  'sounds good', '+1', '👍', '🙏', '👌',
];

function normalize(content = '') {
  return String(content)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a message is a bare acknowledgement ("done", "ok thanks") that
 * carries no actionable content. Acks are still stored and inbox-visible —
 * they just never wake the recipient.
 */
export function isAckMessage(content = '') {
  const text = normalize(content);
  if (!text) return true;
  const words = text.split(' ');
  if (words.length > 6) return false;
  if (ACK_PHRASES.includes(text)) return true;
  // Trailing acknowledgement after a short stem: "ok thanks!", "done, thanks".
  return words.length <= 3 && ACK_PHRASES.some((ack) => text.startsWith(ack));
}

/**
 * Decide whether a freshly stored message should wake its recipient.
 * Pure decision over pre-fetched stats — the DB reads happen in
 * getThreadStats() so this stays unit-testable.
 *
 * @param {{ messageType?: string, wake?: boolean, content?: string }} msg
 * @param {{ wakeCount?: number, recentSenderCount?: number, pairwiseRecentCount?: number, hasThread?: boolean }} stats
 * @returns {{ wake: boolean, reason: string|null }}
 */
export function decideThreadWake(msg = {}, stats = {}) {
  if (msg.wake === false) return { wake: false, reason: 'wake_opt_out' };
  if (isAckMessage(msg.content)) return { wake: false, reason: 'ack' };
  if ((stats.wakeCount ?? 0) >= MAX_THREAD_WAKES) return { wake: false, reason: 'thread_cap' };
  if ((stats.recentSenderCount ?? 0) >= THREAD_COOLDOWN_SENDER_LIMIT) {
    return { wake: false, reason: 'cooldown' };
  }
  if (!stats.hasThread && (stats.pairwiseRecentCount ?? 0) >= PAIRWISE_VELOCITY_LIMIT) {
    return { wake: false, reason: 'velocity' };
  }
  return { wake: true, reason: null };
}

export const WAKE_SUPPRESSED_DESCRIPTIONS = Object.freeze({
  wake_opt_out: 'wake explicitly disabled',
  ack: 'message is a bare acknowledgement',
  thread_cap: `thread reached the ${MAX_THREAD_WAKES}-wake cap`,
  cooldown: 'sender is replying too fast in this thread',
  velocity: 'too many recent wakeable messages to this recipient',
  not_wakeable: 'message type never wakes',
});
