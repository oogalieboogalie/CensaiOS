import {
  chatMessagesToResponsesInput,
  chatToolsToResponsesTools,
  isResponsesModel,
  normalizeReasoningEffort,
  normalizeResponsesResponse,
} from '../server/aiGateway/responsesClient.js';

describe('responsesClient', () => {
  test('routes only known opencode responses models', () => {
    expect(isResponsesModel('opencode', 'muse-spark-1.3-contributor-free')).toBe(true);
    expect(isResponsesModel('opencode', 'nemotron-3-ultra-free')).toBe(false);
    expect(isResponsesModel('google', 'muse-spark-1.3-contributor-free')).toBe(false);
  });

  test('maps chat messages incl. tool round-trip', () => {
    const input = chatMessagesToResponsesInput([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'checking', tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{"a":1}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'done' },
    ]);
    expect(input[0]).toMatchObject({ role: 'system' });
    expect(input[3]).toMatchObject({ type: 'function_call', call_id: 'c1', name: 't' });
    expect(input[4]).toMatchObject({ type: 'function_call_output', call_id: 'c1', output: 'done' });
  });

  test('normalizes reasoning effort without capping', () => {
    expect(normalizeReasoningEffort('extra high')).toBe('xhigh');
    expect(normalizeReasoningEffort('LOW')).toBe('low');
    expect(normalizeReasoningEffort('default')).toBeUndefined();
    expect(normalizeReasoningEffort(undefined)).toBeUndefined();
    expect(normalizeReasoningEffort('silly')).toBeUndefined();
  });

  test('normalizes text + function calls to chat shape', () => {
    const out = normalizeResponsesResponse({
      id: 'resp_1',
      model: 'muse-spark-1.3-contributor-free',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: 'on it' }] },
        { type: 'function_call', call_id: 'call_9', name: 'get_time', arguments: '{"city":"Paris"}' },
      ],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }, 'muse-spark-1.3-contributor-free');
    expect(out.choices[0].message.content).toBe('on it');
    expect(out.choices[0].message.tool_calls[0]).toMatchObject({
      id: 'call_9', function: { name: 'get_time' },
    });
    expect(out.choices[0].finish_reason).toBe('tool_calls');
    expect(out.usage).toMatchObject({ prompt_tokens: 10, completion_tokens: 20 });
  });
});
