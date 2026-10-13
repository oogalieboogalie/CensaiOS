// How outside MCP tool calls show up: the chat's tool card names the tool and
// its server, the server summary carries both, and a helper agent's chat
// shows the tools it used while answering another agent.
import { describeToolEvent, outsideTool } from '../src/components/chat/toolActivity.js';
import { summarizeToolCall } from '../server/routes/chat/toolSummary.js';
import { helpRunTools } from '../server/agent-registry/helpRequestStore.js';
import { helperActivity, helperExchange } from '../src/lib/agentNetwork/useHelpCardSync.js';

test('tool cards name the outside tool and its server', () => {
  const summary = summarizeToolCall('mcp__weather__get_forecast', { city: 'Austin' });
  expect(summary).toEqual({ outsideServer: 'weather', outsideTool: 'get_forecast' });
  expect(describeToolEvent({ tool: 'mcp__weather__get_forecast', summary }, { past: true }))
    .toMatchObject({ label: 'Used get_forecast from weather', icon: 'Plug', outside: { server: 'weather', tool: 'get_forecast' } });
  expect(describeToolEvent({ tool: 'mcp__weather__get_forecast' })).toMatchObject({ label: 'Using get_forecast from weather' });
  expect(outsideTool('web_search', null)).toBeNull();
  expect(describeToolEvent({ tool: 'web_search', summary: { target: 'x' } }, { past: true }).label).toBe('Searched the web “x”');
});

test('help requests carry the helper tool calls to its chat', () => {
  expect(helpRunTools([{ tool: 'mcp__weather__get_forecast', ms: 6, ok: true, summary: { outsideServer: 'weather' }, result: 'secret' }, null, { ms: 1 }]))
    .toEqual([{ tool: 'mcp__weather__get_forecast', ms: 6, ok: true, summary: { outsideServer: 'weather' } }]);
  expect(helpRunTools(undefined)).toEqual([]);
  const card = { id: 'c1', status: 'completed', task: 'weather?', result: 'Sunny', fromLabel: 'Atlas', tools: [{ tool: 'mcp__weather__get_forecast', ms: 6, ok: true }] };
  const [, answer] = helperExchange(card, { agentId: 'atlas' });
  expect(answer.activity.tools).toEqual([{ name: 'mcp__weather__get_forecast', ms: 6, ok: true, summary: undefined }]);
  expect(helperActivity({ tools: [] })).toEqual({});
});
