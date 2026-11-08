import { jest } from '@jest/globals';
import { runToolCalls } from '../server/routes/chat/toolRound.js';

// A model can send "null" (or another non-object) as a tool's arguments.
// That must come back to the model as a fixable argument error, not crash the chat.
function round(rawArgs, runTool) {
  const chatMessages = [{ role: 'user', content: 'hi' }];
  const toolActions = [];
  const run = runToolCalls([{ id: 'c1', function: { name: 'list_things', arguments: rawArgs } }], {
    agentId: 'helper', userId: 'u1', reqModel: 'm', runTool, toolContext: {},
    toolSession: { observe() {} },
    toolsForCaller: [{ function: { name: 'list_things', parameters: {} } }],
    chatMessages, sendEvent() {}, timings: { tool_ms: 0, tool_calls: [] }, toolActions, round: 1,
  });
  return { run, chatMessages };
}

describe('tool round with odd arguments', () => {
  test('"null" arguments run the tool with no arguments', async () => {
    const seen = [];
    const { run, chatMessages } = round('null', async (_a, _n, args) => { seen.push(args); return 'ok'; });
    await expect(run).resolves.toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(chatMessages.at(-1)).toMatchObject({ role: 'tool', content: 'ok' });
  });

  test('non-object arguments come back to the model as an error', async () => {
    const runTool = jest.fn();
    const { run, chatMessages } = round('"just text"', runTool);
    await expect(run).resolves.toBeUndefined();
    expect(runTool).not.toHaveBeenCalled();
    expect(chatMessages.at(-1).content).toMatch(/argument/i);
  });
});
