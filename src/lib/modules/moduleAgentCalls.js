// "Chat to module": the shape of an agent's tool call on a module window.
// Shared by the server tool that writes the call (server/modules/
// moduleAgentTools.js) and the browser that runs it (useModuleAgentCalls).
//
//   agentCall = {
//     id, tool, input, by,       which agent pressed which tool, with what
//     status,                    waiting -> claimed -> running -> done | error
//                                (expired when no open board picked it up)
//     runner,                    the browser tab that runs it
//     result | error, at, doneAt
//   }

export const AGENT_CALL_STATUS = Object.freeze({
  waiting: 'waiting',
  claimed: 'claimed',
  running: 'running',
  done: 'done',
  error: 'error',
  expired: 'expired',
});

export const FINISHED_STATUSES = Object.freeze(['done', 'error', 'expired']);
export const MAX_RESULT_CHARS = 4000;

export function newAgentCall({ id, tool, input, by }) {
  return {
    id: String(id),
    tool: String(tool),
    input: input && typeof input === 'object' ? input : {},
    by: String(by || 'Agent').slice(0, 40),
    status: AGENT_CALL_STATUS.waiting,
    runner: null,
    result: null,
    error: null,
    at: new Date().toISOString(),
    doneAt: null,
  };
}

export function claimPatch(call, clientId) {
  return { ...call, status: AGENT_CALL_STATUS.claimed, runner: String(clientId) };
}

export function runningPatch(call) {
  return { ...call, status: AGENT_CALL_STATUS.running };
}

/** Results are kept small: they travel through the board document. */
export function boundedResult(result) {
  if (result === undefined || result === null) return null;
  let text;
  try { text = JSON.stringify(result); } catch { return String(result).slice(0, MAX_RESULT_CHARS); }
  if (text.length <= MAX_RESULT_CHARS) return result;
  return `${text.slice(0, MAX_RESULT_CHARS)}…`;
}

export function finishPatch(call, { result = null, error = null } = {}) {
  return {
    ...call,
    status: error ? AGENT_CALL_STATUS.error : AGENT_CALL_STATUS.done,
    result: error ? null : boundedResult(result),
    error: error ? String(error).slice(0, 300) : null,
    doneAt: new Date().toISOString(),
  };
}

export function isFinished(call) {
  return Boolean(call && FINISHED_STATUSES.includes(call.status));
}

/** "add_listing" -> "add listing", for the line the board shows. */
export function toolLabel(name) {
  return String(name || '').replace(/_/g, ' ');
}
