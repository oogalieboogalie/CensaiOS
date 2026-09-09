import { jest } from '@jest/globals';
import { extractAgentMarkers, processAgentMarkers } from '../server/routes/chat/markers.js';

describe('agent response marker parsing', () => {
  test('strips MiniMax-style memory and feeling markers from visible text', () => {
    const input = [
      'Good to know it was a model fallback issue, not a backend problem.',
      '[REMEMBER: "fetch failed" errors from agents can indicate silent model fallback to Ollama when the primary model is unreachable.]',
      '[FEELING: focused, standing by]',
      'Backend is healthy.',
    ].join('\n');

    const result = extractAgentMarkers(input);

    expect(result.text).toBe([
      'Good to know it was a model fallback issue, not a backend problem.',
      'Backend is healthy.',
    ].join('\n'));
    expect(result.markers).toEqual([
      expect.objectContaining({
        tool: 'remember',
        args: { content: '"fetch failed" errors from agents can indicate silent model fallback to Ollama when the primary model is unreachable.' },
        valid: true,
      }),
      expect.objectContaining({
        tool: 'feeling',
        args: { emotion: 'focused, standing by' },
        valid: true,
      }),
    ]);
  });

  test('executes valid markers and reports actions for the UI', async () => {
    const executeTool = jest.fn(async (_agentId, tool, args) => `${tool}:${Object.keys(args).join(',')}`);

    const result = await processAgentMarkers(
      'atlas',
      'Done.\n[REMEMBER_IMPORTANT: primary model routing must be checked before backend debugging]\n[FEELING: focused]',
      executeTool,
    );

    expect(result.text).toBe('Done.');
    expect(executeTool).toHaveBeenNthCalledWith(1, 'atlas', 'remember_important', {
      content: 'primary model routing must be checked before backend debugging',
    });
    expect(executeTool).toHaveBeenNthCalledWith(2, 'atlas', 'feeling', {
      emotion: 'focused',
    });
    expect(result.actions.map(action => action.tool)).toEqual(['remember_important', 'feeling']);
  });

  test('parses structured marker forms', () => {
    const result = extractAgentMarkers([
      '[KNOW: Censai Hub | uses | PostgreSQL]',
      '[NUGGET: Model routing | Check actual provider before chasing fetch failed]',
      '[ASSOCIATE: model fallback <-> fetch failed]',
      '[MESSAGE_TO:atlas: check provider routing]',
    ].join('\n'));

    expect(result.markers.map(marker => marker.args)).toEqual([
      { subject: 'Censai Hub', predicate: 'uses', object: 'PostgreSQL' },
      { title: 'Model routing', content: 'Check actual provider before chasing fetch failed' },
      { concept_a: 'model fallback', concept_b: 'fetch failed' },
      { agent: 'atlas', content: 'check provider routing' },
    ]);
  });
});
