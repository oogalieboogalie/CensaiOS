// One round of tool calls from the model: refuse a tool this chat did not
// offer, check each call's arguments, run the policy check for high-impact
// tools, run the tool, record its trace and timing, and feed the result back
// into the conversation.

import pool from '../../db.js';
import { normalizeToolCallArguments } from './reasoningFallback.js';
import { summarizeToolCall } from './toolSummary.js';
import { toolCallOk, withWaitingFlag } from './toolOutcome.js';
import { evaluatePolicy } from '../../policy/engine.js';
import { recordPolicyEvidence } from '../../policy/evidence.js';
import { recordToolTrace, recordTraceFailure } from '../../operational-intelligence/traces.js';
import { isPrivateTraceTool } from '../../operational-intelligence/tracePrivacy.js';
import { noteFailure } from './chatLog.js';
import { throwIfChatAborted } from './modelRound.js';
import { offeredToolNames, toolNotOfferedResult } from '../../tools/rbac/offeredTools.js';

export async function runToolCalls(calls, {
  agentId, windowId, workspaceId, authorizationWorkspaceId, userId, reqModel,
  traceId, signal, runTool, toolContext, toolSession, toolsForCaller,
  chatMessages, sendEvent, timings, toolActions, round,
}) {
  // A model can name a tool this chat never offered its agent; only offered ones run.
  const offered = offeredToolNames(toolsForCaller);
  const requiredArgsByTool = new Map(
    (toolsForCaller || []).map(t => [
      t.function.name,
      t.function.parameters?.required || [],
    ])
  );

  for (const call of calls) {
    throwIfChatAborted(signal);
    const toolName = call.function.name;
    const notOffered = offered.has(toolName) ? null : toolNotOfferedResult(toolName);
    let args = {};
    let argError = null;
    try {
      args = normalizeToolCallArguments(call.function.arguments);
    } catch (err) {
      argError = `Tool argument parse error: ${err.message}`;
    }

    if (!argError) {
      const missing = (requiredArgsByTool.get(toolName) || [])
        .filter(key => args?.[key] === undefined || args?.[key] === null || args?.[key] === '');
      if (missing.length > 0) {
        argError = `Tool argument validation error: missing required ${missing.join(', ')}`;
      }
    }
    if (toolName === 'local_dev_restart' && windowId) {
      args.__window_id = windowId;
    }

    args.__provenance = {
      agent_id: agentId,
      model: reqModel,
      prompt: chatMessages[chatMessages.length - 1]?.content || '',
      workspace_id: authorizationWorkspaceId || null,
      user_id: userId ?? null,
    };

    const isPrivate = isPrivateTraceTool(toolName);
    let summary = isPrivate ? null : summarizeToolCall(toolName, args);

    const highImpactTools = ['local_write_file', 'github_write_file', 'postgres_query', 'sandbox_exec', 'container_restart'];
    let policyResult = { decision: 'allow' };
    if (!notOffered && highImpactTools.includes(toolName)) {
      policyResult = await evaluatePolicy(toolName, args);
      await recordPolicyEvidence({ db: (await import('../../db.js')).default }, {
        policyResult,
        actionType: toolName,
        actor: { kind: 'agent', id: agentId },
        resourceId: args.path || args.file_path || args.repo || args.serviceName,
        inputData: args,
        workspaceId: authorizationWorkspaceId || 'global'
      });
    }

    sendEvent({ type: 'status', status: 'calling_tool', detail: { tool: toolName, args: isPrivate ? {} : args, ...(summary ? { summary } : {}), policy: policyResult } });

    const toolStartedAt = Date.now();
    let result;
    try {
      result = notOffered || (argError
        ? `${argError}. Call ${toolName} again with the required arguments.`
        : policyResult.decision === 'deny'
          ? `Policy Denied: ${policyResult.reason}`
          : await runTool(agentId, toolName, args, toolContext));
    } catch (toolErr) {
      result = `Tool execution error: ${toolErr.message}`;
      if (traceId) {
        recordTraceFailure({ db: pool }, {
          workspaceId,
          traceId,
          error: toolErr,
          contextSnapshot: { toolName, round, messagesCount: chatMessages.length }
        }).catch(noteFailure('tool failure trace not recorded', { agentId }));
      }
    }
    const toolMs = Date.now() - toolStartedAt;
    timings.tool_ms += toolMs;
    const ok = toolCallOk(result); summary = withWaitingFlag(summary, result);
    toolSession.observe(toolName, args, ok, result);
    sendEvent({ type: 'status', status: 'completed_tool', detail: { tool: toolName, ms: toolMs, ok, ...(summary ? { summary } : {}) } });

    if (traceId) {
      recordToolTrace({ db: pool }, {
        workspaceId,
        traceId,
        toolName,
        result,
        ms: toolMs,
        ok,
        round,
        summary,
        privateTool: isPrivate,
      }).catch(noteFailure('tool trace not recorded', { agentId }));
    }

    const safeResult = isPrivate ? '[private]' : result;
    const resultText = typeof safeResult === 'string' ? safeResult : JSON.stringify(safeResult);
    const resultPreview = resultText.length > 260 ? `${resultText.slice(0, 260)}...` : resultText;
    const action = {
      tool: toolName,
      args: isPrivate ? {} : args,
      ...(summary ? { summary } : {}),
      result: safeResult,
      result_preview: resultPreview,
      result_chars: resultText.length,
      ms: toolMs,
      round,
      ok,
    };
    toolActions.push(action);
    timings.tool_calls.push({
      tool: toolName,
      ms: toolMs,
      round,
      result_chars: resultText.length,
      ok,
    });

    // Feed result back to model
    chatMessages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: result,
    });
  }
}
