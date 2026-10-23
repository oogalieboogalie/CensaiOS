// server/agentEndpoints/boardLog.js
//
// Every outside call shows up in the agent's chat window on the board, so
// the owner sees what other apps asked and what the agent said. The pair is
// written into the live canvas CRDT, so every open browser gets it at once.
// Never throws: the call still succeeds when no board is open.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { upsertWindowInDoc } from '../collab/serverWriter.js';
import { readDocWindows } from '../agent-registry/helpCards.js';

const log = createLogger('agent-endpoints');
const MAX_LOGGED_TEXT = 8000;

function isAgentChat(win, agentId) {
  return win?.kind === 'chat' && String(win.agentId || '').toLowerCase() === String(agentId).toLowerCase();
}

/** The chat window that shows this agent: the one it was shared from, else any. */
export function findAgentChat(wins, { windowId, agentId }) {
  return wins.find((win) => win.id === windowId && isAgentChat(win, agentId))
    || wins.find((win) => isAgentChat(win, agentId))
    || null;
}

/** The two messages an outside call adds: the question, then the agent's answer. */
export function outsideExchange({ agentId, keyLabel, via, question, answer, error, at, asker = null, receipt = null }) {
  // Another censaiOS that signed its request is named; anyone else is the key.
  const outsideCall = {
    keyLabel, via, at,
    ...(asker?.verified ? { fromLabel: asker.label, fromInstall: asker.install } : {}),
    ...(receipt?.channel === 'relay' ? { channel: 'relay' } : {}),
  };
  const signed = receipt ? { receipt } : {};
  return [
    { from: 'outside', text: String(question).slice(0, MAX_LOGGED_TEXT), outsideCall },
    error
      ? { from: agentId, text: `I could not answer that: ${error}`, outsideReply: outsideCall, error: true, ...signed }
      : { from: agentId, text: String(answer).slice(0, MAX_LOGGED_TEXT), outsideReply: outsideCall, ...signed },
  ];
}

/** Pure: append the exchange to the agent's chat in a doc. Returns the window id or null. */
export function appendOutsideExchangeInDoc(doc, endpoint, exchange) {
  const chat = findAgentChat(readDocWindows(doc), { windowId: endpoint.window_id, agentId: endpoint.agent_id });
  if (!chat) return null;
  const msgs = Array.isArray(chat.msgs) ? chat.msgs : [];
  upsertWindowInDoc(doc, { ...chat, msgs: [...msgs, ...exchange] });
  return chat.id;
}

export async function logOutsideCallOnBoard(endpoint, call) {
  let windowId = null;
  try {
    const exchange = outsideExchange({ agentId: endpoint.agent_id, at: new Date().toISOString(), ...call });
    await transactCanvasDoc(endpoint.workspace_id, (doc) => {
      windowId = appendOutsideExchangeInDoc(doc, endpoint, exchange);
    });
  } catch (error) {
    log.warn('outside call not shown on the board', { endpointId: endpoint.id, code: safeErrorCode(error) });
  }
  return windowId;
}
