// A message to a hosted agent: instead of running a model here, censaiOS
// hands the person's words to the vendor that hosts the agent, with the
// person's own saved key, and shows the vendor's answer in the chat. The
// vendor keeps the conversation (its session or thread id is remembered per
// person and chat), so the agent keeps its own memory there.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { netFetch } from '../security/publicAddress.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';
import { beginAgentPresence } from '../collab/agentPresence.js';
import { getAgent } from '../memory/core/agents.js';
import { HostedAgentError } from './http.js';
import { findThread, saveThread } from './store.js';
import { getVendor } from './vendors/index.js';

const log = createLogger('hosted-agents');

/** The words to send: the person's last message (or the last message at all). */
export function lastAsk(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const mine = list.filter((m) => m?.from === 'me' || m?.role === 'user').pop();
  const text = String((mine || list[list.length - 1])?.text ?? (mine || {}).content ?? '').trim();
  return text.slice(0, 20_000);
}

/** The chat before the new message, for vendors that cannot keep it themselves. */
export function recentHistory(messages, agentId) {
  const list = (Array.isArray(messages) ? messages : []).filter((m) => m?.from === 'me' || m?.from === agentId || m?.from === 'agent');
  return list.slice(-11, -1).map((m) => ({ who: m.from === 'me' ? 'person' : 'agent', text: String(m.text || '').slice(0, 2000) }));
}

export function conversationKeyFor({ origin, conversationId, windowId }) {
  return String(conversationId || windowId || origin || 'chat').slice(0, 200);
}

/** The person's own key for this vendor. Never a shared one. */
export async function keyFor(vendor, userId, { vault = getUserApiKeyConfig } = {}) {
  const config = userId ? await vault(userId, vendor.keyProvider).catch(() => null) : null;
  if (config?.apiKey) return config.apiKey;
  throw new HostedAgentError(
    `Add your ${vendor.keyLabel} in Settings → Vault to talk to this agent. Its messages are billed by ${vendor.billedBy} to the key's owner.`,
    403,
    'HOSTED_AGENT_KEY_REQUIRED',
  );
}

/** Same rule as every other agent: cloud boards only show family agents to privileged roles. */
export async function hostedAccess({ db, agentId, userId, userRole }) {
  let role = userRole;
  if (userId && !role) role = (await db.query('SELECT role FROM users WHERE id = $1', [userId])).rows[0]?.role || 'user';
  const { enforceCoreChatBoundary } = await import('../agents/familyRuntimeAccess.js');
  enforceCoreChatBoundary({ agentId, agent: await getAgent(agentId, userId), userRole: role });
}

export async function runHostedTurn({
  hosted, origin = 'chat', agentId, messages, userId = null, userRole = null, workspaceId = null, windowId = null,
  conversationId = null, sendEvent = () => {}, onModelAccepted, onPrepared = null, signal = null,
  timings, remember = null, rememberQuestion = null,
  db = pool, vault = getUserApiKeyConfig, fetchImpl = netFetch, presence = beginAgentPresence, pickVendor = getVendor, checkAccess = hostedAccess,
}) {
  const startedAt = Date.now();
  const vendor = pickVendor(hosted.vendor);
  if (!vendor) throw new HostedAgentError('This hosted agent comes from a vendor censaiOS no longer knows.', 400, 'HOSTED_AGENT_UNKNOWN_VENDOR');
  await checkAccess({ db, agentId, userId, userRole });
  const authorized = workspaceId && userId
    ? (await resolveWorkspaceContext(db, { userId, workspaceId })).id
    : workspaceId || null;
  const context = {
    workspaceId: authorized, changeImpact: null, projectContext: [], sevenContexts: null,
    reqModel: `${hosted.vendor}:hosted`, reqProvider: hosted.vendor, chatMessages: [], toolsForCaller: [],
  };
  const text = lastAsk(messages);
  if (!text) throw new HostedAgentError('There is nothing to send yet.', 400, 'HOSTED_AGENT_EMPTY');
  const apiKey = await keyFor(vendor, userId, { vault });
  // Only a person's own chat window keeps a vendor conversation. Outside apps,
  // other agents and workflows start fresh each time, so one caller never
  // sees what another asked.
  const keepsThread = origin === 'chat' && Boolean(userId);
  const conversationKey = conversationKeyFor({ origin, conversationId, windowId });
  const thread = keepsThread ? await findThread(db, { agentId, userId, conversationKey }) : null;
  if (timings) timings.setup_ms = Date.now() - startedAt;
  await onPrepared?.(context);

  const cursor = await presence({ workspaceId: authorized, agentId, windowId, describe: () => getAgent(agentId) });
  let answer = '';
  try {
    onModelAccepted?.();
    sendEvent({ type: 'status', status: 'thinking', detail: { hosted: hosted.vendor } });
    const sentAt = Date.now();
    const ask = (from) => vendor.send({
      ref: hosted.remote_ref, endpoint: hosted.endpoint, settings: hosted.settings || {},
      apiKey, thread: from, text, history: recentHistory(messages, agentId), person: userId ? `censai-${userId}` : null, fetchImpl, signal,
    });
    // A vendor conversation that has expired or was deleted: start a fresh one.
    const reply = await ask(thread).catch((err) => {
      if (thread && (err?.code === 'HOSTED_AGENT_NOT_FOUND' || err?.code === 'HOSTED_AGENT_REJECTED')) return ask(null);
      throw err;
    });
    answer = String(reply?.text || '').trim() || `(${vendor.label} sent back an empty answer.)`;
    if (timings) {
      timings.model_ms = Date.now() - sentAt;
      timings.model_calls.push({ model: `${hosted.vendor}:hosted`, ms: timings.model_ms });
    }
    if (keepsThread && reply?.thread && reply.thread !== thread) {
      await saveThread(db, { agentId, userId, conversationKey, thread: reply.thread })
        .catch((err) => log.warn('could not remember the vendor conversation', { agentId, error: err.message }));
    }
    log.info('hosted agent answered', {
      agentId, vendor: hosted.vendor, origin, ms: Date.now() - startedAt, newThread: Boolean(reply?.thread && !thread),
    });
    if (rememberQuestion && remember) {
      await remember({ agentId, question: rememberQuestion, answer, workspaceId: authorized || workspaceId, userId });
    }
    return { finalText: answer, toolActions: [], context, timings };
  } catch (err) {
    if (err?.code !== 'CHAT_ABORTED') {
      log.warn('hosted agent call failed', { agentId, vendor: hosted.vendor, origin, code: err?.code || null, error: err?.message });
    }
    throw err;
  } finally {
    cursor.finish(answer);
  }
}
