// How long one agent turn may keep calling tools before it is told to answer.
// A chat turn answers soon; a job Censai hands off passes bigger limits
// (JOB_ROUNDS in server/censaiOrchestrator/shape.js): it reads, changes and
// tests several files first. A caller can only widen them, never shrink them.

import { MAX_CHAT_MODEL_ROUNDS, FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS } from './shared.js';

export const MAX_PROJECT_WRITES_PER_TURN = 4;
// Failed saves in a row (no good save in between) that wrap the turn up. In chat
// the first one does. A job passes more: a missed edit is told why, and tries again.
export const MAX_FAILED_WRITES_IN_A_ROW = 1;
const MOST_ROUNDS = 40;
// Asked to answer when less than this is left before the turn's deadline: room for one more model call.
export const ANSWER_ROOM_MS = 2 * 60 * 1000;

/** The turn's limits: chat's own, or the bigger ones a caller passes, kept in range. */
export function turnLimits(rounds = null) {
  const max = Math.min(MOST_ROUNDS, Math.max(MAX_CHAT_MODEL_ROUNDS, Number(rounds?.max) || 0));
  const forceAfter = Math.min(max - 1, Math.max(FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS, Number(rounds?.forceAfter) || 0));
  const maxWrites = Math.max(MAX_PROJECT_WRITES_PER_TURN, Number(rounds?.maxWrites) || 0);
  const maxFailedWrites = Math.max(MAX_FAILED_WRITES_IN_A_ROW, Number(rounds?.maxFailedWrites) || 0);
  const deadline = Number(rounds?.deadline) > 0 ? Number(rounds.deadline) : null;
  return { max, forceAfter, maxWrites, maxFailedWrites, deadline };
}

/**
 * True when the turn should answer now to beat its deadline (a clock it would otherwise be
 * killed by, with no answer). Going on costs one more tool round and then the answer round,
 * each as long as the slowest round so far (at least two minutes), so both must still fit.
 */
export function nearDeadline(limits, now = Date.now(), slowestRoundMs = 0) {
  return Boolean(limits?.deadline) && now >= limits.deadline - 2 * Math.max(ANSWER_ROOM_MS, slowestRoundMs);
}
