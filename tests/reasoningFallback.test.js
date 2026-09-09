import {
  withReasoningContentFallback,
  normalizeToolCallArguments,
  describeChoiceShape,
} from '../server/routes/chat/reasoningFallback.js';

describe('reasoning model fallbacks', () => {
  test('uses reasoning_content when content is empty', () => {
    const msg = withReasoningContentFallback({
      content: '',
      reasoning_content: 'The answer is 42.',
    });
    expect(msg.content).toBe('The answer is 42.');
    expect(msg.reasoning_used_as_content).toBe(true);
  });

  test('leaves normal messages and tool calls alone', () => {
    const plain = { content: 'hi' };
    expect(withReasoningContentFallback(plain)).toBe(plain);
    const withTools = { content: '', tool_calls: [{ id: '1' }] };
    expect(withReasoningContentFallback(withTools)).toBe(withTools);
    expect(withReasoningContentFallback(null)).toBeNull();
  });

  test('accepts object tool arguments from strict providers', () => {
    expect(normalizeToolCallArguments({ path: 'a.md' })).toEqual({ path: 'a.md' });
    expect(normalizeToolCallArguments('{"path":"a.md"}')).toEqual({ path: 'a.md' });
    expect(normalizeToolCallArguments(undefined)).toEqual({});
    expect(() => normalizeToolCallArguments('{broken')).toThrow();
  });

  test('describes choice shapes without logging content', () => {
    const shape = describeChoiceShape({
      message: { content: '', reasoning_content: 'x'.repeat(10), tool_calls: null },
    });
    expect(shape).toMatchObject({
      hasChoice: true,
      content: '0 chars',
      reasoning_content: '10 chars',
      tool_calls: null,
    });
  });
});
