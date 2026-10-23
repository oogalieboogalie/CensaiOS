// server/routes/agentEndpointsPublic.js
//
// The outside door for shared agents, mounted BEFORE the session guard:
// callers prove themselves with an agent key, not a censaiOS sign-in.
//   POST /api/mcp/agents/:endpointId        MCP (Streamable HTTP, JSON replies)
//   POST /api/mcp/agents/:endpointId/ask    plain HTTP: { message, request? } -> { answer, receipt }
// An agent's address is its endpoint id, so a relay serves the same paths
// under /i/<install id>/ on its own host (server/agentNetwork/address.js).
// answerAgentCall is the one place a call is answered: the routes below
// and calls a relay forwards (server/agentNetwork/relayLink.js) both use it.

import express from 'express';
import { tokenFromRequest } from '../agentEndpoints/tokens.js';
import {
  OutsideCallError, authorizeOutsideCall, cleanQuestion, performOutsideCall,
} from '../agentEndpoints/callAgent.js';
import { handleMcpMessage } from '../agentEndpoints/mcpProtocol.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('agent-endpoints');
const ENDPOINT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RECEIPT_META_KEY = 'censai.app/receipt';

function errorReply(error, { mcp = false } = {}) {
  const status = error instanceof OutsideCallError ? error.statusCode : 500;
  if (status >= 500 && !(error instanceof OutsideCallError)) log.error('outside call failed', { code: safeErrorCode(error) });
  const headers = {};
  if (error.retryAfter) headers['Retry-After'] = String(error.retryAfter);
  if (status === 401) headers['WWW-Authenticate'] = 'Bearer realm="censaiOS agent", error="invalid_token"';
  const message = status >= 500 && !(error instanceof OutsideCallError) ? 'Something went wrong.' : error.message;
  return { status, headers, body: mcp ? { jsonrpc: '2.0', id: null, error: { code: -32001, message } } : { error: message } };
}

/**
 * Answer one call to a shared agent.
 *   kind     'mcp' or 'ask'
 *   channel  'endpoint' (direct) or 'relay' (forwarded); goes in the receipt
 * Returns { status, headers, body } (body null means no content).
 */
export async function answerAgentCall({ endpointId, kind, token, body, address, channel = 'endpoint' }, deps) {
  const mcp = kind === 'mcp';
  try {
    if (!ENDPOINT_ID.test(String(endpointId))) throw new OutsideCallError('No agent lives at this address.', 404);
    const row = await authorizeOutsideCall({ endpointId, token, address }, deps);
    if (mcp) {
      let receipt = null;
      const ask = async (message) => {
        const out = await performOutsideCall({ row, question: cleanQuestion(message), via: 'mcp', channel }, deps);
        receipt = out.receipt;
        return out;
      };
      const reply = await handleMcpMessage(body, { endpoint: row, ask });
      if (receipt && reply.body?.result) reply.body.result._meta = { [RECEIPT_META_KEY]: receipt };
      return { status: reply.status, headers: {}, body: reply.body };
    }
    const question = cleanQuestion(body?.message);
    const { answer, agentName, receipt } = await performOutsideCall({
      row, question, via: 'http', channel, request: body?.request || null,
    }, deps);
    return { status: 200, headers: {}, body: { agent: agentName, answer, ...(receipt ? { receipt } : {}) } };
  } catch (error) {
    return errorReply(error, { mcp });
  }
}

function send(res, reply) {
  res.set(reply.headers || {});
  if (reply.body === null) return res.status(reply.status).end();
  return res.status(reply.status).json(reply.body);
}

export function createAgentEndpointPublicRouter(deps) {
  const router = express.Router();
  const call = (req, kind) => answerAgentCall({
    endpointId: req.params.endpointId, kind, token: tokenFromRequest(req), body: req.body, address: req.ip,
  }, deps);

  router.post('/agents/:endpointId', async (req, res) => send(res, await call(req, 'mcp')));

  // Stateless server: no server-to-client stream and no sessions to end.
  router.all('/agents/:endpointId', (_req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Use POST.' }));

  router.post('/agents/:endpointId/ask', async (req, res) => send(res, await call(req, 'ask')));

  return router;
}

export const agentEndpointPublicRouter = createAgentEndpointPublicRouter(undefined);
