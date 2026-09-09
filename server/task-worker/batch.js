import pool from '../db.js';
import { sendAgentMessage } from '../memory.js';
import { log } from './shared.js';

export async function checkBatchCompletion(batchId, batchLabel, parentId, scope) {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM agent_tasks WHERE batch_id = $1 AND workspace_id = $2`,
      [batchId, scope.workspaceId]
    );
    const all = rows.length;
    const done = rows.filter(r => r.status === 'completed' || r.status === 'failed').length;
    const failed = rows.filter(r => r.status === 'failed').length;

    if (done < all) return; // still running

    const label = batchLabel || batchId;
    const emoji = failed === 0 ? '🟢' : failed === all ? '🔴' : '🟡';
    const msg = `${emoji} Squad dispatch "${label}" complete — ${done - failed}/${all} succeeded, ${failed} failed.\nCall squad_status("${label}") to see full results.`;

    if (parentId) {
      await sendAgentMessage(parentId, parentId, msg, {
        ...scope,
        priority: 'high',
        subject: `Squad complete: ${label}`,
        messageType: 'task_submission',
        importanceScore: 0.85,
      });
    }
    log.info('batch complete', { label, total: all, failed, parentId });
  } catch (err) {
    log.error('batch check error', { batchId, error: err.message });
  }
}
