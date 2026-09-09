import pool from '../../db.js';
import { executeTool, TOOL_DEFINITIONS } from '../../tools.js';
import { MAX_CHAT_MODEL_ROUNDS, FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS, extractMessageText } from './shared.js';
import { shouldSynthesizeAfterToolBatch, buildToolSynthesisPrompt, summarizeToolActions } from './prompts.js';
import { withLongcatToolCallFallback } from './longcatToolCalls.js';
import { withReasoningContentFallback, normalizeToolCallArguments, reportEmptyModelResponse } from './reasoningFallback.js';
import { processAgentMarkers } from './markers.js';
import { summarizeToolCall } from './toolSummary.js';
import { toolCallOk } from './toolOutcome.js';
import { detectUnexecutedClaims } from './claimTripwire.js';
import { runVulnerabilityTripwire, detectVulnerabilities } from './vulnerabilityTripwire.js';
import { evaluatePolicy } from '../../policy/engine.js';
import { recordPolicyEvidence } from '../../policy/evidence.js';
import { recordTraceRound, recordToolTrace, recordTraceFailure } from '../../operational-intelligence/traces.js';
import { isPrivateTraceTool } from '../../operational-intelligence/tracePrivacy.js';
import { createChatToolSession } from './toolSession.js';
import { callChatModelRound, chatModelAccessContext } from './modelRound.js';

export async function runChatLoop({
  agentId,
  windowId,
  workspaceId = 'default', authorizationWorkspaceId = null,
  chatMessages,
  toolsForCaller,
  reqModel,
  reqBaseUrl,
  reqApiKey,
  reqProvider,
  sendEvent,
  onModelAccepted,
  timings,
  userId,
  traceId
}) {
  let toolActions = [];
  let finalText = '';
  let synthesisRequested = false;
  let synthesisReason = null;
  let round = 0;
  const toolSession = createChatToolSession(toolsForCaller, reqProvider);
  const toolContext = { userId, ...(authorizationWorkspaceId ? { workspaceId: authorizationWorkspaceId } : {}) };
  const accessContext = chatModelAccessContext(userId, authorizationWorkspaceId);
  let modelAccepted = false;
  if (toolSession.prompt) chatMessages.splice(1, 0, { role: 'system', content: toolSession.prompt });

  for (;;) {
    round += 1;
    if (round > MAX_CHAT_MODEL_ROUNDS) {
      finalText = summarizeToolActions(toolActions);
      break;
    }
    if (round > 1) {
      sendEvent({ type: 'status', status: 'thinking', detail: { round } });
    }

    const activeTools = toolSession.list();
    if (traceId) {
      recordTraceRound({ db: pool }, {
        workspaceId,
        traceId,
        round,
        messages: chatMessages,
        toolsAvailable: activeTools,
        modelConfig: { model: reqModel, baseUrl: reqBaseUrl }
      }).catch(err => console.error('Failed to record trace round:', err.message));
    }

    const modelStartedAt = Date.now();
    const data = await callChatModelRound({
      accessContext,
      activeTools,
      chatMessages,
      includeTools: !synthesisRequested,
      reqApiKey,
      reqBaseUrl,
      reqModel,
      reqProvider,
      round,
      userId,
      workspaceId,
    });
    if (!modelAccepted) {
      modelAccepted = true;
      onModelAccepted?.();
    }
    const modelMs = Date.now() - modelStartedAt;
    timings.model_ms += modelMs;
    timings.model_calls.push({
      round,
      ms: modelMs,
      messages: chatMessages.length,
      tools_available: activeTools.length,
      synthesis_requested: synthesisRequested,
      synthesis_reason: synthesisReason,
    });
    const choice = data.choices?.[0];
    const msg = withReasoningContentFallback(withLongcatToolCallFallback(choice?.message));
    reportEmptyModelResponse(sendEvent, reqModel, choice, msg);

    if (!synthesisRequested && msg?.tool_calls && msg.tool_calls.length > 0) {
      const calls = msg.tool_calls.slice(0, 15);
      chatMessages.push({ ...msg, tool_calls: calls });
      const requiredArgsByTool = new Map(
        (toolsForCaller || TOOL_DEFINITIONS).map(t => [
          t.function.name,
          t.function.parameters?.required || [],
        ])
      );

      for (const call of calls) {
        const toolName = call.function.name;
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
        };

        const isPrivate = isPrivateTraceTool(toolName);
        const summary = isPrivate ? null : summarizeToolCall(toolName, args);

        const highImpactTools = ['local_write_file', 'github_write_file', 'postgres_query', 'sandbox_exec', 'container_restart'];
        let policyResult = { decision: 'allow' };
        if (highImpactTools.includes(toolName)) {
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
          result = argError
            ? `${argError}. Call ${toolName} again with the required arguments.`
            : policyResult.decision === 'deny'
              ? `Policy Denied: ${policyResult.reason}`
              : await executeTool(agentId, toolName, args, toolContext);
        } catch (toolErr) {
          result = `Tool execution error: ${toolErr.message}`;
          if (traceId) {
            recordTraceFailure({ db: pool }, {
              workspaceId,
              traceId,
              error: toolErr,
              contextSnapshot: { toolName, round, messagesCount: chatMessages.length }
            }).catch(e => console.error('Failed to record tool failure trace:', e.message));
          }
        }
        const toolMs = Date.now() - toolStartedAt;
        timings.tool_ms += toolMs;
        const ok = toolCallOk(result);
        toolSession.observe(toolName, args, ok);
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
          }).catch(err => console.error('Failed to record tool trace:', err.message));
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

      if (!synthesisRequested && toolActions.length > 0 && shouldSynthesizeAfterToolBatch(toolActions, round)) {
        synthesisRequested = true;
        synthesisReason = round >= FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS ? 'tool_round_limit' : 'direct_after_write';
        chatMessages.push({
          role: 'user',
          content: buildToolSynthesisPrompt(toolActions),
        });
      }

      // Continue loop — model will process tool results and either
      // call more tools or respond with text
      continue;
    }

    // Model responded with text — we're done. Some OpenAI-compatible local
    // providers occasionally return an empty assistant message after tools;
    // give them one explicit synthesis pass before falling back to tool output.
    finalText = extractMessageText(msg?.content);
    if (!finalText && toolActions.length > 0 && !synthesisRequested) {
      synthesisRequested = true;
      synthesisReason = 'empty_after_tools';
      chatMessages.push({
        role: 'user',
        content: buildToolSynthesisPrompt(toolActions),
      });
      continue;
    }
    if (!finalText) finalText = summarizeToolActions(toolActions);
    break;
  }

  const markerResult = await processAgentMarkers(agentId, finalText,
    (aId, name, args) => executeTool(aId, name, args, toolContext), sendEvent);
  if (markerResult.markers.length > 0) {
    finalText = markerResult.text;
    toolActions.push(...markerResult.actions);
    for (const action of markerResult.actions) {
      action.ok = toolCallOk(action.result);
      timings.tool_ms += action.ms || 0;
      timings.tool_calls.push({
        tool: action.tool,
        ms: action.ms || 0,
        round: action.round,
        result_chars: action.result_chars,
        ok: action.ok,
      });
    }
  }

  const unexecutedClaimWarning = detectUnexecutedClaims(finalText, toolActions);
  if (unexecutedClaimWarning) {
    finalText = `${finalText}\n\n${unexecutedClaimWarning}`;
    sendEvent({ type: 'status', status: 'unexecuted_claim' });
  }

  // Embedded Validation Pipeline: Real-time vulnerability scanning
  const tripwireResult = await runVulnerabilityTripwire(agentId, finalText, userId);
  finalText = tripwireResult.finalText;
  if (tripwireResult.issues.length > 0) {
    sendEvent({ type: 'status', status: 'security_warning', detail: { count: tripwireResult.issues.length } });
  }

  const vulnerabilityResult = await detectVulnerabilities(finalText);
  if (vulnerabilityResult) {
    if (vulnerabilityResult.blocked) {
      finalText = vulnerabilityResult.text;
    } else {
      finalText = `${finalText}\n\n${vulnerabilityResult.text}`;
    }
    sendEvent({ type: 'status', status: vulnerabilityResult.blocked ? 'vulnerability_blocked' : 'vulnerability_detected' });
  }

  return { finalText, toolActions };
}
