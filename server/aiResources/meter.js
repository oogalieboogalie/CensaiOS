// The meter: every model call that goes through callModel (chat, agents,
// group chat, LeadHound, research, the task worker…) adds its tokens and an
// estimated cost to the key that paid for it. Best effort: a meter problem
// never fails the call, and nothing about the prompt or the key is kept.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { keyIdentity } from './keyIdentity.js';
import { estimateCost } from './prices.js';
import { recordSpend } from './ledger.js';
import { isLocalBaseUrl } from '../aiGateway/missingKey.js';

const log = createLogger('ai-resources');

function tokensOf(usage) {
  return {
    tokensIn: Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0,
    tokensOut: Number(usage?.completion_tokens ?? usage?.output_tokens) || 0,
  };
}

/** Who spent: the chat window, else the agent, else the feature. */
export function consumerOf(attribution = {}, accessContext = null, { allowance = false } = {}) {
  const userId = String(attribution?.actor?.id || accessContext?.userId || 'local-user');
  const agentId = attribution?.agentId ? String(attribution.agentId) : null;
  const windowId = attribution?.windowId ? String(attribution.windowId) : null;
  const source = String(attribution?.source || 'censaios');
  const base = { userId, source, ...(agentId ? { agentId } : {}), ...(allowance ? { allowance: true } : {}) };
  if (windowId) return { id: `${userId}|window:${windowId}`, kind: 'window', ref: windowId, ...base };
  if (agentId) return { id: `${userId}|agent:${agentId}`, kind: 'agent', ref: agentId, ...base };
  return { id: `${userId}|feature:${source}`, kind: 'feature', ref: source, ...base };
}

export function meterModelCall({ config, result, attribution, accessContext, allowance = false }) {
  // Test runs keep their hands off the real state folder unless they name one.
  if (process.env.NODE_ENV === 'test' && !process.env.HOMEBASE_STATE_DIR) return;
  try {
    // A model on this computer (Ollama, the default) costs nothing and has no real key.
    const local = String(config?.provider || '').toLowerCase() === 'ollama' || isLocalBaseUrl(config?.baseUrl || '');
    const provider = local ? 'ollama' : String(config?.provider || '').toLowerCase() || 'unknown';
    const identity = local ? { id: 'ollama:local', last4: '' } : keyIdentity(provider, config?.apiKey);
    if (!identity) return;
    const model = result?.model || config?.model || null;
    const { tokensIn, tokensOut } = tokensOf(result?.usage);
    recordSpend({
      keyId: identity.id,
      provider,
      last4: identity.last4,
      model,
      tokensIn,
      tokensOut,
      costUsd: estimateCost({ provider, model, tokensIn, tokensOut }),
      consumer: consumerOf(attribution, accessContext, { allowance }),
    });
  } catch (error) {
    log.warn('could not meter a model call', { code: safeErrorCode(error) });
  }
}
