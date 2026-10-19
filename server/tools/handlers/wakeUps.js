// wake_me_up / my_wake_ups / cancel_wake_up: Censai schedules himself, or a
// family agent, through the same schedules the Scheduler window shows.
import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { FAMILY_AGENT_BY_ID } from '../../../src/data/family-agents.js';
import {
  cancelAgentWakeUp, createAgentWakeUp, listAgentWakeUps, WAKE_UP_AGENTS,
} from '../../wakeUps/store.js';

const nameOf = (id) => FAMILY_AGENT_BY_ID[id]?.name || id;

function whenWords(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'soon' : date.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export async function handleWakeUpTool(agentId, name, args = {}, context = {}, db = pool) {
  const id = String(agentId || '').toLowerCase();
  if (!WAKE_UP_AGENTS.includes(id)) return 'Only Censai can set wake-ups.';
  const workspaceId = context.workspaceId;
  const userId = Number(context.userId);
  if (!workspaceId || !Number.isInteger(userId) || userId <= 0) return 'There is no board here to schedule on.';
  try {
    if (name === 'my_wake_ups') {
      const rows = await listAgentWakeUps(db, { workspaceId, agentId: id });
      if (!rows.length) return 'You have no wake-ups waiting.';
      return rows.map((row) => `- ${row.id}: ${whenWords(row.next_run_at)}${row.repeat_enabled ? ' (repeats)' : ''}`
        + `${row.agent_id !== id ? `, wakes ${nameOf(row.agent_id)}` : ''}: ${row.agent_reason}`
        + `${row.status === 'inactive' ? ' [paused]' : ''}`).join('\n');
    }
    if (name === 'cancel_wake_up') {
      return (await cancelAgentWakeUp(db, { workspaceId, agentId: id, id: args.id }))
        ? 'Cancelled.' : 'No waiting wake-up of yours has that id.';
    }
    // Viewers can look at a board but not set things running on it.
    await requireWorkspaceMember(db, { userId, workspaceId, roles: ['owner', 'admin', 'member'] });
    const row = await createAgentWakeUp(db, {
      workspaceId, userId, agentId: id, wakeAgent: args.wake_agent, reason: args.reason, plan: args.plan,
      inMinutes: args.in_minutes, at: args.at, repeat: args.repeat || 'once',
    });
    const who = row.agent_id === id ? 'You will wake up' : `${nameOf(row.agent_id)} will wake up`;
    return `${who} ${whenWords(row.next_run_at)}${row.repeat_enabled ? `, then ${args.repeat === 'weekdays' ? 'every weekday' : 'every day'}` : ''}. `
      + `It is in the Scheduler as a wake-up (id ${row.id}). It is ${whenWords(new Date())} now.`;
  } catch (error) {
    return error.statusCode ? error.message : `The wake-up was not set: ${error.message}`;
  }
}
