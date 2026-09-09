import { createWorkspaceEvent } from './factories.js';
import { ensureOperationalIntelligenceSchema } from './schema.js';
import { implementationPatchForTask, rowToItem } from './todoModel.js';

const systemActor = { kind: 'system', id: 'jules-task-sync' };

export async function syncTodoArtifactsForAgentTask(db, input = {}) {
  const taskId = String(input.taskId || '').trim();
  if (!taskId) return [];
  await ensureOperationalIntelligenceSchema(db);

  const patch = implementationPatchForTask(input);
  const { rows } = await db.query(
    `SELECT *
       FROM artifacts
      WHERE artifact_type = 'task'
        AND deleted_at IS NULL
        AND data->>'handoffTaskId' = $1`,
    [taskId]
  );
  const updated = [];
  for (const row of rows) {
    const nextData = { ...(row.data || {}), ...patch };
    const result = await db.query(
      'UPDATE artifacts SET data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(nextData), row.id]
    );
    const artifact = result.rows[0];
    updated.push(rowToItem(artifact));
    await createWorkspaceEvent({ db }, {
      workspaceId: row.workspace_id,
      type: `todo.implementation.${nextData.implementationStatus || 'synced'}`,
      actor: systemActor,
      artifactId: row.id,
      payload: {
        taskId,
        taskStatus: input.taskStatus || null,
        prUrl: patch.prUrl || null,
        prNumber: patch.prNumber || null,
      },
    });
  }
  return updated;
}
