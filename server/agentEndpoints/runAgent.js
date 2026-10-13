// server/agentEndpoints/runAgent.js
//
// Runs a board agent for an outside caller exactly the way its chat window
// does: same model, same provider key (the owner's vault key or the server
// key), same memory prompt, and the conversation is remembered like any
// other. The one difference is tools: outside callers only get the agent's
// look-up tools, never ones that write files, run commands or send messages.

import { runAgentTurn } from '../runEngine/index.js';

export const OUTSIDE_CALLER_TOOLS = Object.freeze([
  'recall', 'query_knowledge', 'read_associations',
  'project_list', 'project_read', 'project_file_outline', 'read_brief',
  'web_search', 'web_extract',
]);

const RUN_TIMEOUT_MS = 120 * 1000;

export function outsideTools(tools) {
  if (!Array.isArray(tools)) return tools;
  const allowed = new Set(OUTSIDE_CALLER_TOOLS);
  return tools.filter((tool) => allowed.has(tool?.function?.name));
}

export function outsideSystemNote({ agentName, keyLabel }) {
  return [
    `This question comes from an app outside censaiOS, through ${agentName}'s agent endpoint (key "${keyLabel}").`,
    'Answer it fully in this one reply; the caller cannot see your board or ask follow-up questions in this chat.',
    'You can look things up, but you cannot change files, run commands or message anyone from here.',
  ].join(' ');
}

/** Returns the agent's answer text. Throws with a statusCode on failure. */
export async function runAgentForOutsideCall({ endpoint, keyLabel, question, timings }) {
  const messages = [
    { from: 'system', text: outsideSystemNote({ agentName: endpoint.agent_name, keyLabel }) },
    { from: 'me', text: question },
  ];
  try {
    // Same run engine as the chat window; outside callers keep look-up tools only.
    const { finalText } = await runAgentTurn({
      origin: 'endpoint',
      agentId: endpoint.agent_id,
      messages,
      userId: endpoint.user_id,
      workspaceId: endpoint.workspace_id,
      windowId: endpoint.window_id || null,
      loopWorkspaceId: endpoint.workspace_id,
      toolFilter: outsideTools,
      timeoutMs: RUN_TIMEOUT_MS,
      rememberQuestion: question,
      ...(timings ? { timings } : {}),
    });
    return String(finalText || '').trim();
  } catch (error) {
    if (error?.code === 'CHAT_ABORTED') {
      throw Object.assign(new Error('The agent took too long to answer.'), { statusCode: 504 });
    }
    throw error;
  }
}
