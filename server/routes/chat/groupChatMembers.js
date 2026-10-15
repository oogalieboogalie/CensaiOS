// Who answers in a group chat. Members are built-in family agents or this
// board's own sub-agents (the agents a starter board creates). Each member
// gets its system prompt and model; the order people picked is kept, so in
// a team room the Lead speaks first and hands off to the others.

import { getAgentsByIds, buildSystemPrompt, getSubAgentById } from '../../memory.js';
import { resolveChatModelConfig } from '../../aiGateway/index.js';
import { isFamilyAgentId, requireFamilyAgentIds, requireFamilyRows } from '../../agents/familyRuntimeAccess.js';

function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export const GROUP_RULES = 'You are in a group chat with people and other agents. Messages from others start with their name in brackets. Answer in your own role, briefly, and build on what the others said instead of repeating it. You cannot use tools in this chat.';

/** The prompt a board sub-agent answers with in a group chat. */
export function subAgentGroupPrompt(sub) {
  const lines = [`You are ${sub.name}${sub.role ? `, ${sub.role}` : ''}.`];
  if (sub.system_prompt) lines.push(sub.system_prompt);
  else if (sub.specialty) lines.push(sub.specialty);
  lines.push(GROUP_RULES);
  return lines.join('\n\n');
}

/**
 * Resolve every member in order: { agentId, name, systemPrompt, modelConfig }.
 * Unknown ids fail with 404 so the window can say so instead of going quiet.
 */
export async function resolveGroupChatMembers(agentIds, { workspaceId, userId, lastText, historyInRequest, deps = {} }) {
  const loadFamily = deps.getAgentsByIds || getAgentsByIds;
  const loadSub = deps.getSubAgentById || getSubAgentById;
  const familyPrompt = deps.buildSystemPrompt || buildSystemPrompt;

  const ids = (agentIds || []).map(id => String(id || '').trim());
  if (!ids.length) throw httpError('No agents provided', 400, 'GROUP_CHAT_NO_AGENTS');
  if (new Set(ids).size !== ids.length) throw httpError('Each agent can only be in the chat once.', 400, 'FAMILY_AGENT_DUPLICATE');

  const familyIds = ids.filter(isFamilyAgentId);
  const familyRows = familyIds.length ? requireFamilyRows(requireFamilyAgentIds(familyIds), await loadFamily(familyIds)) : [];
  const familyById = new Map(familyRows.map(row => [row.id, row]));

  const members = [];
  for (const agentId of ids) {
    const family = familyById.get(agentId);
    if (family) {
      const prompt = await familyPrompt(agentId, lastText, { workspaceId, userId, historyInRequest }).catch(() => null);
      if (!prompt) throw httpError('Family context is temporarily unavailable.', 503, 'AGENT_CONTEXT_UNAVAILABLE');
      members.push({
        agentId,
        name: family.name || agentId,
        systemPrompt: prompt,
        modelConfig: family.model_name ? resolveChatModelConfig({ modelProvider: family.model_provider, modelName: family.model_name }) : resolveChatModelConfig(),
      });
      continue;
    }
    const sub = workspaceId ? await loadSub(agentId, { workspaceId, userId }) : null;
    if (!sub) throw httpError('One of the agents in this chat is not on this board.', 404, 'GROUP_CHAT_AGENT_NOT_FOUND');
    members.push({
      agentId,
      name: sub.name || agentId,
      systemPrompt: subAgentGroupPrompt(sub),
      modelConfig: resolveChatModelConfig({ modelProvider: sub.model_provider, modelName: sub.model_name }),
    });
  }
  return members;
}

/** The conversation as one member sees it: its own lines are the assistant's. */
export function memberMessages(member, messages, names) {
  return [
    { role: 'system', content: member.systemPrompt },
    ...messages.map((m) => {
      if (m.from === 'me') return { role: 'user', content: m.text };
      if (m.from === 'system') return { role: 'user', content: `[SYSTEM]: ${m.text}` };
      // 'agent' is the legacy 1:1 sender tag (pre-agent.id); it can only mean this agent.
      if (m.from === member.agentId || m.from === 'agent') return { role: 'assistant', content: m.text };
      return { role: 'user', content: `[${names[m.from] || m.from}]: ${m.text}` };
    }),
  ];
}
