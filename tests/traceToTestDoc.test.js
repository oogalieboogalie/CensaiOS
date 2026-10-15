import { traceToTestMarkdown } from '../src/components/tracing/traceToTestDoc.js';

describe('trace to test steps', () => {
  const trace = { id: 'tr-1', title: 'Find Austin listings', data: { agentId: 'atlas', status: 'failed' } };
  const events = [
    { event_type: 'agent.round', payload: { round: 1, modelConfig: { model: 'model-x' }, toolsAvailableCount: 4 } },
    { event_type: 'tool.invocation', payload: { toolName: 'web_search', ok: true, resultType: 'json' } },
    { event_type: 'tool.invocation', payload: { toolName: 'secret_tool', private: true } },
    { event_type: 'session.failure', payload: { failure: 'Model timed out' } },
  ];

  test('lists each recorded step in order with what passing looks like', () => {
    const md = traceToTestMarkdown(trace, events);
    expect(md).toContain('# Test: Find Austin listings');
    expect(md).toContain('1. Round 1: the agent thinks with model-x');
    expect(md).toContain('2. Calls `web_search`; it succeeds');
    expect(md).toContain('3. Calls `secret_tool` (private, details redacted).');
    expect(md).toContain('4. The run fails: Model timed out.');
    expect(md).toContain('- The agent calls `web_search`.');
    expect(md).toContain('this test fails until that problem is fixed');
  });

  test('a run with no steps still makes a readable document', () => {
    const md = traceToTestMarkdown({ id: 'tr-2' }, []);
    expect(md).toContain('No steps were recorded.');
    expect(md).not.toContain('undefined');
  });
});
