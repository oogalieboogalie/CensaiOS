// Mechanical truth layer for tool results. executeTool() catches every error
// and returns the string "Error: <msg>" to the model, and the chat loop's
// argument-validation path returns "Tool argument ..." strings — so success
// and failure are indistinguishable downstream unless the harness flags them.
// The harness, not the model, decides ok/failed; the UI and receipts consume
// that flag so a failed call can't be glossed over as success.
const TOOL_FAILURE_PATTERN = /^(Error:|Tool argument|APPROVAL_REQUIRED:|SECURITY VIOLATION:|Unknown tool:)/;

export function toolCallOk(result) {
  return !(typeof result === 'string' && TOOL_FAILURE_PATTERN.test(result));
}

// A call parked for a person's OK did not fail: it is waiting. Mark it on the
// summary (which already travels to the chat card, receipts and help cards)
// so the card reads "waiting for an OK" instead of a red "failed".
export function toolCallWaiting(result) {
  return typeof result === 'string' && result.startsWith('APPROVAL_REQUIRED:');
}

export function withWaitingFlag(summary, result) {
  return toolCallWaiting(result) ? { ...(summary || {}), waiting: true } : summary;
}
