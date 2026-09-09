import crypto from 'crypto';

const MAX_PROMPT_CHARS = 50_000;
const MAX_ID_CHARS = 200;

export const AGENT_CARD_RUN_KIND = 'agent_card_call';

export function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function actorId(actor) {
  const value = actor?.id ?? actor?.userId;
  return value === undefined || value === null ? '' : String(value).trim();
}

function workspaceIds(actor) {
  return new Set(Array.isArray(actor?.workspaceIds) ? actor.workspaceIds.map(String) : []);
}

export function isSystemAgentCard(card) {
  return Boolean(card?.id?.startsWith('agent:'))
    && card.visibility === 'public'
    && card.owner_id == null
    && card.workspace_id == null;
}

export function canReadCard(card, actor) {
  if (!card) return false;
  if (isSystemAgentCard(card)) return true;
  if (!card.owner_id || !card.workspace_id) return false;
  if (card.visibility === 'public') return true;
  const id = actorId(actor);
  if (!id || !workspaceIds(actor).has(String(card.workspace_id))) return false;
  if (card.visibility === 'workspace') return true;
  return card.visibility === 'private' && String(card.owner_id) === id;
}

export function canInvokeCard(card, actor) {
  return Boolean(actorId(actor)) && canReadCard(card, actor);
}

export function resolveBuiltInAgentId(card) {
  const executor = resolveAgentCardExecutor(card);
  return executor.kind === 'builtin' ? executor.agentId : null;
}

export function resolveAgentCardExecutor(card) {
  const cardId = String(card?.id || '');
  if (cardId.startsWith('agent:') && !card?.owner_id) {
    const agentId = cardId.slice('agent:'.length).trim();
    if (!agentId) throw contractError('invalid-agent-card', 'Built-in AgentCard has no agent id.');
    return { kind: 'builtin', agentId };
  }
  const imported = card?.metadata?.import;
  const executor = card?.metadata?.executor;
  const authType = String(card?.auth?.type || 'none');
  const validA2A = cardId.startsWith('ext:a2a:') && card?.owner_id && card?.workspace_id
    && imported?.kind === 'a2a' && executor?.kind === 'a2a'
    && executor?.status === 'executable' && /^0\.3(?:\.|$)/.test(String(executor.protocolVersion || ''))
    && executor.transport === 'JSONRPC' && executor.endpoint === card.endpoint
    && executor.sourceDigest === imported.sourceDigest && authType === 'none'
    && executor.sourceCard && typeof executor.sourceCard === 'object';
  if (validA2A) {
    return {
      kind: 'a2a', protocolVersion: executor.protocolVersion,
      endpoint: executor.endpoint, sourceDigest: executor.sourceDigest,
      sourceCard: executor.sourceCard,
    };
  }
  const validN8N = cardId.startsWith('ext:n8n:') && card?.owner_id && card?.workspace_id
    && imported?.kind === 'n8n_chat' && executor?.kind === 'n8n_chat'
    && executor?.status === 'executable' && executor?.protocolVersion === 'n8n-chat-v1'
    && executor?.transport === 'HTTP_JSON' && executor?.endpoint === card.endpoint
    && executor?.sourceDigest === imported.sourceDigest
    && imported.webhookUrl === executor.endpoint && authType === 'none';
  if (validN8N) {
    return {
      kind: 'n8n_chat', protocolVersion: executor.protocolVersion,
      endpoint: executor.endpoint, sourceDigest: executor.sourceDigest,
    };
  }
  throw contractError('unsupported-card-executor', 'This AgentCard has no supported executable adapter.');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function agentCardExecutorFingerprint(card) {
  const executor = resolveAgentCardExecutor(card);
  const snapshot = {
    id: card.id, ownerId: card.owner_id || null, workspaceId: card.workspace_id || null,
    version: card.version, endpoint: card.endpoint || null, auth: card.auth || {}, executor,
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex');
}

function promptFromPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  return payload.prompt ?? payload.message ?? payload.text ?? payload.msg ?? '';
}

export function normalizeCallRequest(payload, options = {}) {
  const prompt = String(promptFromPayload(payload) || '').trim();
  if (!prompt) throw contractError('prompt-required', 'AgentCard call requires a prompt.');
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw contractError('prompt-too-large', `AgentCard prompt exceeds ${MAX_PROMPT_CHARS} characters.`);
  }
  const workspaceId = String(options?.workspaceId || 'default').trim() || 'default';
  if (workspaceId.length > MAX_ID_CHARS) {
    throw contractError('workspace-id-too-large', 'workspaceId is too long.');
  }
  return { prompt, workspaceId };
}

export function normalizeClientTaskId(value, fallback) {
  const id = String(value || fallback || '').trim();
  if (!id || id.length > MAX_ID_CHARS || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw contractError('invalid-task-id', 'taskId contains unsupported characters.');
  }
  return id;
}

export function safeRuntimeEvent(event = {}) {
  const detail = event.detail && typeof event.detail === 'object'
    ? {
        round: event.detail.round,
        tool: event.detail.tool,
        ms: event.detail.ms,
        ok: event.detail.ok,
        summary: event.detail.summary,
        policy: event.detail.policy?.decision,
      }
    : undefined;
  return {
    type: String(event.type || 'status'),
    status: String(event.status || event.type || 'event'),
    ...(detail ? { detail: Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== undefined)) } : {}),
  };
}
