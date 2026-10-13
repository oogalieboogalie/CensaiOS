import pool from '../db.js';
import { getAgentCard } from '../agent-registry/factories.js';
import { createAgentCardRun } from '../agent-card-runs/store.js';
import { buildScheduledTaskPrompt } from './taskPrompt.js';

export async function enqueueCoreScheduleRun(schedule, agentId, {
  db = pool,
  loadCard = getAgentCard,
  createCardRun = createAgentCardRun,
} = {}) {
  if (!schedule.workspace_id || !schedule.created_by_user_id) {
    throw new Error('Scheduled core run requires an authenticated workspace owner.');
  }
  const card = await loadCard(`agent:${agentId}`);
  if (!card || card.owner_id) {
    throw new Error(`Built-in AgentCard "agent:${agentId}" is not registered.`);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const queued = await createCardRun({
      db: client,
      card,
      callerId: `user:${schedule.created_by_user_id}`,
      payload: { prompt: buildScheduledTaskPrompt(schedule) },
      options: {
        workspaceId: schedule.workspace_id,
      },
      principal: 'system:scheduler',
      cause: { kind: 'schedule', scheduleId: schedule.id },
      runMetadata: { scheduleId: schedule.id, userId: schedule.created_by_user_id },
    });
    await client.query(
      `UPDATE schedules
       SET agent_id=$1, last_run_id=$2, last_error=NULL, updated_at=NOW()
       WHERE id=$3`,
      [agentId, queued.runId, schedule.id]
    );
    await client.query('COMMIT');
    return queued;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
