import {
  updateAgentTask, getSubAgentById, sendAgentMessage, buildCompletionReceipt
} from '../memory.js';
import { toolCallOk } from '../routes/chat/toolOutcome.js';
import { withLongcatToolCallFallback } from '../routes/chat/longcatToolCalls.js';
import {
  buildSubAgentSystemPrompt,
  getSubAgentModelConfig
} from '../routes/chat/index.js';
import { callModel, createModelAccessContext, workspaceUsageSink } from '../aiGateway/index.js';
import { executeTool, filterToolsForAgent } from '../tools.js';
import { 
  log, TASK_SUBMISSION_PREVIEW_CHARS, MAX_ROUNDS, TASK_TIMEOUT_MS 
} from './shared.js';
import { checkBatchCompletion } from './batch.js';

function taskSubmissionBody(task, status, details = '') {
  const rawDetails = String(details || '').trim();
  const preview = rawDetails.length > TASK_SUBMISSION_PREVIEW_CHARS
    ? `${rawDetails.slice(0, TASK_SUBMISSION_PREVIEW_CHARS)}\n... [truncated]`
    : rawDetails;
  return [
    `Task "${task.title}" was submitted with status: ${status}.`,
    `Assignee: ${task.assignee_id}`,
    task.project_id ? `Project: ${task.project_id}` : null,
    '',
    preview || '(no result body)',
  ].filter(v => v !== null).join('\n');
}

async function notifyParentTaskSubmission(task, status, details) {
  if (!task.parent_id) return;
  try {
    await sendAgentMessage(task.parent_id, task.parent_id, taskSubmissionBody(task, status, details), {
      workspaceId: task.workspace_id,
      userId: task.created_by_user_id,
      priority: status === 'failed' ? 'high' : 'normal',
      subject: `Task submitted: ${task.title}`,
      messageType: 'task_submission',
      importanceScore: status === 'failed' ? 0.9 : 0.75,
    });
  } catch (err) {
    log.warn('failed to notify parent', { taskId: task.id, error: err.message });
  }
}

export async function runTask(task) {
  const scope = { workspaceId: task.workspace_id, userId: task.created_by_user_id };
  const sub = await getSubAgentById(task.assignee_id, scope);
  if (!sub) {
    await updateAgentTask(
      task.id,
      { status: 'failed', error: 'Sub-agent not found', completed_at: new Date() },
      scope,
    );
    return { status: 'failed', error: 'Sub-agent not found' };
  }

  const done = log.startTimer();
  log.info('task start', { taskId: task.id, assignee: sub.name || sub.id, title: task.title, priority: task.priority || 'normal' });
  const toolCalls = [];
  // Same additive `ok` flag the chat loop streams: the harness, not the model,
  // records per-tool outcomes in the completion receipt.
  const receiptWith = (patch) => {
    const receipt = buildCompletionReceipt(task, patch);
    return receipt ? { ...receipt, tool_calls: toolCalls } : null;
  };
  try {
    const systemPrompt = await buildSubAgentSystemPrompt(sub, scope);
    const modelConfig = getSubAgentModelConfig(sub);
    const { modelName, baseUrl, apiKey, modelProvider } = modelConfig;
    const tools = await filterToolsForAgent(sub.id, scope);
    const accessContext = createModelAccessContext({
      userId: task.created_by_user_id,
      workspaceId: task.workspace_id,
      source: 'task-worker',
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Delegated task: ${task.title}`,
          `Priority: ${task.priority || 'normal'}`,
          task.project ? `Project: ${task.project}` : null,
          '',
          task.prompt,
          '',
          'Complete the task now. Use your available tools when you need project context or need to write/report work.',
          'If you hand this task to Jules with `jules_submit`, do that at most once. Treat the returned Jules session as the active execution handoff, then stop and summarize the session instead of rewriting/resubmitting the prompt.',
          'End your work by producing a final result summary formatted in markdown, including at least two sections:',
          '## Summary of Changes',
          '## Verification Steps',
        ].filter(v => v !== null).join('\n'),
      },
    ];

    let finalText = '';
    let round = 0;

    for (;;) {
      round++;
      if (round > MAX_ROUNDS) {
        finalText = '(Task reached max rounds — partial result follows)\n' + finalText;
        break;
      }

      const body = {
        model: modelName,
        max_tokens: 4096,
        messages,
        tools,
      };

      const data = await callModel({
        config: {
          provider: modelProvider,
          model: modelName,
          baseUrl,
          apiKey,
        },
        accessContext,
        body,
        timeoutMs: TASK_TIMEOUT_MS,
        logContext: { source: 'task-worker', taskId: task.id, round },
        usageAttribution: {
          workspaceId: task.workspace_id,
          actor: { kind: 'user', id: task.created_by_user_id },
          source: 'task-worker',
          agentId: sub.id,
          taskId: task.id,
        },
        usageSink: workspaceUsageSink,
      });
      const choice = data.choices?.[0];
      const msg = withLongcatToolCallFallback(choice?.message);

      if (msg?.tool_calls?.length > 0) {
        const calls = msg.tool_calls.slice(0, 10);
        messages.push({ ...msg, tool_calls: calls });

        for (const call of calls) {
          const toolName = call.function.name;
          let args = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
          log.debug('task tool call', { taskId: task.id, round, tool: toolName });
          const toolStartedAt = Date.now();
          const result = await executeTool(sub.id, toolName, args, {
            agentTaskId: task.id,
            ...scope,
          });
          toolCalls.push({ tool: toolName, ok: toolCallOk(result), ms: Date.now() - toolStartedAt, round });
          messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
        }
        continue;
      }

      finalText = msg?.content || '(no response)';
      break;
    }

    await updateAgentTask(task.id, {
      status: 'completed',
      result: finalText,
      completion_receipt: receiptWith({ status: 'completed', result: finalText }),
    }, scope);
    log.info('task completed', { taskId: task.id, rounds: round, ms: done() });
    await notifyParentTaskSubmission(task, 'completed', finalText);

    if (task.batch_id) {
      await checkBatchCompletion(task.batch_id, task.batch_label, task.parent_id, scope);
    }
    return { status: 'succeeded', result: finalText };

  } catch (err) {
    log.error('task failed', { taskId: task.id, ms: done(), error: err.message });
    await updateAgentTask(task.id, {
      status: 'failed',
      error: err.message,
      completion_receipt: receiptWith({ status: 'failed', error: err.message }),
    }, scope);
    await notifyParentTaskSubmission(task, 'failed', err.message);
    if (task.batch_id) {
      await checkBatchCompletion(task.batch_id, task.batch_label, task.parent_id, scope);
    }
    return { status: 'failed', error: err.message };
  }
}
