// Wake-ups: Censai, the orchestrator, sets a one-time or repeating run for
// himself, or wakes a family agent to check its messages and do its part,
// with a plain-words reason and plan. The run is an ordinary schedules row
// marked set_by_agent, so it shows in the Scheduler window. Off until an
// owner or admin turns it on, and capped per day.
import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';

// Only the main agent schedules (Alex 2026-10-17: "just the main one").
export const WAKE_UP_AGENTS = Object.freeze(['censai']);
export const RUNS_PER_DAY = 6;
export const WAITING_MAX = 8;
export const MIN_LEAD_MINUTES = 10;
export const MAX_LEAD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const EVERY_DAY = { s: true, m: true, t: true, w: true, th: true, f: true, sat: true };
const WEEKDAYS = { s: false, m: true, t: true, w: true, th: true, f: true, sat: false };

export class WakeUpError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function scheduler(agentId) {
  const id = String(agentId || '').trim().toLowerCase();
  if (!WAKE_UP_AGENTS.includes(id)) throw new WakeUpError('Only Censai can set wake-ups.');
  return id;
}

function familyAgent(agentId, fallback) {
  const id = String(agentId || fallback || '').trim().toLowerCase();
  if (!FAMILY_AGENT_BY_ID[id]) throw new WakeUpError(`"${agentId}" is not one of the family agents.`);
  return id;
}

/** { agents: { [agentId]: true } } — only the agents that may wake themselves up. */
export async function readWakeUps(db, workspaceId) {
  const { rows } = await db.query(
    'SELECT agent_id, enabled FROM workspace_agent_wake_ups WHERE workspace_id=$1', [workspaceId],
  );
  const agents = {};
  for (const row of rows) if (row.enabled) agents[row.agent_id] = true;
  return { agents };
}

export async function setWakeUps(db, { workspaceId, agentId, enabled, userId }) {
  await db.query(`INSERT INTO workspace_agent_wake_ups (workspace_id,agent_id,enabled,updated_by_user_id)
    VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id,agent_id)
    DO UPDATE SET enabled=EXCLUDED.enabled,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()`,
  [workspaceId, scheduler(agentId), Boolean(enabled), userId || null]);
  return readWakeUps(db, workspaceId);
}

const pad = (n) => String(n).padStart(2, '0');
function clockWords(date) {
  const h = date.getHours();
  return `${h % 12 || 12}:${pad(date.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}
const dayWords = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "in_minutes" or "at" ("HH:MM", "h:mm pm" or "YYYY-MM-DD HH:MM", server clock) → Date. */
export function wakeTime({ inMinutes, at, repeat = 'once' }, now = new Date()) {
  let when;
  if (inMinutes !== undefined && inMinutes !== null && inMinutes !== '') {
    const minutes = Number(inMinutes);
    if (!Number.isFinite(minutes)) throw new WakeUpError('in_minutes must be a number.');
    when = new Date(now.getTime() + Math.round(minutes) * 60000);
  } else {
    const match = String(at || '').trim().match(/^(?:(\d{4})-(\d{2})-(\d{2})[ T])?(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!match) throw new WakeUpError('Say when: in_minutes, or at like "14:30" or "2026-10-20 09:00".');
    let hours = Number(match[4]);
    const ampm = (match[6] || '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    when = match[1]
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hours, Number(match[5]))
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, Number(match[5]));
    if (Number.isNaN(when.getTime()) || hours > 23) throw new WakeUpError('That time does not exist.');
    if (!match[1] && when <= now) when = new Date(when.getTime() + DAY_MS);
  }
  if (repeat === 'weekdays') while ([0, 6].includes(when.getDay())) when = new Date(when.getTime() + DAY_MS);
  if (when.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60000) {
    throw new WakeUpError(`Pick a time at least ${MIN_LEAD_MINUTES} minutes from now.`);
  }
  if (when.getTime() - now.getTime() > MAX_LEAD_DAYS * DAY_MS) {
    throw new WakeUpError(`Pick a time within the next ${MAX_LEAD_DAYS} days.`);
  }
  return when;
}

export async function createAgentWakeUp(db, {
  workspaceId, userId, agentId, wakeAgent, reason, plan, inMinutes, at, repeat = 'once', now = new Date(),
}) {
  const id = scheduler(agentId);
  const target = familyAgent(wakeAgent, id);
  const why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  const todo = String(plan || '').trim().slice(0, 2000);
  if (!why || !todo) throw new WakeUpError('Say why you want to wake up and what you plan to do.');
  if (!['once', 'daily', 'weekdays'].includes(repeat)) throw new WakeUpError('repeat is once, daily or weekdays.');
  if (!(await readWakeUps(db, workspaceId)).agents[id]) {
    throw new WakeUpError('Wake-ups are off for you on this board.', 403);
  }
  const { rows: [{ waiting }] } = await db.query(
    `SELECT count(*)::int AS waiting FROM schedules WHERE workspace_id=$1 AND set_by_agent=$2
       AND status IN ('active','running','inactive')`, [workspaceId, id],
  );
  if (waiting >= WAITING_MAX) {
    throw new WakeUpError(`You already have ${WAITING_MAX} wake-ups waiting. Cancel one first.`, 429);
  }
  const when = wakeTime({ inMinutes, at, repeat }, now);
  const { rows } = await db.query(
    `INSERT INTO schedules (agent_id, task_text, scheduled_time, scheduled_date, repeat_enabled,
       repeat_days, repeat_freq, status, next_run_at, tag, workspace_id, created_by_user_id,
       set_by_agent, agent_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,'Wake-up',$9,$10,$11,$12) RETURNING *`,
    [target, todo, clockWords(when), dayWords(when), repeat !== 'once',
      repeat === 'once' ? null : JSON.stringify(repeat === 'daily' ? EVERY_DAY : WEEKDAYS),
      repeat === 'once' ? null : 'weekly', when, workspaceId, userId, id, why],
  );
  return rows[0];
}

export async function listAgentWakeUps(db, { workspaceId, agentId }) {
  const { rows } = await db.query(
    `SELECT id, agent_id, agent_reason, task_text, next_run_at, repeat_enabled, status, last_error FROM schedules
      WHERE workspace_id=$1 AND set_by_agent=$2 AND status IN ('active','running','inactive')
      ORDER BY next_run_at ASC`, [workspaceId, scheduler(agentId)],
  );
  return rows;
}

export async function cancelAgentWakeUp(db, { workspaceId, agentId, id }) {
  const result = await db.query(
    'DELETE FROM schedules WHERE id::text=$1 AND workspace_id=$2 AND set_by_agent=$3',
    [String(id || ''), workspaceId, scheduler(agentId)],
  );
  return result.rowCount > 0;
}

/**
 * Called when an agent's own wake-up comes due. Returns null when it may run
 * (and counts it), or a patch that holds it: paused when the switch is off,
 * pushed later when the agent already used today's runs.
 */
export async function gateAgentWakeUp(db, schedule, now = new Date()) {
  const id = String(schedule.set_by_agent || '').toLowerCase();
  const name = FAMILY_AGENT_BY_ID[id]?.name || id;
  if (!WAKE_UP_AGENTS.includes(id) || !(await readWakeUps(db, schedule.workspace_id)).agents[id]) {
    return { status: 'inactive', last_error: `Wake-ups are off for ${name}, so this one is paused.` };
  }
  const { rows } = await db.query(
    `SELECT fired_at FROM agent_wake_up_fires WHERE workspace_id=$1 AND agent_id=$2
       AND fired_at > $3 ORDER BY fired_at ASC`,
    [schedule.workspace_id, id, new Date(now.getTime() - DAY_MS)],
  );
  if (rows.length >= RUNS_PER_DAY) {
    const later = new Date(new Date(rows[0].fired_at).getTime() + DAY_MS + 60000);
    return {
      status: 'active', next_run_at: later,
      last_error: `${name} already woke up ${RUNS_PER_DAY} times in the last day, so this waits until ${clockWords(later)}.`,
    };
  }
  await db.query('INSERT INTO agent_wake_up_fires (workspace_id,agent_id,schedule_id) VALUES ($1,$2,$3)',
    [schedule.workspace_id, id, schedule.id]);
  return null;
}

export const __test__ = { clockWords, dayWords };
