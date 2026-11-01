// When a family reply wakes the original sender, write that reply and the
// sender's answer onto their conversation. The chat used to learn about mail
// only on the next person-typed turn (unread lines in the system prompt, or
// an explicit read_messages). This runs inside the wake, so nobody has to
// say "check your messages".

export function wakeExchangeEntries(wake = {}, acceptance = '') {
  const agentId = wake.agent_id;
  if (!agentId) return [];
  const from = wake.sender_name || wake.sender_id || 'a family member';
  const entries = [];
  const incoming = String(wake.content || '').trim();
  if (incoming) {
    entries.push({
      agentId,
      role: 'family',
      content: `Family message from ${from}: ${incoming}`,
    });
  }
  const answer = String(acceptance || '').trim();
  if (answer) {
    entries.push({ agentId, role: 'assistant', content: answer });
  }
  return entries;
}

export async function recordWakeExchange(wake, acceptance, write) {
  if (typeof write !== 'function') return [];
  const ownership = {
    workspaceId: wake?.workspace_id,
    userId: Number(wake?.created_by_user_id),
  };
  const entries = wakeExchangeEntries(wake, acceptance);
  for (const entry of entries) {
    await write(entry.agentId, entry.role, entry.content, ownership);
  }
  return entries;
}
