import { jest } from '@jest/globals';
import {
  createSchedule,
  deleteOwnedSchedule,
  getScheduleOwnershipSummary,
  getSchedules,
  claimNextDueSchedule,
  updateOwnedSchedule,
} from '../server/scheduler/store.js';

function fakeDb(result = { rows: [] }) {
  return { query: jest.fn().mockResolvedValue(result) };
}

describe('schedule tenancy store', () => {
  test('derives ownership from trusted scope and ignores client ownership fields', async () => {
    const db = fakeDb({ rows: [{ id: 'schedule-1' }] });
    await createSchedule({
      agent_id: 'censai',
      task_text: 'Prepare the review.',
      scheduled_date: '2026-07-20',
      scheduled_time: '9:00 AM',
      workspace_id: 'spoofed',
      created_by_user_id: 999,
      status: 'completed',
    }, { db, userId: 7, workspaceId: 'workspace-1' });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("'active'");
    expect(values.slice(-2)).toEqual(['workspace-1', 7]);
    expect(values).not.toContain('spoofed');
    expect(values).not.toContain(999);
  });

  test('rejects non-family assignees before querying', async () => {
    const db = fakeDb();
    await expect(createSchedule({
      agent_id: 'jules', task_text: 'Dispatch externally.',
      scheduled_date: '2026-07-20', scheduled_time: '9:00 AM',
    }, { db, userId: 7, workspaceId: 'workspace-1' }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('scopes list, update, and delete to both user and workspace', async () => {
    const db = fakeDb({ rows: [{ id: 'schedule-1' }], rowCount: 1 });
    const owner = { db, userId: 7, workspaceId: 'workspace-1' };
    await getSchedules(owner);
    await updateOwnedSchedule('schedule-1', { status: 'inactive' }, owner);
    await deleteOwnedSchedule('schedule-1', owner);

    expect(db.query.mock.calls[0]).toEqual([
      expect.stringMatching(/created_by_user_id=\$1 OR \(\$3::boolean AND set_by_agent IS NOT NULL\)\) AND workspace_id=\$2/),
      [7, 'workspace-1', false],
    ]);
    expect(db.query.mock.calls[1][1]).toEqual([7, 'workspace-1', false, 'schedule-1', 'inactive']);
    expect(db.query.mock.calls[2][1]).toEqual([7, 'workspace-1', false, 'schedule-1']);
  });

  test('board owners and admins also see and manage the wake-ups an agent set', async () => {
    const db = fakeDb({ rows: [], rowCount: 1 });
    await getSchedules({ db, userId: 7, workspaceId: 'workspace-1', seeAgentWakeUps: true });
    expect(db.query.mock.calls[0][1]).toEqual([7, 'workspace-1', true]);
  });

  test('claims only ownership-complete due rows', async () => {
    const db = fakeDb({ rows: [] });
    await claimNextDueSchedule({ db });
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/workspace_id IS NOT NULL/);
    expect(sql).toMatch(/created_by_user_id IS NOT NULL/);
  });

  test('reports active legacy rows as readiness blockers', async () => {
    const db = fakeDb({ rows: [{ legacy_unowned_count: 3, blocking_unowned_count: 1 }] });
    await expect(getScheduleOwnershipSummary({ db })).resolves.toEqual({
      ready: false,
      legacyUnownedCount: 3,
      blockingUnownedCount: 1,
    });
  });
});
