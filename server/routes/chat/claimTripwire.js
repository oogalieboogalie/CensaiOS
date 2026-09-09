export const UNEXECUTED_CLAIM_WARNING =
  '⚠ No tools were actually executed this turn — the actions described above did not happen.';

const CLAIM_PATTERNS = [
  /\bI(?:'ve| have|ve)?\s+(?:created|sent|dispatched|queued|submitted|updated|deleted|committed|scheduled|saved|wrote)\b/i,
  /\b(?:task|message|sub-?agent|file|memory)\s+(?:has been|was|is now)\s+(?:created|sent|queued|updated|saved)\b/i,
];

const FAILURE_CONTEXT_PATTERN = /\b(?:I was unable|failed|did not|didn't|unable to)\b/i;

export function detectUnexecutedClaims(finalText, toolActions = []) {
  if (Array.isArray(toolActions) && toolActions.some(action => action?.ok !== false)) return null;

  const text = String(finalText || '');
  if (!text.trim()) return null;
  if (FAILURE_CONTEXT_PATTERN.test(text)) return null;

  return CLAIM_PATTERNS.some(pattern => pattern.test(text))
    ? UNEXECUTED_CLAIM_WARNING
    : null;
}
