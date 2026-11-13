// Claim retry gate: when a reply says "I updated / created / sent ..." but no
// tool ran, give the model one hidden second try before the tripwire warning
// is added. The note below is sent only to the model; it is taken back out of
// the message list before the turn ends, so it never reaches chat history.

import { detectUnexecutedClaims } from './claimTripwire.js';
import { extractAgentMarkers } from './markers.js';
import { chatLog } from './chatLog.js';

export const CLAIM_RETRY_NOTE =
  'SYSTEM REJECTED: You said you performed an action, but no tool ran this turn. If the tool you need is not loaded, call get_tool or get_toolkit first, then run it now. If you cannot do it, say so plainly instead of claiming it.';

/**
 * Pure decision: retry only for a detected claim, on the first try, with the
 * CENSAI_CLAIM_RETRY switch not set to '0' (on by default).
 */
export function decideClaimRetry({ text, toolActions = [], retriesUsed = 0, env = process.env } = {}) {
  if (env?.CENSAI_CLAIM_RETRY === '0') return { retry: false, reason: 'disabled' };
  if (retriesUsed > 0) return { retry: false, reason: 'already_retried' };
  if (!detectUnexecutedClaims(text, toolActions)) return { retry: false, reason: 'no_claim' };
  // [REMEMBER: ...] style markers run tools after the loop, so the claim may come true.
  if (extractAgentMarkers(String(text || '')).markers.length > 0) return { retry: false, reason: 'markers' };
  return { retry: true, reason: 'unexecuted_claim' };
}

/**
 * The chat loop's side of the gate. `check` runs where the loop would stop on a
 * text reply and returns true when it should run one more round; `finish` runs
 * once after the loop, removes the hidden note and logs the outcome.
 */
export function createClaimRetry({ chatMessages, sendEvent, agentId = null, maxRounds = Infinity }) {
  let retriesUsed = 0;
  let note = null;
  let retryRound = null;
  let toolsBefore = 0;
  let claimedText = '';
  let awaitingRetry = false;

  return {
    /**
     * Wraps the next model call. If the retry call itself fails (a provider
     * hiccup, not a stop), answer with the first reply again so the person gets
     * today's warning instead of an error.
     */
    async guard(call, signal = null) {
      if (!awaitingRetry) return call;
      awaitingRetry = false;
      try {
        return await call;
      } catch (err) {
        if (signal?.aborted || err?.code === 'CHAT_ABORTED') throw err;
        chatLog.warn('claim_retry call failed', { agentId, round: retryRound });
        return { choices: [{ message: { role: 'assistant', content: claimedText } }] };
      }
    },
    check({ text, toolActions, round, toolsOn = true }) {
      // The retry round counts against the round limit; with none left (or tools
      // switched off for a synthesis pass) a retry could not run anything.
      if (!toolsOn || round >= maxRounds) return false;
      const decision = decideClaimRetry({ text, toolActions, retriesUsed });
      if (!decision.retry) return false;
      retriesUsed += 1;
      retryRound = round + 1;
      toolsBefore = toolActions.length;
      claimedText = String(text || '');
      awaitingRetry = true;
      note = { role: 'user', content: CLAIM_RETRY_NOTE };
      chatMessages.push({ role: 'assistant', content: claimedText }, note);
      sendEvent({ type: 'status', status: 'claim_retry' });
      return true;
    },
    finish(toolActions) {
      if (!note) return;
      const at = chatMessages.indexOf(note);
      if (at !== -1) chatMessages.splice(at, 1);
      chatLog.info('claim_retry', {
        agentId,
        round: retryRound,
        ranTools: toolActions.slice(toolsBefore).some(action => action?.ok !== false),
      });
      note = null;
    },
  };
}
