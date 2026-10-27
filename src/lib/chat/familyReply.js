// A completed family-reply wake, turned into one chat line from the agent
// who was woken (the original sender). Not a person saying "check your
// messages" — the wake already accepted the reply.

export const REPLY_NOTICE_WINDOW_MS = 6 * 60 * 60 * 1000;

// A thread id is not enough: an opening agent-to-agent message can already
// belong to a thread. Only a report back to the sender is a return.
function isReturnWake(wake) {
  return wake.message_type === 'agent_report';
}

function clip(text, max = 700) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function familyReplyNotice(wake, now = Date.now()) {
  if (!wake || wake.status !== 'completed' || !wake.agent_id) return null;
  if (!isReturnWake(wake)) return null;
  const answer = String(wake.response || '').trim();
  if (!answer || /check your messages/i.test(answer)) return null;
  const at = Date.parse(wake.updated_at || '');
  if (!Number.isFinite(at) || now - at > REPLY_NOTICE_WINDOW_MS || at - now > 60_000) return null;
  const quote = clip(wake.content);
  const who = wake.sender_name || 'Family';
  const text = quote ? `${who} replied: ${quote}\n\n${answer}` : answer;
  return {
    from: wake.agent_id,
    text,
    ts: now,
    at: new Date(now).toISOString(),
    familyReplyWakeId: String(wake.id),
  };
}
