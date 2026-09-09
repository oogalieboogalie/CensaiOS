import pool from '../db.js';
import {
  completeRun,
  createRun,
  failRun,
  recordRunAction,
  startRun,
} from '../runs/lifecycle.js';

function taskCause(task) {
  return {
    kind: 'user_dispatch',
    userDispatchRef: `agent_task:${task.id}`,
    metadata: { agentTaskId: task.id },
  };
}

function taskFailure(task, outcome) {
  return outcome?.error || `Agent task ${task.id} failed without an error message`;
}

export async function runTaskWithLifecycle({ db = pool, task, executeTask } = {}) {
  const created = await createRun({
    db,
    workspaceId: task.workspace_id || null,
    actor: `agent:${task.assignee_id}`,
    principal: `user:${task.created_by_user_id}`,
    runtimeMode: 'background',
    metadata: {
      kind: 'agent_task',
      agentTaskId: task.id,
      userId: task.created_by_user_id,
    },
    cause: taskCause(task),
  });
  const runId = created.runId;
  await startRun({ db, runId });

  try {
    const outcome = await executeTask(task);
    const failed = outcome?.status === 'failed';
    await recordRunAction({
      db,
      runId,
      sequence: 1,
      name: 'agent_task.execute',
      status: failed ? 'failed' : 'succeeded',
      metadata: { agentTaskId: task.id },
    });
    if (failed) await failRun({ db, runId, error: taskFailure(task, outcome) });
    else await completeRun({ db, runId, metadata: { agentTaskId: task.id } });
    return { runId, outcome };
  } catch (error) {
    await recordRunAction({
      db,
      runId,
      sequence: 1,
      name: 'agent_task.execute',
      status: 'failed',
      metadata: { agentTaskId: task.id },
    });
    await failRun({ db, runId, error });
    throw error;
  }
}
