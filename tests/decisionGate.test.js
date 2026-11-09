import { jest } from '@jest/globals';

const executeTool = jest.fn(async () => 'CAD model updated: 1 part changed');

jest.unstable_mockModule('../server/tools.js', () => ({
  executeTool,
  TOOL_DEFINITIONS: [],
  filterToolsForAgent: jest.fn(async () => []),
  listToolCatalog: jest.fn(() => []),
}));

const { decideClaimRetry, CLAIM_RETRY_NOTE } = await import('../server/routes/chat/decisionGate.js');
const { UNEXECUTED_CLAIM_WARNING } = await import('../server/routes/chat/claimTripwire.js');
const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');

const originalFetch = global.fetch;
const CLAIM = 'I have updated your CAD model.';

function modelTurn(message) {
  return { ok: true, json: async () => ({ choices: [{ message }] }) };
}

function toolDef(name) {
  return { type: 'function', function: { name, parameters: { type: 'object', properties: {} } } };
}

function sentMessages(call) {
  return JSON.parse(call[1].body).messages;
}

async function runLoop(chatMessages, events) {
  return runChatLoop({
    agentId: 'atlas',
    windowId: 'w1',
    chatMessages,
    toolsForCaller: [toolDef('cad_update')],
    reqModel: 'test-model',
    reqBaseUrl: 'http://stub',
    reqApiKey: 'k',
    sendEvent: event => events.push(event),
    timings: { total_ms: 0, setup_ms: 0, model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
  });
}

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
  delete process.env.CENSAI_CLAIM_RETRY;
});

describe('decideClaimRetry', () => {
  test('claim with no tools run -> retry', () => {
    expect(decideClaimRetry({ text: CLAIM, toolActions: [], retriesUsed: 0, env: {} }))
      .toEqual({ retry: true, reason: 'unexecuted_claim' });
  });

  test('claim with a tool that ran -> no retry', () => {
    expect(decideClaimRetry({ text: CLAIM, toolActions: [{ tool: 'cad_update', ok: true }], env: {} }).retry).toBe(false);
  });

  test('failure wording -> no retry', () => {
    expect(decideClaimRetry({ text: 'I tried to update your CAD model but failed.', toolActions: [], env: {} }).retry).toBe(false);
  });

  test('second try already used -> no retry', () => {
    expect(decideClaimRetry({ text: CLAIM, toolActions: [], retriesUsed: 1, env: {} }))
      .toEqual({ retry: false, reason: 'already_retried' });
  });

  test('CENSAI_CLAIM_RETRY=0 -> no retry', () => {
    expect(decideClaimRetry({ text: CLAIM, toolActions: [], env: { CENSAI_CLAIM_RETRY: '0' } }))
      .toEqual({ retry: false, reason: 'disabled' });
  });

  test('reads the switch from process.env by default', () => {
    process.env.CENSAI_CLAIM_RETRY = '0';
    expect(decideClaimRetry({ text: CLAIM, toolActions: [] }).retry).toBe(false);
  });

  test('a reply carrying a marker that will run a tool -> no retry', () => {
    expect(decideClaimRetry({ text: `I have saved it. [REMEMBER: likes blue]`, toolActions: [], env: {} }).reason).toBe('markers');
  });
});

describe('runChatLoop claim retry', () => {
  test('claims on round 1, runs the tool on round 2: no warning, note never saved', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(modelTurn({ role: 'assistant', content: CLAIM }))
      .mockResolvedValueOnce(modelTurn({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', function: { name: 'cad_update', arguments: '{}' } }],
      }))
      .mockResolvedValue(modelTurn({ role: 'assistant', content: 'Done: one part changed in your CAD model.' }));
    const events = [];
    const chatMessages = [{ role: 'user', content: 'make the bracket thicker' }];

    const { finalText, toolActions } = await runLoop(chatMessages, events);

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(toolActions.map(a => a.tool)).toEqual(['cad_update']);
    expect(finalText).not.toContain(UNEXECUTED_CLAIM_WARNING);
    expect(finalText).toBe('Done: one part changed in your CAD model.');
    expect(events.filter(e => e.status === 'claim_retry')).toHaveLength(1);
    expect(events.some(e => e.status === 'unexecuted_claim')).toBe(false);

    // The model saw the hidden note on the retry round ...
    const retryRound = sentMessages(global.fetch.mock.calls[1]);
    expect(retryRound.at(-1)).toEqual({ role: 'user', content: CLAIM_RETRY_NOTE });
    expect(retryRound.at(-2)).toEqual({ role: 'assistant', content: CLAIM });
    // ... but it is gone from the messages and the answer once the turn ends.
    expect(JSON.stringify(chatMessages)).not.toContain('SYSTEM REJECTED');
    expect(finalText).not.toContain('SYSTEM REJECTED');
  });

  test('claims twice: falls back to the warning, shown once', async () => {
    global.fetch = jest.fn().mockResolvedValue(modelTurn({ role: 'assistant', content: CLAIM }));
    const events = [];
    const chatMessages = [{ role: 'user', content: 'make the bracket thicker' }];

    const { finalText, toolActions } = await runLoop(chatMessages, events);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(toolActions).toEqual([]);
    expect(finalText).toBe(`${CLAIM}\n\n${UNEXECUTED_CLAIM_WARNING}`);
    expect(finalText.split(UNEXECUTED_CLAIM_WARNING)).toHaveLength(2);
    expect(events.filter(e => e.status === 'claim_retry')).toHaveLength(1);
    expect(events.filter(e => e.status === 'unexecuted_claim')).toHaveLength(1);
    expect(JSON.stringify(chatMessages)).not.toContain('SYSTEM REJECTED');
  });

  test('a failed retry call falls back to the first reply and the warning', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(modelTurn({ role: 'assistant', content: CLAIM }))
      .mockRejectedValueOnce(new Error('provider down'));
    const events = [];

    const { finalText } = await runLoop([{ role: 'user', content: 'make the bracket thicker' }], events);

    expect(finalText).toBe(`${CLAIM}\n\n${UNEXECUTED_CLAIM_WARNING}`);
    expect(events.filter(e => e.status === 'unexecuted_claim')).toHaveLength(1);
  });

  test('switched off: one model call and today\'s warning', async () => {
    process.env.CENSAI_CLAIM_RETRY = '0';
    global.fetch = jest.fn().mockResolvedValue(modelTurn({ role: 'assistant', content: CLAIM }));
    const events = [];

    const { finalText } = await runLoop([{ role: 'user', content: 'make the bracket thicker' }], events);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(finalText).toBe(`${CLAIM}\n\n${UNEXECUTED_CLAIM_WARNING}`);
    expect(events.some(e => e.status === 'claim_retry')).toBe(false);
  });
});
