import { jest } from '@jest/globals';
import { summarizeToolCall } from '../server/routes/chat/toolSummary.js';
import { processAgentMarkers } from '../server/routes/chat/markers.js';

describe('summarizeToolCall', () => {
  test('project_edit reports path with added/removed line counts', () => {
    expect(summarizeToolCall('project_edit', {
      path: 'src/components/files/Tree.jsx',
      old_string: 'a\nb\nc\nd\ne',
      new_string: 'a\nb',
    })).toEqual({ path: 'src/components/files/Tree.jsx', added: 2, removed: 5 });
  });

  test('project_multi_edit aggregates across files', () => {
    const summary = summarizeToolCall('project_multi_edit', {
      edits: [
        { path: 'a.js', old_string: 'one', new_string: 'one\ntwo' },
        { path: 'b.js', old_string: 'x\ny', new_string: 'z' },
        { path: 'a.js', old_string: 'q', new_string: 'q2' },
      ],
    });
    expect(summary).toEqual({ path: 'a.js', files: 2, added: 4, removed: 4 });
  });

  test('write tools report added lines only', () => {
    expect(summarizeToolCall('project_write', { path: 'notes.md', content: 'l1\nl2\nl3' }))
      .toEqual({ path: 'notes.md', added: 3 });
    expect(summarizeToolCall('local_write_file', { file_path: 'C:/tmp/x.txt', content: 'one line' }))
      .toEqual({ path: 'C:/tmp/x.txt', added: 1 });
  });

  test('read and search tools surface their target', () => {
    expect(summarizeToolCall('local_read_file', { file_path: 'server.js' })).toEqual({ path: 'server.js' });
    expect(summarizeToolCall('web_search', { query: 'qdrant healthcheck' })).toEqual({ target: 'qdrant healthcheck' });
    expect(summarizeToolCall('message_to', { agent: 'atlas', content: 'hi' })).toEqual({ target: 'atlas' });
  });

  test('clips very long targets', () => {
    const summary = summarizeToolCall('web_search', { query: 'q'.repeat(200) });
    expect(summary.target.length).toBeLessThanOrEqual(81);
    expect(summary.target.endsWith('…')).toBe(true);
  });

  test('unknown tools and empty args yield null', () => {
    expect(summarizeToolCall('feeling', { emotion: 'calm' })).toBeNull();
    expect(summarizeToolCall('project_edit', {})).toBeNull();
    expect(summarizeToolCall('project_multi_edit', { edits: [] })).toBeNull();
  });
});

describe('marker processing streams live status events', () => {
  test('emits calling/completed pairs with summaries and keeps private tools redacted', async () => {
    const executeTool = jest.fn(async () => 'ok');
    const events = [];

    const result = await processAgentMarkers(
      'atlas',
      'Done.\n[RECALL: deployment history]\n[JOURNAL: private thought]',
      executeTool,
      (event) => events.push(event),
    );

    expect(result.actions.map(a => a.tool)).toEqual(['recall', 'journal']);
    expect(events.map(e => e.status)).toEqual([
      'calling_tool', 'completed_tool', 'calling_tool', 'completed_tool',
    ]);

    const [recallStart, recallDone, journalStart, journalDone] = events;
    expect(recallStart.detail).toMatchObject({ tool: 'recall', phase: 'marker', summary: { target: 'deployment history' } });
    expect(recallDone.detail.tool).toBe('recall');
    expect(typeof recallDone.detail.ms).toBe('number');

    // Journal is private: no args, no summary leak.
    expect(journalStart.detail.args).toEqual({});
    expect(journalStart.detail.summary).toBeUndefined();
    expect(journalDone.detail.summary).toBeUndefined();
    expect(result.actions[1].result).toBe('[private]');
  });

  test('works without a sendEvent callback (back-compat)', async () => {
    const executeTool = jest.fn(async () => 'ok');
    const result = await processAgentMarkers('atlas', '[FEELING: focused]', executeTool);
    expect(result.actions).toHaveLength(1);
  });
});
