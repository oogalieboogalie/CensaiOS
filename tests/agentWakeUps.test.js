// Wake-ups: Censai sets a time to wake himself, or a family agent, through
// the schedules the Scheduler window shows. Off until someone turns it on,
// at most RUNS_PER_DAY runs a day and WAITING_MAX waiting at once.
import { jest } from '@jest/globals';
import {
  cancelAgentWakeUp, createAgentWakeUp, gateAgentWakeUp, listAgentWakeUps, readWakeUps,
  RUNS_PER_DAY, setWakeUps, WAITING_MAX, wakeTime,
} from '../server/wakeUps/store.js';
import { handleWakeUpTool } from '../server/tools/handlers/wakeUps.js';
import { buildScheduledTaskPrompt } from '../server/scheduler/taskPrompt.js';
import { familyDefaultToolNames } from '../server/tools/rbac/familyBaseline.js';

function fakeDb({ role = 'owner' } = {}) {
  const switches = new Map();
  const schedules = [];
  const fires = [];
  return {
    schedules, fires,
    query: jest.fn(async (sql, params) => {
      if (sql.includes('FROM workspace_agent_wake_ups')) {
        return { rows: [...switches].filter(([k]) => k.startsWith(`${params[0]}|`)).map(([k, enabled]) => ({ agent_id: k.split('|')[1], enabled })) };
      }
      if (sql.startsWith('INSERT INTO workspace_agent_wake_ups')) switches.set(`${params[0]}|${params[1]}`, params[2]);
      if (sql.includes('FROM workspaces w')) return { rows: [{ id: params[0], role }] };
      if (sql.includes('count(*)::int AS waiting')) {
        return { rows: [{ waiting: schedules.filter(s => s.workspace_id === params[0] && s.set_by_agent === params[1]).length }] };
      }
      if (sql.includes('INSERT INTO schedules')) {
        const row = { id: `s${schedules.length + 1}`, agent_id: params[0], task_text: params[1], scheduled_time: params[2],
          scheduled_date: params[3], repeat_enabled: params[4], repeat_days: params[5], repeat_freq: params[6],
          next_run_at: params[7], workspace_id: params[8], created_by_user_id: params[9], set_by_agent: params[10],
          agent_reason: params[11], status: 'active' };
        schedules.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT id, agent_id, agent_reason')) {
        return { rows: schedules.filter(s => s.workspace_id === params[0] && s.set_by_agent === params[1]) };
      }
      if (sql.startsWith('DELETE FROM schedules')) {
        const at = schedules.findIndex(s => s.id === params[0] && s.workspace_id === params[1] && s.set_by_agent === params[2]);
        if (at >= 0) schedules.splice(at, 1);
        return { rowCount: at >= 0 ? 1 : 0, rows: [] };
      }
      if (sql.startsWith('SELECT fired_at')) {
        return { rows: fires.filter(f => f.workspace_id === params[0] && f.agent_id === params[1] && f.fired_at > params[2]) };
      }
      if (sql.startsWith('INSERT INTO agent_wake_up_fires')) fires.push({ workspace_id: params[0], agent_id: params[1], fired_at: new Date() });
      return { rows: [] };
    }),
  };
}

const ctx = { workspaceId: 'b', userId: 7 };
const ask = (args) => ({ reason: 'Check the deploy finished.', plan: 'Look at the deploy log and tell Alma.', in_minutes: 30, ...args });

test('only Censai gets the wake-up tools, and they start off', async () => {
  expect(familyDefaultToolNames('censai')).toEqual(expect.arrayContaining(['wake_me_up', 'my_wake_ups', 'cancel_wake_up']));
  expect(familyDefaultToolNames('atlas')).not.toContain('wake_me_up');
  const db = fakeDb();
  expect(await handleWakeUpTool('atlas', 'wake_me_up', ask(), ctx, db)).toBe('Only Censai can set wake-ups.');
  expect(await handleWakeUpTool('censai', 'wake_me_up', ask(), ctx, db)).toMatch(/off for you/);
  await expect(setWakeUps(db, { workspaceId: 'b', agentId: 'atlas', enabled: true })).rejects.toMatchObject({ statusCode: 400 });
  expect(db.schedules).toHaveLength(0);
});

test('Censai wakes himself, or wakes Echo, and the wake-up lands in the Scheduler marked as his', async () => {
  const db = fakeDb();
  await setWakeUps(db, { workspaceId: 'b', agentId: 'censai', enabled: true, userId: 7 });
  expect(await readWakeUps(db, 'b')).toEqual({ agents: { censai: true } });
  expect(await handleWakeUpTool('censai', 'wake_me_up', ask(), ctx, db)).toMatch(/^You will wake up .*Scheduler as a wake-up/);
  expect(await handleWakeUpTool('censai', 'wake_me_up', ask({ wake_agent: 'echo', repeat: 'weekdays' }), ctx, db))
    .toMatch(/^Echo will wake up .*then every weekday/);
  expect(db.schedules[0]).toMatchObject({ agent_id: 'censai', set_by_agent: 'censai', created_by_user_id: 7,
    agent_reason: 'Check the deploy finished.', repeat_enabled: false });
  expect(db.schedules[1]).toMatchObject({ agent_id: 'echo', set_by_agent: 'censai', repeat_enabled: true, repeat_freq: 'weekly' });
  expect(await handleWakeUpTool('censai', 'wake_me_up', ask({ wake_agent: 'nobody' }), ctx, db)).toMatch(/not one of the family/);
  expect(await handleWakeUpTool('censai', 'my_wake_ups', {}, ctx, db)).toMatch(/s2: .*wakes Echo/);
  expect(await handleWakeUpTool('censai', 'cancel_wake_up', { id: 's1' }, ctx, db)).toBe('Cancelled.');
  expect(await listAgentWakeUps(db, { workspaceId: 'b', agentId: 'censai' })).toHaveLength(1);
  expect(await cancelAgentWakeUp(db, { workspaceId: 'b', agentId: 'censai', id: 'nope' })).toBe(false);
});

test('viewers cannot set one, and at most WAITING_MAX can wait', async () => {
  const viewer = fakeDb({ role: 'viewer' });
  await setWakeUps(viewer, { workspaceId: 'b', agentId: 'censai', enabled: true });
  expect(await handleWakeUpTool('censai', 'wake_me_up', ask(), ctx, viewer)).toMatch(/does not allow/);
  const db = fakeDb();
  await setWakeUps(db, { workspaceId: 'b', agentId: 'censai', enabled: true });
  for (let i = 0; i < WAITING_MAX; i += 1) await createAgentWakeUp(db, { ...ctx, agentId: 'censai', reason: 'r', plan: 'p', inMinutes: 20 });
  await expect(createAgentWakeUp(db, { ...ctx, agentId: 'censai', reason: 'r', plan: 'p', inMinutes: 20 }))
    .rejects.toMatchObject({ statusCode: 429 });
});

test('times: too soon, too far, a clock time that passed means tomorrow, weekdays skip the weekend', () => {
  const now = new Date(2026, 9, 17, 18, 0); // a Saturday, 6 pm
  expect(() => wakeTime({ inMinutes: 2 }, now)).toThrow(/10 minutes/);
  expect(() => wakeTime({ inMinutes: 60 * 24 * 40 }, now)).toThrow(/30 days/);
  expect(() => wakeTime({ at: 'whenever' }, now)).toThrow(/Say when/);
  expect(wakeTime({ at: '9:00 am' }, now)).toEqual(new Date(2026, 9, 18, 9, 0));
  expect(wakeTime({ at: '20:15' }, now)).toEqual(new Date(2026, 9, 17, 20, 15));
  expect(wakeTime({ at: '2026-10-20 07:30' }, now)).toEqual(new Date(2026, 9, 20, 7, 30));
  expect(wakeTime({ at: '9:00', repeat: 'weekdays' }, now)).toEqual(new Date(2026, 9, 19, 9, 0));
});

test('when one comes due: paused if switched off, held past the daily cap, counted otherwise', async () => {
  const db = fakeDb();
  const due = { id: 's1', workspace_id: 'b', agent_id: 'echo', set_by_agent: 'censai' };
  expect(await gateAgentWakeUp(db, due)).toMatchObject({ status: 'inactive', last_error: expect.stringMatching(/off for Censai/) });
  await setWakeUps(db, { workspaceId: 'b', agentId: 'censai', enabled: true });
  for (let i = 0; i < RUNS_PER_DAY; i += 1) expect(await gateAgentWakeUp(db, due)).toBeNull();
  expect(db.fires).toHaveLength(RUNS_PER_DAY);
  const held = await gateAgentWakeUp(db, due);
  expect(held).toMatchObject({ status: 'active', last_error: expect.stringMatching(/already woke up 6 times/) });
  expect(held.next_run_at.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
});

test('the run prompt says who set it and why; a woken agent checks its messages first', () => {
  const own = buildScheduledTaskPrompt({ agent_id: 'censai', set_by_agent: 'censai', agent_reason: 'Deploy check', task_text: 'Read the log.' });
  expect(own).toMatch(/You set this wake-up for yourself\.\nWhy: Deploy check\nWhat you planned to do: Read the log\./);
  const woken = buildScheduledTaskPrompt({ agent_id: 'echo', set_by_agent: 'censai', agent_reason: 'Weekly numbers', task_text: 'Do the sales sheet.' });
  expect(woken).toMatch(/Censai woke you up/);
  expect(woken).toMatch(/read_messages/);
  expect(woken).toMatch(/message_to/);
  expect(buildScheduledTaskPrompt({ task_text: 'Plain run.' }).startsWith('Plain run.')).toBe(true);
});
