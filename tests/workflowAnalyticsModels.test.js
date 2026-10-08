import { DEFAULT_WORKFLOW, moveStep, previousOutput, stepPrompt, workflowSteps } from '../src/components/workflow/workflowModel.js';
import { formatDuration, summarizeCanvas, summarizeTasks } from '../src/components/analytics/analyticsModel.js';

describe('workflow model', () => {
  test('a new window uses the default steps', () => {
    expect(workflowSteps({})).toBe(DEFAULT_WORKFLOW.steps);
    expect(workflowSteps({ steps: [] })).toEqual([]);
  });

  test('moveStep swaps neighbours and ignores moves off the ends', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveStep(steps, 1, -1).map(s => s.id)).toEqual(['b', 'a', 'c']);
    expect(moveStep(steps, 0, -1)).toBe(steps);
    expect(moveStep(steps, 2, 1)).toBe(steps);
  });

  test('each agent step gets the most recent earlier output, skipping review steps', () => {
    const steps = [{ id: 'a' }, { id: 'review', kind: 'review' }, { id: 'c' }];
    expect(previousOutput(steps, { a: 'outline' }, 2)).toBe('outline');
    expect(previousOutput(steps, {}, 2)).toBe('');
    const prompt = stepPrompt({ workflowTitle: 'News', step: { title: 'Layout', instructions: 'Polish it.' }, previousOutput: 'outline' });
    expect(prompt).toContain('"News"');
    expect(prompt).toContain('Polish it.');
    expect(prompt).toContain('outline');
  });
});

describe('analytics model', () => {
  const now = new Date('2026-10-04T12:00:00Z').getTime();
  const hoursAgo = h => new Date(now - h * 3600 * 1000).toISOString();
  const tasks = [
    { status: 'completed', assignee_id: 'a', created_at: hoursAgo(5), started_at: hoursAgo(5), completed_at: hoursAgo(4) },
    { status: 'completed', assignee_id: 'a', created_at: hoursAgo(30), started_at: hoursAgo(30), completed_at: hoursAgo(29.5) },
    { status: 'failed', assignee_id: 'b', created_at: hoursAgo(2) },
    { status: 'queued', assignee_id: 'b', created_at: hoursAgo(1) },
    { status: 'completed', assignee_id: 'c', created_at: hoursAgo(24 * 20), completed_at: hoursAgo(24 * 20) },
  ];

  test('counts, success rate, median and per-agent rows', () => {
    const s = summarizeTasks(tasks, { now });
    expect(s.total).toBe(5);
    expect(s.recentCount).toBe(4);
    expect(s.open).toBe(1);
    expect(s.successRate).toBeCloseTo(3 / 4);
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay.reduce((n, d) => n + d.created, 0)).toBe(4);
    expect(s.agents.map(a => [a.agentId, a.total, a.completed])).toEqual([['a', 2, 2], ['b', 2, 0]]);
  });

  test('empty input is safe', () => {
    const s = summarizeTasks(null, { now });
    expect(s.successRate).toBeNull();
    expect(s.medianDurationMs).toBeNull();
    expect(formatDuration(null)).toBe('–');
  });

  test('canvas summary and duration formatting', () => {
    expect(summarizeCanvas([{ kind: 'doc' }, { kind: 'doc' }, { kind: 'chat' }])).toEqual([{ kind: 'doc', count: 2 }, { kind: 'chat', count: 1 }]);
    expect(formatDuration(30 * 1000)).toBe('30s');
    expect(formatDuration(30 * 60 * 1000)).toBe('30m');
    expect(formatDuration(3 * 3600 * 1000)).toBe('3.0h');
  });
});
