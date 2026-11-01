// Who answers in a group chat. Members are built-in family agents or this
// board's own sub-agents (the agents a starter board creates). Each member
// gets its system prompt and model; the order people picked is kept, so in
// a team room the Lead speaks first and hands off to the others.

import { getAgentsByIds, buildSystemPrompt, getSubAgentById } from '../../memory.js';
import { resolveChatModelConfig } from '../../aiGateway/index.js';
import { isFamilyAgentId, requireFamilyAgentIds, requireFamilyRows } from '../../agents/familyRuntimeAccess.js';
import { createLogger } from '../../logger.js';
import { applySavedChatKey } from './savedChatKey.js';

const log = createLogger('group-chat');

const KEY_WHY = {
  MODEL_KEY_MISSING: 'no key',
  MODEL_KEY_REJECTED: 'key turned down',
  MODEL_ACCESS_PERSONAL_KEY_REQUIRED: 'no key',
};

/** A short reason that never includes a message or a key. */
export function roundWhy(err, quiet = 0) {
  if (err?.code && KEY_WHY[err.code]) return KEY_WHY[err.code];
  if (err?.code && /^[A-Z0-9_]{1,80}$/.test(err.code)) return err.code;
  if (quiet > 0) return 'empty reply';
  return '';
}

/** One line per round: how many agents answered, and why any did not. */
export function logGroupChatRound({ answered = 0, asked = 0, why = '' }) {
  const reason = why ? `; ${String(why).slice(0, 80)}` : '';
  log.info(`round: ${answered} of ${asked} answered${reason}`);
}

/** The model this member runs on, using the person's own saved key. */
async function memberModel(record, { userId, userRole, preferRecord }) {
  const base = preferRecord
    ? resolveChatModelConfig({ modelProvider: record.model_provider, modelName: record.model_name })
    : resolveChatModelConfig();
  const keyed = await applySavedChatKey({
    provider: base.provider,
    model: base.model,
    baseUrl: base.baseUrl,
    apiKey: base.apiKey,
    userId,
    userRole,
  });
  return { provider: keyed.provider, model: keyed.model, baseUrl: keyed.baseUrl, apiKey: keyed.apiKey };
}

function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export const GROUP_RULES = 'You are in a group chat with people and other agents. Messages from others start with their name in brackets. Answer in your own role, briefly, and build on what the others said instead of repeating it. Use your own tools here when your part needs them (search the web, read or write files, add to the board), and say plainly what you did. If a tool fails or you do not have the tool your part needs, say so in one line instead of guessing.';

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
export async function resolveGroupChatMembers(agentIds, { workspaceId, userId, userRole = null, lastText, historyInRequest, deps = {} }) {
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
        modelConfig: await memberModel(family, { userId, userRole, preferRecord: Boolean(family.model_name) }),
      });
      continue;
    }
    const sub = workspaceId ? await loadSub(agentId, { workspaceId, userId }) : null;
    if (!sub) throw httpError('One of the agents in this chat is not on this board.', 404, 'GROUP_CHAT_AGENT_NOT_FOUND');
    members.push({
      agentId,
      name: sub.name || agentId,
      systemPrompt: subAgentGroupPrompt(sub),
      modelConfig: await memberModel(sub, { userId, userRole, preferRecord: true }),
    });
  }
  return members;
}

/**
 * The conversation as one member is handed it: the group rules first, then
 * the messages, with other agents' lines tagged by name (not by id). The run
 * engine turns a name into "[Lead]: ..." and the member's own lines into its own.
 */
export function groupTurnMessages(member, messages, names) {
  return [
    { from: 'system', text: GROUP_RULES },
    ...messages.map((m) => {
      // 'agent' is the legacy 1:1 sender tag (pre-agent.id); it can only mean this agent.
      if (m.from === 'me' || m.from === 'system' || m.from === member.agentId || m.from === 'agent') return m;
      return { ...m, from: names[m.from] || m.from };
    }),
  ];
}
