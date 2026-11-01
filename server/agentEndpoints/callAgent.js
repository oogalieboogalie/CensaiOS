// server/agentEndpoints/callAgent.js
//
// One outside call, start to finish: check the key, check the agent is
// shared, apply the limits, run the agent, log the call, and show the
// exchange in the agent's chat on the board. Shared by the MCP endpoint and
// the plain HTTP endpoint so both behave the same.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { isEndpointTokenShape } from './tokens.js';
import * as endpointStore from './store.js';
import { endpointLimiter } from './rateLimit.js';
import { runAgentForOutsideCall } from './runAgent.js';
import { logOutsideCallOnBoard } from './boardLog.js';
import { askerFor, recordEndpointReceipt } from '../agentNetwork/endpointReceipt.js';
import { receiptSummary } from '../agentNetwork/receipts.js';

const log = createLogger('agent-endpoints');
export const MAX_QUESTION_CHARS = 20000;

export class OutsideCallError extends Error {
  constructor(message, statusCode, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

const defaultDeps = {
  db: pool,
  store: endpointStore,
  limiter: endpointLimiter,
  runAgent: runAgentForOutsideCall,
  showOnBoard: logOutsideCallOnBoard,
  signReceipt: recordEndpointReceipt,
};

/**
 * Resolve a key to the endpoint it may call. Throws 401 for a missing, wrong,
 * revoked or other-agent key (all look the same from outside) and 403 when
 * the owner has turned sharing off.
 */
export async function authorizeOutsideCall({ endpointId, token, address }, deps = defaultDeps) {
  const deny = () => {
    deps.limiter.badKey(address);
    return new OutsideCallError('A valid agent key is required.', 401);
  };
  if (!isEndpointTokenShape(token)) throw deny();
  const row = await deps.store.findTokenByValue(deps.db, token);
  if (!row || row.revoked_at || String(row.id) !== String(endpointId)) throw deny();
  if (!row.enabled) throw new OutsideCallError(`${row.agent_name} is not shared right now. Its owner can turn sharing on in censaiOS.`, 403);
  return row;
}

export function cleanQuestion(value) {
  const question = typeof value === 'string' ? value.trim() : '';
  if (!question) throw new OutsideCallError('Send a message for the agent.', 400);
  if (question.length > MAX_QUESTION_CHARS) throw new OutsideCallError(`Messages are limited to ${MAX_QUESTION_CHARS} characters.`, 413);
  return question;
}

/**
 * Run one call for an authorized key row. Returns { answer, agentName, receipt }.
 *   request  the asking censaiOS's signed request, when it sent one
 *   channel  'endpoint' (called directly) or 'relay' (forwarded by a relay)
 */
export async function performOutsideCall({ row, question, via, request = null, channel = 'endpoint' }, deps = defaultDeps) {
  const keyLabel = row.token_label;
  const asker = askerFor({ request, question, keyLabel });
  const sign = (outcome, answer, timings, startedAtDate) => (deps.signReceipt
    ? deps.signReceipt({ endpoint: row, asker, channel, question, answer, outcome, startedAt: startedAtDate, timings })
    : null);
  const slot = deps.limiter.acquire(row.token_id);
  const startedAt = Date.now();
  const record = (status, extra = {}) => deps.store.logCall(deps.db, {
    endpointId: row.id, tokenId: row.token_id, via, status, question, durationMs: Date.now() - startedAt, ...extra,
  }).catch((error) => log.warn('call not logged', { endpointId: row.id, code: safeErrorCode(error) }));

  if (!slot.ok) {
    await record('limited', { error: slot.reason });
    throw new OutsideCallError(
      slot.reason === 'busy' ? 'This key already has calls running. Try again in a moment.' : 'Too many calls with this key. Try again in a minute.',
      429, { retryAfter: slot.retryAfter },
    );
  }
  deps.store.touchToken(deps.db, row.token_id).catch(() => {});
  const startedAtDate = new Date();
  // Filled in by the run engine; the receipt adds up its token counts.
  const timings = { total_ms: 0, setup_ms: 0, model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] };
  try {
    const answer = await deps.runAgent({ endpoint: row, keyLabel, question, timings });
    const receipt = await sign('completed', answer, timings, startedAtDate);
    await record('ok', { answerChars: answer.length });
    await deps.showOnBoard(row, { keyLabel, via, question, answer, asker, receipt: receiptSummary(receipt) });
    return { answer: answer || '(no answer)', agentName: row.agent_name, receipt };
  } catch (error) {
    const message = error?.statusCode && error.statusCode < 500 ? error.message : publicFailure(error);
    const receipt = await sign('failed', null, timings, startedAtDate);
    await record('error', { error: error?.message || 'failed' });
    await deps.showOnBoard(row, { keyLabel, via, question, error: message, asker, receipt: receiptSummary(receipt) });
    throw new OutsideCallError(message, error?.statusCode === 504 ? 504 : 502);
  } finally {
    slot.release();
  }
}

function publicFailure(error) {
  if (error?.statusCode === 504) return error.message;
  if (error?.code === 'AI_CONFIGURATION_REQUIRED' || /api key|provider/i.test(String(error?.message))) {
    return 'The agent could not reach its model. Its owner may need to add a model key in censaiOS.';
  }
  return 'The agent could not answer just now.';
}
