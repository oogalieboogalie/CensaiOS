import { getAgent, buildSystemPrompt, markMessageRead, sendAgentMessage } from '../memory.js';
import { buildWakePrompt } from './prompt.js';
import { getThreadStats, getWakeupTasks, loadWakeupContext, updateWakeup } from './store.js';
import { isAckMessage, MAX_THREAD_WAKES } from './threadGuards.js';
import { runWakeModel } from './modelLoop.js';
import {
  beginWakeupRun,
  completeWakeupRun,
  failWakeupRun,
  recordWakeupPhase,
} from './runLifecycle.js';
import { ownershipFromRow } from '../autonomy/ownership.js';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export async function runAgentWakeup(claimed) {
  const wake = await loadWakeupContext(claimed.id);
  if (!wake) return;
  const ownership = ownershipFromRow(wake);
  let runId = wake.run_id || null;
  try {
    runId = await beginWakeupRun(wake);
    const agent = await getAgent(wake.agent_id);
    if (!agent) throw new Error(`Recipient agent "${wake.agent_id}" not found`);
    const tasks = await getWakeupTasks(wake.id, ownership.workspaceId);
    if (tasks.length && tasks.every(task => TERMINAL.has(task.status))) wake.phase = 'review';

    // Thread round context for the prompt (best-effort: stats failure must
    // never break a wake).
    let thread = {};
    if (wake.thread_id) {
      try {
        const stats = await getThreadStats(wake.thread_id, ownership);
        thread = { round: (stats.wakeCount ?? 0) + 1, maxRounds: MAX_THREAD_WAKES };
      } catch {
        thread = {};
      }
    }

    const systemPrompt = await buildSystemPrompt(agent.id, wake.content, {
      workspaceId: ownership.workspaceId,
      userId: ownership.userId,
    });
    const outcome = await runWakeModel({
      agent,
      systemPrompt: `${systemPrompt}\n\n## Family work protocol\nMessages can wake family members. Delegate when useful, review receipts before reporting success, and never claim unverified work is complete.`,
      userPrompt: buildWakePrompt(wake, tasks, thread),
      wakeId: wake.id,
      messageId: wake.message_id,
      ...ownership,
    });
    const linkedTasks = await getWakeupTasks(wake.id, ownership.workspaceId);
    const active = linkedTasks.some(task => !TERMINAL.has(task.status));

    await markMessageRead(wake.message_id, ownership);
    if (active) {
      await sendAgentMessage(agent.id, wake.sender_id,
        `${agent.name} acknowledged "${wake.subject || 'your request'}" and delegated ${linkedTasks.length} task(s). I will review the receipts and report back.`,
        { ...ownership, messageType: 'agent_ack', threadId: wake.thread_id || wake.message_id, wake: false }
      );
      await updateWakeup(wake.id, { status: 'waiting_children', phase: 'review', response: outcome.text });
      await recordWakeupPhase({
        runId, wake, outcome, name: 'agent_wakeup.delegate',
      });
      return { status: 'waiting_children', runId, outcome };
    }

    const shouldReport = wake.message_type !== 'agent_report' || wake.phase === 'review';
    if (shouldReport && outcome.text) {
      // Bare acknowledgements ("done", "ok") carry nothing actionable: store
      // the report but don't wake the sender, or the two sides ping-pong
      // politeness at each other forever.
      const substantive = !isAckMessage(outcome.text);
      await sendAgentMessage(agent.id, wake.sender_id, outcome.text, {
        ...ownership,
        messageType: 'agent_report',
        priority: 'high',
        threadId: wake.thread_id || wake.message_id,
        wake: substantive,
      });
    }
    await completeWakeupRun({ runId, wake, outcome });
    await updateWakeup(wake.id, { status: 'completed', response: outcome.text });
    return { status: 'completed', runId, outcome };
  } catch (err) {
    if (runId) await failWakeupRun({ runId, wake, error: err }).catch(() => {});
    await updateWakeup(wake.id, { status: 'failed', error: err.message });
    throw err;
  }
}
