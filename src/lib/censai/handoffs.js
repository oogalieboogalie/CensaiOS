import { FAMILY_AGENT_BY_ID } from '../../data/family-agents.js';

// Censai, the orchestrator: plain-words lines for the work Censai hands to
// the family. Shared by the pinned chat (notes under a reply) and the
// Family desk (mail Censai sent and what came back).

export const CENSAI_ID = 'censai';

const HANDOFF_TOOLS = new Set(['message_to', 'reply_to']);

export function familyName(agentId) {
  const id = String(agentId || '').trim().toLowerCase();
  if (!id) return 'the family';
  return FAMILY_AGENT_BY_ID[id]?.name || id[0].toUpperCase() + id.slice(1);
}

// From a chat reply's tool list ({ tool, ok, summary: { target } }): the
// family members Censai messaged, once each, in order.
export function handoffsFromTools(tools) {
  if (!Array.isArray(tools)) return [];
  const seen = new Set();
  const out = [];
  for (const action of tools) {
    if (!HANDOFF_TOOLS.has(action?.tool) || action.ok === false) continue;
    const target = String(action.summary?.target || '').trim().toLowerCase();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    out.push({ agentId: target, name: familyName(target) });
  }
  return out;
}

export function describeHandoffs(handoffs) {
  if (!Array.isArray(handoffs) || handoffs.length === 0) return '';
  const names = handoffs.map((h) => h.name);
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Handed to ${list}`;
}

function clip(text, max = 140) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// One Family desk row from a /api/mail-activity message, or null when the
// message does not involve Censai.
export function deskEntry(msg) {
  if (!msg) return null;
  const from = String(msg.from_agent || '').toLowerCase();
  const to = String(msg.to_agent || '').toLowerCase();
  const sent = from === CENSAI_ID;
  if (!sent && to !== CENSAI_ID) return null;
  const other = sent ? to : from;
  return {
    id: msg.id,
    direction: sent ? 'out' : 'in',
    agentId: other || null,
    who: sent
      ? (other ? `Censai to ${familyName(other)}` : 'Censai to everyone')
      : `${familyName(other)} to Censai`,
    text: clip(msg.content),
    at: msg.created_at || null,
  };
}

export function deskEntries(messages, limit = 12) {
  if (!Array.isArray(messages)) return [];
  return messages.map(deskEntry).filter(Boolean).slice(0, limit);
}
