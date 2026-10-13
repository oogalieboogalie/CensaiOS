// src/lib/agentRegistry/wsClient.constants.js
//
// Reconnect/backoff timing constants used by the WS client lifecycle.
// Extracted so the lifecycle module stays under the 250-line size
// budget enforced by scripts/refactor-guards.mjs.

export const RECONNECT_STEPS_MS = [1000, 2000, 4000, 8000];
export const MAX_BACKOFF_MS = 30_000;
