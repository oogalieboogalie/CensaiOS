// The chat "Knowledge" toggle: before a message goes out, pull the board's
// best-matching saved passages and slip them in as a system note just ahead
// of the person's turn, numbered so the reply can cite [1], [2].

import { researchApi } from './researchApi.js';

/**
 * @returns {Promise<{ msgs: Array, sources: Array }>} msgs unchanged and no
 *   sources when the toggle is off, nothing matches or the lookup fails.
 */
export async function withBoardKnowledge(payloadMsgs, question, { enabled, workspaceId } = {}) {
  const text = String(question || '').trim();
  if (!enabled || !text || !payloadMsgs.length) return { msgs: payloadMsgs, sources: [] };
  try {
    const data = await researchApi.query({ query: text, k: 6, asPrompt: true, workspaceId });
    if (!data?.prompt) return { msgs: payloadMsgs, sources: [] };
    const head = payloadMsgs.slice(0, -1);
    const last = payloadMsgs[payloadMsgs.length - 1];
    return { msgs: [...head, { from: 'system', text: data.prompt }, last], sources: data.sources || [] };
  } catch {
    return { msgs: payloadMsgs, sources: [] };
  }
}
