import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A job Censai hands off does not end on one save that failed. With a real model
// a missed edit is common (the text it asked to replace is not in the file word
// for word). In chat that wraps the turn up, as it always did. On a job the model
// is told why, keeps its tools, reads the file again and tries once more; a model
// that keeps missing is still stopped after a few misses in a row.
//
// The chat loop, the edit and the file on disk here are the real ones; only the
// model is a stand-in that follows a script.
const callModel = jest.fn();

jest.unstable_mockModule('../server/tools.js', () => ({ executeTool: jest.fn(), TOOL_DEFINITIONS: [] }));
jest.unstable_mockModule('../server/routes/chat/modelRound.js', () => ({
  // The stand-in sees whether tools are still offered, and the last thing it was told.
  callWithRoomToAnswer: async ({ activeTools, includeTools, chatMessages }) => callModel({
    tools: includeTools ? activeTools.map((tool) => tool.function.name) : [],
    told: String(chatMessages[chatMessages.length - 1]?.content || ''),
  }),
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
const { shouldSynthesizeAfterToolBatch } = await import('../server/routes/chat/prompts.js');
const { turnLimits } = await import('../server/routes/chat/turnLimits.js');
const { JOB_ROUNDS } = await import('../server/censaiOrchestrator/shape.js');
const { projectEdit } = await import('../server/workspaces/edit.js');

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'job-retry-')));
const project = { id: 'tiny-sum', name: 'tiny-sum', path: tempRoot, repo: null };
const FILE = 'sum.js';
const BROKEN = 'export function sum(a, b) {\n  return a - b;\n}\n';
const onDisk = () => fs.readFileSync(path.join(tempRoot, FILE), 'utf8');
afterAll(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

const def = (name) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } });
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const reply = (message) => ({ choices: [{ finish_reason: message.tool_calls ? 'tool_calls' : 'stop', message: { role: 'assistant', content: '', ...message } }] });
const read = (id) => ({ tool_calls: [call(id, 'project_read', { path: FILE })] });
const edit = (id, old_string, new_string) => ({ tool_calls: [call(id, 'project_edit', { path: FILE, old_string, new_string })] });
const WRAPPED_UP = 'I could not finish the change.';

// The file tools the way the server runs them: the real edit on a real file, and a
// failure handed back as "Error: <why>" (executeTool in server/tools.js).
async function runTool(_agentId, name, args) {
  try {
    if (name === 'project_read') return onDisk();
    await projectEdit(project, args.path, args.old_string, args.new_string);
    return `Edited ${args.path} in ${project.name}.`;
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

/** Run one turn of the real chat loop on a script; returns what the model was offered and told each round. */
async function turn(script, rounds) {
  fs.writeFileSync(path.join(tempRoot, FILE), BROKEN);
  const steps = [...script];
  const seen = [];
  callModel.mockReset();
  callModel.mockImplementation(async (round) => {
    seen.push(round);
    // Once told to answer, no tools are offered: it can only write its answer.
    if (!round.tools.length) return reply({ content: WRAPPED_UP });
    return reply(steps.shift() || { content: 'Out of script.' });
  });
  const result = await runChatLoop({
    agentId: 'atlas',
    chatMessages: [{ role: 'system', content: 'You are Atlas.' }, { role: 'user', content: 'Make sum add.' }],
    toolsForCaller: [def('project_read'), def('project_edit')],
    reqModel: 'made-up-model',
    authorizationWorkspaceId: 'workspace-1',
    userId: 7,
    sendEvent: jest.fn(),
    timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
    runTool,
    ...(rounds ? { rounds } : {}),
  });
  const saves = result.toolActions.filter((action) => action.tool === 'project_edit');
  return { result, seen, saves, file: onDisk() };
}

// A first edit that misses (the model remembered the line wrongly), then a look, then the right edit.
const missThenFix = [
  edit('e1', 'return a + c;', 'return a + b;'),
  read('r1'),
  edit('e2', 'return a - b;', 'return a + b;'),
  { content: 'sum adds now.' },
];

describe('a save that fails on a job Censai handed off', () => {
  test('goes back to the model with the reason, it keeps its tools, reads the file again and the next save lands', async () => {
    const { result, seen, saves, file } = await turn(missThenFix, JOB_ROUNDS);
    // Round 2: it is told the save failed and why, and its tools are still there.
    expect(seen[1].told).toMatch(/^Error: old_string not found in sum\.js/);
    expect(seen[1].tools).toEqual(['project_read', 'project_edit']);
    // It read the file, the second save went through, and the file on disk is fixed.
    expect(saves.map((save) => save.ok)).toEqual([false, true]);
    expect(file).toContain('return a + b;');
    expect(result.finalText).toBe('sum adds now.');
  });

  test('a model that keeps missing is stopped after 3 failed saves in a row, with looks in between', async () => {
    const stuck = [1, 2, 3, 4, 5, 6].flatMap((n) => [edit(`e${n}`, `not in the file ${n}`, 'x'), read(`r${n}`)]);
    const { result, seen, saves, file } = await turn(stuck, JOB_ROUNDS);
    expect(saves.map((save) => save.ok)).toEqual([false, false, false]);
    expect(seen[seen.length - 1].tools).toEqual([]);
    expect(result.finalText).toBe(WRAPPED_UP);
    expect(file).toBe(BROKEN);
  });

  test('a good save in between starts the count again, so a job that misses now and then still finishes', async () => {
    const bumpy = [
      edit('e1', 'nope 1', 'x'), edit('e2', 'nope 2', 'x'),
      edit('e3', 'return a - b;', 'return a * b;'),
      edit('e4', 'nope 3', 'x'), edit('e5', 'nope 4', 'x'),
      edit('e6', 'return a * b;', 'return a + b;'),
      { content: 'sum adds now.' },
    ];
    const { result, saves, file } = await turn(bumpy, JOB_ROUNDS);
    expect(saves.map((save) => save.ok)).toEqual([false, false, true, false, false, true]);
    expect(file).toContain('return a + b;');
    expect(result.finalText).toBe('sum adds now.');
  });

  test('the very same save sent again is still stopped at once (a model stuck in a loop)', async () => {
    const loop = [edit('e1', 'nope', 'x'), edit('e2', 'nope', 'x'), edit('e3', 'nope', 'x')];
    const { result, saves } = await turn(loop, JOB_ROUNDS);
    expect(saves).toHaveLength(2);
    expect(result.finalText).toBe(WRAPPED_UP);
  });

  test('the job\'s limit on saves still holds, failed ones counted', async () => {
    // Miss, miss, land, over and over: never 3 misses in a row, so only the limit on saves stops it.
    const endless = Array.from({ length: 30 }, (_, n) => (n % 3 === 2
      ? edit(`e${n}`, n === 2 ? 'return a - b;' : `return ${n - 3};`, `return ${n};`)
      : edit(`e${n}`, `nope ${n}`, 'x')));
    const { result, saves } = await turn(endless, JOB_ROUNDS);
    expect(saves).toHaveLength(JOB_ROUNDS.maxWrites);
    expect(result.finalText).toBe(WRAPPED_UP);
  });

  test('a save that is waiting for a person\'s OK still wraps a job up at once: trying again cannot change it', () => {
    const parked = { tool: 'project_write', args: { path: FILE, content: 'x' }, ok: false, result: 'APPROVAL_REQUIRED: ap-1 is pending owner/admin review. No action was executed.' };
    expect(shouldSynthesizeAfterToolBatch([parked], 1, turnLimits(JOB_ROUNDS))).toBe(true);
    expect(shouldSynthesizeAfterToolBatch([{ ...parked, result: 'Error: old_string not found in sum.js' }], 1, turnLimits(JOB_ROUNDS))).toBe(false);
  });
});

describe('a save that fails in an ordinary chat turn', () => {
  test('wraps the turn up at once, as before: no more tools, nothing retried', async () => {
    const { result, seen, saves, file } = await turn(missThenFix, null);
    expect(seen).toHaveLength(2);
    expect(seen[1].tools).toEqual([]);
    expect(saves.map((save) => save.ok)).toEqual([false]);
    expect(file).toBe(BROKEN);
    expect(result.finalText).toBe(WRAPPED_UP);
  });

  test('one failed save anywhere in the turn is enough, even with a good one after it in the same round', () => {
    const save = (n, ok) => ({ tool: 'project_edit', args: { path: FILE, old_string: `a${n}`, new_string: 'b' }, ok });
    expect(shouldSynthesizeAfterToolBatch([save(1, false), save(2, true)], 1)).toBe(true);
    expect(shouldSynthesizeAfterToolBatch([save(1, false), save(2, true)], 1, turnLimits())).toBe(true);
    // The same two saves on a job: it goes on.
    expect(shouldSynthesizeAfterToolBatch([save(1, false), save(2, true)], 1, turnLimits(JOB_ROUNDS))).toBe(false);
  });

  test('nobody can ask for a smaller limit than chat\'s', () => {
    expect(turnLimits().maxFailedWrites).toBe(1);
    expect(turnLimits({ maxFailedWrites: 0 }).maxFailedWrites).toBe(1);
    expect(turnLimits({ maxFailedWrites: -5 }).maxFailedWrites).toBe(1);
    expect(turnLimits(JOB_ROUNDS).maxFailedWrites).toBe(3);
  });
});
