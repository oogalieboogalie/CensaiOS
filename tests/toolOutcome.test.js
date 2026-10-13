import { toolCallOk } from '../server/routes/chat/toolOutcome.js';

// The model-facing contract this is built on: executeTool() catches all errors
// and returns "Error: <msg>"; chatExecution's argError path returns
// "Tool argument parse error ..." / "Tool argument validation error ..." strings.
describe('toolCallOk', () => {
  test('flags executeTool error strings as failures', () => {
    expect(toolCallOk('Error: MAILCOW_URL not configured')).toBe(false);
    expect(toolCallOk('Error: fetch failed')).toBe(false);
  });

  test('flags argument parse and validation errors as failures', () => {
    expect(toolCallOk('Tool argument parse error: Unexpected token } in JSON')).toBe(false);
    expect(toolCallOk('Tool argument validation error: missing required path. Call project_read again with the required arguments.')).toBe(false);
  });

  test('flags pending approval and security receipts as non-execution', () => {
    expect(toolCallOk('APPROVAL_REQUIRED: approval-1 is pending. No action was executed.')).toBe(false);
    expect(toolCallOk('SECURITY VIOLATION: forbidden path')).toBe(false);
    expect(toolCallOk('Unknown tool: imaginary')).toBe(false);
  });

  test('passes normal string results', () => {
    expect(toolCallOk('File written successfully.')).toBe(true);
    expect(toolCallOk('')).toBe(true);
    expect(toolCallOk('[private]')).toBe(true);
  });

  test('only a leading match counts — mid-string mentions are fine', () => {
    expect(toolCallOk('Build log: Error: none found')).toBe(true);
    expect(toolCallOk('Tool argument docs were updated')).toBe(false); // any leading "Tool argument" trips it, by design
    expect(toolCallOk(' a Tool argument mention later')).toBe(true);
  });

  test('passes non-string results untouched', () => {
    expect(toolCallOk({ ok: false })).toBe(true); // objects are real results, not error strings
    expect(toolCallOk(undefined)).toBe(true);
    expect(toolCallOk(null)).toBe(true);
  });
});
