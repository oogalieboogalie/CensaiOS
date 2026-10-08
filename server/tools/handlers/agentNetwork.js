import pool from '../../db.js';
import { discoverAgents } from '../../agent-registry/discovery.js';
import { createHelpRequest, getHelpRequest } from '../../agent-registry/helpRequests.js';

const MAX_WAIT_SECONDS = 45;
const POLL_MS = 2000;
const WAITING = new Set(['queued', 'working']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
export function __setSleepForTests(fn) { sleep = fn; }

function requireScope(context) {
  const workspaceId = String(context?.workspaceId || '').trim();
  const userId = Number(context?.userId);
  if (!workspaceId || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('The agent network requires an authenticated workspace context.');
  }
  return { workspaceId, userId };
}

function selfCardId(agentId) {
  return `agent:${String(agentId || '').trim().toLowerCase()}`;
}

function toolRequest(request) {
  return {
    request_id: request.id,
    card_id: request.cardId,
    agent: request.cardName,
    status: request.status,
    result: request.result ?? undefined,
    error: request.error ?? undefined,
    note: request.status === 'pending'
      ? 'Waiting for the agent\'s owner to accept. Check again later with agent_help_status.'
      : WAITING.has(request.status) ? 'Still running. Check again with agent_help_status.' : undefined,
  };
}

async function waitFor(scope, request, seconds) {
  const deadline = Date.now() + Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(seconds) || 0)) * 1000;
  let current = request;
  while (WAITING.has(current.status) && Date.now() < deadline) {
    await sleep(POLL_MS);
    current = await getHelpRequest(pool, { ...scope, id: current.id });
  }
  return current;
}

export async function handleAgentNetworkTool(agentId, name, args = {}, context = {}) {
  try {
    const scope = requireScope(context);
    if (name === 'discover_agents') {
      const result = await discoverAgents(pool, {
        ...scope,
        query: String(args.query || '').slice(0, 500),
        tags: Array.isArray(args.tags) ? args.tags.slice(0, 10) : [],
        limit: Math.max(1, Math.min(Number(args.limit) || 5, 20)),
        excludeCardIds: [selfCardId(agentId)],
      });
      return JSON.stringify({
        query: result.query,
        count: result.items.length,
        agents: result.items.map((item) => ({
          card_id: item.cardId,
          name: item.name,
          description: item.description,
          matched_skills: item.matchedSkills.map((skill) => ({ id: skill.id, name: skill.name })),
          callable: item.callable,
          you_can_request: item.callable && item.acceptsRequests && item.agentCanRequest,
        })),
      });
    }
    if (name === 'request_agent_help') {
      const request = await createHelpRequest(pool, {
        ...scope,
        cardId: String(args.card_id || '').trim(),
        task: args.task,
        skillId: args.skill_id,
        requester: { kind: 'agent', id: String(agentId || '').trim().toLowerCase() },
        autonomous: true,
      });
      return JSON.stringify(toolRequest(await waitFor(scope, request, args.wait_seconds)));
    }
    if (name === 'agent_help_status') {
      const id = String(args.request_id || '').trim();
      if (!UUID.test(id)) return JSON.stringify({ error: 'Unknown request_id.' });
      return JSON.stringify(toolRequest(await getHelpRequest(pool, { ...scope, id })));
    }
    return JSON.stringify({ error: `Unknown agent network tool: ${name}` });
  } catch (error) {
    return JSON.stringify({ error: error.message, code: error.code });
  }
}
