import pool from '../../db.js';
import { getSubAgents, getSubAgentById, createAgentTask, sendAgentMessage } from '../../memory.js';

export async function handleDispatchTool(agentId, name, args, context = {}) {
  switch (name) {

    case 'dispatch_squad': {
      if (!args.tasks || !Array.isArray(args.tasks) || args.tasks.length === 0) {
        return 'Error: dispatch_squad requires a non-empty tasks array.';
      }
      const label = args.label || `dispatch-${Date.now()}`;
      const batchId = crypto.randomUUID();
      const subs = await getSubAgents(agentId, context);

      const created = [];
      const errors = [];

      for (const t of args.tasks) {
        if (!t.assignee || !t.title || !t.prompt) {
          errors.push(`Invalid task entry — needs assignee, title, prompt: ${JSON.stringify(t)}`);
          continue;
        }
        const sub = subs.find(s =>
          s.name.toLowerCase() === t.assignee.toLowerCase() ||
          s.id === t.assignee
        );
        if (!sub) {
          errors.push(`Sub-agent "${t.assignee}" not found. Use list_sub_agents to check names.`);
          continue;
        }
        try {
          const task = await createAgentTask({
            parentId: agentId,
            assigneeId: sub.id,
            projectId: sub.project_id || null,
            title: t.title,
            prompt: t.prompt,
            priority: t.priority || 'normal',
            batchId,
            batchLabel: label,
            wakeId: context.agentWakeId || null,
            workspaceId: context.workspaceId,
            userId: context.userId,
          });
          created.push(`  • ${sub.name} → "${t.title}" [${task.id.slice(0, 8)}]`);
        } catch (err) {
          errors.push(`Failed to queue task for ${t.assignee}: ${err.message}`);
        }
      }

      const lines = [
        `Squad "${label}" dispatched — ${created.length}/${args.tasks.length} tasks queued.`,
        ...created,
      ];
      if (errors.length) lines.push('Errors:', ...errors.map(e => `  ⚠ ${e}`));
      lines.push(`\nYou will receive a message when all tasks complete. Use squad_status("${label}") to check progress.`);
      return lines.join('\n');
    }

    case 'squad_status': {
      const label = args.label;
      if (!label) return 'Error: squad_status requires a label.';

      const { rows } = await pool.query(
        `SELECT at.*, sa.name as agent_name
         FROM agent_tasks at
         LEFT JOIN sub_agents sa ON sa.id = at.assignee_id
         WHERE at.parent_id = $1
           AND (at.batch_label = $2 OR at.batch_id::text = $2)
           AND at.workspace_id = $3
         ORDER BY at.created_at ASC`,
        [agentId, label, context.workspaceId]
      );

      if (rows.length === 0) return `No dispatch found with label "${label}".`;

      const total = rows.length;
      const done = rows.filter(r => r.status === 'completed').length;
      const failed = rows.filter(r => r.status === 'failed').length;
      const pending = rows.filter(r => r.status === 'queued' || r.status === 'in_progress').length;

      const lines = [
        `Squad "${label}" — ${done} done, ${failed} failed, ${pending} pending (${total} total)`,
        '─'.repeat(60),
      ];

      for (const t of rows) {
        const statusIcon = { completed: '✓', failed: '✗', in_progress: '⟳', queued: '○', cancelled: '✕' }[t.status] || '?';
        const durationMs = t.completed_at && t.started_at
          ? Math.round((new Date(t.completed_at) - new Date(t.started_at)) / 1000)
          : null;
        const duration = durationMs !== null ? ` (${durationMs}s)` : '';
        lines.push(`${statusIcon} [${t.agent_name || t.assignee_id.slice(0, 8)}] ${t.title}${duration}`);
        if (t.result) {
          const snippet = t.result.length > 300 ? t.result.slice(0, 300) + '…' : t.result;
          lines.push(`  └─ ${snippet.replace(/\n/g, '\n     ')}`);
        }
        if (t.error) lines.push(`  └─ ERROR: ${t.error}`);
      }

      return lines.join('\n');
    }

    case 'task_done': {
      // Sub-agent explicitly signals task completion with a summary
      const sub = await getSubAgentById(agentId, context);
      if (!sub) return 'Error: task_done can only be called by a sub-agent.';

      const { rows } = await pool.query(
        `SELECT * FROM agent_tasks
         WHERE assignee_id = $1 AND status = 'in_progress' AND workspace_id = $2
         ORDER BY started_at DESC LIMIT 1`,
        [agentId, context.workspaceId]
      );

      if (!rows[0]) return 'No active task found for you. task_done is only valid when you have an in_progress task.';
      const task = rows[0];

      await pool.query(
        `UPDATE agent_tasks SET status='completed', result=$1, completed_at=NOW(), updated_at=NOW()
         WHERE id=$2 AND workspace_id=$3`,
        [args.summary || '(Task complete — no summary provided)', task.id, context.workspaceId]
      );

      // Trigger batch completion check inline (avoids circular import with taskWorker)
      if (task.batch_id) {
        try {
          const { rows: batchRows } = await pool.query(
            `SELECT status FROM agent_tasks WHERE batch_id = $1 AND workspace_id = $2`,
            [task.batch_id, context.workspaceId]
          );
          const allDone = batchRows.every(r => r.status === 'completed' || r.status === 'failed');
          if (allDone) {
            const failed = batchRows.filter(r => r.status === 'failed').length;
            const emoji = failed === 0 ? '🟢' : '🟡';
            const batchLabel = task.batch_label || task.batch_id;
            await sendAgentMessage(
              task.parent_id,
              task.parent_id,
              `${emoji} Squad "${batchLabel}" complete. Call squad_status("${batchLabel}") for results.`,
              {
                workspaceId: context.workspaceId,
                userId: context.userId,
                priority: 'high',
                subject: `Squad complete: ${batchLabel}`,
                messageType: 'task_submission',
                importanceScore: 0.85,
              },
            );
          }
        } catch (batchErr) {
          console.warn('[task_done] Batch check error:', batchErr.message);
        }
      }

      return `Task "${task.title}" marked complete. Your parent will be notified if this was the last task in the batch.`;
    }

    default:
      throw new Error(`Unknown dispatch tool: ${name}`);
  }
}
