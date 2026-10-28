import pool from '../../db.js';
import { executeTool } from '../../tools.js';
import { MAX_CHAT_MODEL_ROUNDS, FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS, extractMessageText } from './shared.js';
import { shouldSynthesizeAfterToolBatch, buildToolSynthesisPrompt, summarizeToolActions } from './prompts.js';
import { withLongcatToolCallFallback } from './longcatToolCalls.js';
import { heldBackReplyText, withReasoningContentFallback, reportEmptyModelResponse } from './reasoningFallback.js';
import { processAgentMarkers } from './markers.js';
import { toolCallOk } from './toolOutcome.js';
import { detectUnexecutedClaims } from './claimTripwire.js';
import { runVulnerabilityTripwire, detectVulnerabilities } from './vulnerabilityTripwire.js';
import { recordTraceRound } from '../../operational-intelligence/traces.js';
import { createChatToolSession } from './toolSession.js';
import { noteFailure } from './chatLog.js';
import { runToolCalls } from './toolRound.js';
import { callChatModelRound, chatModelAccessContext, forwardDeltas, modelTokens, throwIfChatAborted } from './modelRound.js';

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
  userId, atThisComputer = false,
  traceId, signal = null, runTool = executeTool,
}) {
  let toolActions = [];
  let finalText = '';
  let synthesisRequested = false;
  let synthesisReason = null;
  let round = 0;
  const toolSession = createChatToolSession(toolsForCaller, reqProvider);
  const toolContext = { userId, ...(atThisComputer === true ? { atThisComputer: true } : {}), ...(windowId ? { windowId } : {}), ...(authorizationWorkspaceId ? { workspaceId: authorizationWorkspaceId } : {}) };
  const accessContext = chatModelAccessContext(userId, authorizationWorkspaceId);
  let modelAccepted = false;
  const acceptModel = () => { if (!modelAccepted) { modelAccepted = true; onModelAccepted?.(); } };
  if (toolSession.prompt) chatMessages.splice(1, 0, { role: 'system', content: toolSession.prompt });

  for (;;) {
    throwIfChatAborted(signal);
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
        workspaceId, traceId,
        round,
        messages: chatMessages,
        toolsAvailable: activeTools,
        modelConfig: { model: reqModel, baseUrl: reqBaseUrl }
      }).catch(noteFailure('trace round not recorded', { agentId }));
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
      workspaceId, agentId, windowId,
      onDelta: forwardDeltas(round, sendEvent, acceptModel),
    });
    acceptModel();
    const modelMs = Date.now() - modelStartedAt;
    timings.model_ms += modelMs;
    timings.model_calls.push({
      round,
      ms: modelMs,
      messages: chatMessages.length,
      tools_available: activeTools.length,
      synthesis_requested: synthesisRequested,
      synthesis_reason: synthesisReason, ...modelTokens(data?.usage),
    });
    const choice = data.choices?.[0];
    const msg = withReasoningContentFallback(withLongcatToolCallFallback(choice?.message));
    reportEmptyModelResponse(sendEvent, reqModel, choice, msg);

    if (!synthesisRequested && msg?.tool_calls && msg.tool_calls.length > 0) {
      const calls = msg.tool_calls.slice(0, 15);
      chatMessages.push({ ...msg, tool_calls: calls });
      await runToolCalls(calls, {
        agentId, windowId, workspaceId, authorizationWorkspaceId, userId, reqModel,
        traceId, signal, runTool, toolContext, toolSession, toolsForCaller,
        chatMessages, sendEvent, timings, toolActions, round,
      });

      if (!synthesisRequested && toolActions.length > 0 && shouldSynthesizeAfterToolBatch(toolActions, round)) {
        synthesisRequested = true;
        synthesisReason = round >= FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS ? 'tool_round_limit' : 'direct_after_write';
        chatMessages.push({
          role: 'user',
          content: buildToolSynthesisPrompt(toolActions),
        });
      }

      // Continue: the model reads the tool results, then calls more tools or answers.
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
    if (!finalText) finalText = (toolActions.length ? '' : heldBackReplyText(choice)) || summarizeToolActions(toolActions);
    break;
  }

  const markerResult = await processAgentMarkers(agentId, finalText,
    (aId, name, args) => runTool(aId, name, args, toolContext), sendEvent);
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
