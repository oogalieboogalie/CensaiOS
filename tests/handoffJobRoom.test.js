import { jest } from '@jest/globals';

// A job Censai hands off reads, changes and tests several files before it answers.
// A chat turn is told "answer now, no more tools" after 6 rounds of tools and after
// 4 saves, so a family member on a five-file job read the files and was stopped
// before it changed any (diagram 11: "Genesis only looked at the files"). A job
// passes JOB_ROUNDS and gets the room; a chat turn keeps its own limits.
const callModel = jest.fn();

jest.unstable_mockModule('../server/tools.js', () => ({ executeTool: jest.fn(), TOOL_DEFINITIONS: [] }));
// The model is the stand-in below: it sees whether tools are still offered this round.
jest.unstable_mockModule('../server/routes/chat/modelRound.js', () => ({
  callWithRoomToAnswer: async ({ activeTools, includeTools }) => callModel({ body: { tools: includeTools ? activeTools : [] } }),
  callChatModelRound: jest.fn(),
  chatModelAccessContext: () => ({}),
  CHAT_MAX_TOKENS: 4096,
  ROOMY_MAX_TOKENS: 16384,
  ranOutBeforeWriting: () => false,
  modelTokens: () => ({}),
  forwardDeltas: () => () => {},
  throwIfChatAborted: () => {},
}));

const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');
const { turnLimits } = await import('../server/routes/chat/turnLimits.js');
const { JOB_ROUNDS } = await import('../server/censaiOrchestrator/shape.js');

const FILES = ['FilesWindow.jsx', 'WindowProjectChip.jsx', 'FileControls.jsx', 'Tree.jsx', 'ProjectVersions.jsx'];
const def = (name) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } });
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const reply = (message) => ({ choices: [{ finish_reason: message.tool_calls ? 'tool_calls' : 'stop', message: { role: 'assistant', content: '', ...message } }] });

// The model the way a careful one works a five-file job: one look per round, then one edit per round.
function fiveFileJob() {
  const steps = [
    ...FILES.map((file, i) => ({ tool_calls: [call(`read-${i}`, 'project_read', { path: file })] })),
    ...FILES.map((file, i) => ({ tool_calls: [call(`edit-${i}`, 'project_edit', { path: file, old_string: 'a', new_string: `b${i}` })] })),
    { content: 'Changed all five files.' },
  ];
  callModel.mockReset();
  callModel.mockImplementation(async ({ body }) => {
    // Once told to answer, no tools are offered: it can only write its answer.
    if (!body.tools?.length) return reply({ content: 'I looked at the files.' });
    return reply(steps.shift() || { content: 'Changed all five files.' });
  });
}

async function run(rounds, { now } = {}) {
  const runTool = jest.fn(async (_agentId, name) => ({ ok: true, result: `${name} done` }));
  const result = await runChatLoop({
    agentId: 'genesis',
    chatMessages: [{ role: 'system', content: 'You are Genesis.' }, { role: 'user', content: 'Update the five File Tree files.' }],
    toolsForCaller: [def('project_read'), def('project_edit')],
    reqModel: 'made-up-model',
    authorizationWorkspaceId: 'workspace-1',
    userId: 7,
    sendEvent: jest.fn(),
    timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
    runTool,
    ...(rounds ? { rounds } : {}),
    ...(now ? { now } : {}),
  });
  const edits = runTool.mock.calls.filter(([, name]) => name === 'project_edit').length;
  return { result, edits };
}

describe('a job handed off by Censai has room to finish', () => {
  test('with the job\'s limits, all five files are read and all five changed', async () => {
    fiveFileJob();
    const { result, edits } = await run(JOB_ROUNDS);
    expect(edits).toBe(5);
    expect(result.finalText).toBe('Changed all five files.');
  });

  test('with chat\'s limits, the same job is stopped before it changes everything (why the job needs its own)', async () => {
    fiveFileJob();
    const { result, edits } = await run(null);
    expect(edits).toBeLessThan(5);
    expect(result.finalText).toBe('I looked at the files.');
  });
});

describe('a job on a slow model', () => {
  test('is asked to answer while it still has time, so its clock never cuts it off with nothing', async () => {
    fiveFileJob();
    // Each round takes 3 minutes on this clock; the job has 20.
    let clock = 0;
    const step = callModel.getMockImplementation();
    callModel.mockImplementation(async (args) => { clock += 3 * 60 * 1000; return step(args); });
    const { result } = await run({ ...JOB_ROUNDS, deadline: 20 * 60 * 1000 }, { now: () => clock });
    // Five rounds of work fit, then the answer, all inside the 20 minutes: a real answer, not a cut-off.
    expect(callModel).toHaveBeenCalledTimes(6);
    expect(result.finalText).toBe('I looked at the files.');
    expect(clock).toBeLessThanOrEqual(20 * 60 * 1000);
  });

  test('the time check leaves room for one more round and the answer after it', async () => {
    const { nearDeadline } = await import('../server/routes/chat/turnLimits.js');
    const limits = { deadline: 20 * 60 * 1000 };
    expect(nearDeadline(limits, 15 * 60 * 1000, 2 * 60 * 1000)).toBe(false);
    expect(nearDeadline(limits, 16 * 60 * 1000, 2 * 60 * 1000)).toBe(true);
    expect(nearDeadline(limits, 13 * 60 * 1000, 3 * 60 * 1000)).toBe(false);
    expect(nearDeadline(limits, 14 * 60 * 1000, 3 * 60 * 1000)).toBe(true);
    expect(nearDeadline({ deadline: null }, 99 * 60 * 1000, 0)).toBe(false);
  });
});

describe('turnLimits', () => {
  test('chat keeps its own limits when nothing is passed', () => {
    expect(turnLimits()).toEqual({ max: 10, forceAfter: 6, maxWrites: 4, maxFailedWrites: 1, deadline: null });
  });

  test('a job gets its bigger limits, and the answer round always fits', () => {
    expect(turnLimits(JOB_ROUNDS)).toEqual({ max: 30, forceAfter: 28, maxWrites: 16, maxFailedWrites: 3, deadline: null });
    expect(turnLimits({ max: 12, forceAfter: 50 }).forceAfter).toBe(11);
  });

  test('a caller can only widen the limits, never shrink them, and never past 40 rounds', () => {
    expect(turnLimits({ max: 2, forceAfter: 1, maxWrites: 1, maxFailedWrites: 0 })).toEqual({ max: 10, forceAfter: 6, maxWrites: 4, maxFailedWrites: 1, deadline: null });
    expect(turnLimits({ max: 999 }).max).toBe(40);
    expect(turnLimits({ max: 'lots' })).toEqual({ max: 10, forceAfter: 6, maxWrites: 4, maxFailedWrites: 1, deadline: null });
  });
});
