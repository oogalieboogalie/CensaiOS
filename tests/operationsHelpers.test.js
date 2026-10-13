import { statusTone, countByStatus, normalizeSchedule, buildActiveAgents } from '../src/components/operations/OperationsShared.jsx';

describe('Operations Helpers', () => {
  describe('statusTone', () => {
    test('identifies bad status', () => {
      expect(statusTone('failed')).toBe('bad');
      expect(statusTone('error')).toBe('bad');
      expect(statusTone('blocked')).toBe('bad');
    });

    test('identifies live status', () => {
      expect(statusTone('running')).toBe('live');
      expect(statusTone('in_progress')).toBe('live');
      expect(statusTone('queued')).toBe('live');
      expect(statusTone('active')).toBe('live');
    });

    test('identifies warn status', () => {
      expect(statusTone('awaiting_approval')).toBe('warn');
    });

    test('identifies good status', () => {
      expect(statusTone('complete')).toBe('good');
      expect(statusTone('done')).toBe('good');
      expect(statusTone('ready')).toBe('good');
    });

    test('returns quiet for unknown status', () => {
      expect(statusTone('unknown')).toBe('quiet');
      expect(statusTone(null)).toBe('quiet');
    });
  });

  describe('countByStatus', () => {
    test('counts items by status', () => {
      const items = [
        { status: 'queued' },
        { status: 'in_progress' },
        { status: 'queued' },
        { status: 'complete' },
      ];
      const counts = countByStatus(items);
      expect(counts).toEqual({
        queued: 2,
        in_progress: 1,
        complete: 1,
      });
    });

    test('handles items with no status', () => {
      const items = [{}, { status: 'active' }];
      const counts = countByStatus(items);
      expect(counts).toEqual({
        active: 2,
      });
    });

    test('returns empty object for empty list', () => {
      expect(countByStatus([])).toEqual({});
    });
  });

  describe('schedule normalization', () => {
    test('maps schedule rows from the API into the board view model', () => {
      const schedule = normalizeSchedule({
        id: 'schedule-1',
        agent_id: 'pipeline-tester-atlas',
        project_name: 'CensaiHub',
        task_text: 'Verify operations board',
        scheduled_date: '2026-06-05',
        scheduled_time: '13:30',
        next_run_at: '2026-06-05T18:30:00.000Z',
        last_error: 'waiting on API',
      }, [{ id: 'pipeline-tester-atlas', name: 'pipeline-tester' }]);

      expect(schedule).toEqual(expect.objectContaining({
        agentId: 'pipeline-tester-atlas',
        agentName: 'pipeline-tester',
        projectName: 'CensaiHub',
        taskText: 'Verify operations board',
        date: '2026-06-05',
        time: '13:30',
        nextRunAt: '2026-06-05T18:30:00.000Z',
        lastError: 'waiting on API',
        status: 'active',
      }));
    });
  });

  describe('active agent rollup', () => {
    test('includes active schedule assignees and Jules sessions', () => {
      const activeAgents = buildActiveAgents({
        tasks: [],
        schedules: [{ agent_id: 'pipeline-tester-atlas', task_text: 'Run checks', status: 'running' }],
        jules: [{ id: 'jules-1', status: 'IN_PROGRESS' }],
        subAgents: [{ id: 'pipeline-tester-atlas', name: 'pipeline-tester' }],
      });

      expect(activeAgents).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'pipeline-tester-atlas', name: 'pipeline-tester', kind: 'schedule' }),
        expect.objectContaining({ id: 'jules', name: 'Jules', kind: 'jules' }),
      ]));
    });
  });
});
