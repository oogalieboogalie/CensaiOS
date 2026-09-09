import { getAgent, logConversation } from '../../memory.js';
import { prepareChatContext } from '../../routes/chat/chatContext.js';
import { runChatLoop } from '../../routes/chat/chatExecution.js';
import { publicTimings, publicToolActions } from '../../routes/chat/shared.js';
import { completeRun, failRun, recordRunAction } from '../../runs/lifecycle.js';
import { resolveBuiltInAgentId, safeRuntimeEvent } from '../contract.js';
import { publishAgentCardEvent } from '../events.js';

function newTimings() {
  return { total_ms: 0, setup_ms: 0, model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] };
}

function stepName(event) {
  return `agent_card.${String(event.status || event.type || 'event')}`
    .toLowerCase().replace(/[^a-z0-9_.-]+/g, '_');
}

export async function executeBuiltInAgentCardRun(run, card) {
  const metadata = { ...(run.metadata || {}), runId: run.id };
  const executionUserId = Object.prototype.hasOwnProperty.call(metadata, 'userId')
    ? metadata.userId : metadata.callerId;
  let sequence = 1;
  let eventWrites = Promise.resolve();
  const startedAt = Date.now();
  const timings = newTimings();
  const emit = (event) => publishAgentCardEvent(metadata, event);
  const recordEvent = (rawEvent) => {
    const event = safeRuntimeEvent(rawEvent);
    const currentSequence = sequence++;
    emit({ type: 'call.event', status: event.status, detail: event.detail });
    eventWrites = eventWrites.then(() => recordRunAction({
      runId: run.id, sequence: currentSequence, name: stepName(event),
      status: 'succeeded', metadata: event,
    }));
  };

  emit({ type: 'call.event', status: 'running' });
  try {
    const agentId = resolveBuiltInAgentId(card);
    if (!agentId || agentId !== metadata.agentId) throw new Error('AgentCard identity changed after queueing.');
    const agent = await getAgent(agentId);
    if (!agent) throw new Error(`Registered core agent "${agentId}" was not found.`);
    const setupStartedAt = Date.now();
    const context = await prepareChatContext(
      agentId, null, [{ from: 'me', text: metadata.prompt }],
      executionUserId, null, metadata.workspaceId || null
    );
    timings.setup_ms = Date.now() - setupStartedAt;
    const { finalText, toolActions } = await runChatLoop({
      agentId, windowId: null, workspaceId: metadata.workspaceId || 'default',
      authorizationWorkspaceId: metadata.workspaceId || null,
      chatMessages: context.chatMessages, toolsForCaller: context.toolsForCaller,
      reqModel: context.reqModel, reqBaseUrl: context.reqBaseUrl,
      reqApiKey: context.reqApiKey, reqProvider: context.reqProvider,
      sendEvent: recordEvent, timings, userId: executionUserId, traceId: null,
    });
    await eventWrites;
    timings.total_ms = Date.now() - startedAt;
    const tools = publicToolActions(toolActions);
    const safeTimings = publicTimings(timings);
    await Promise.allSettled([
      logConversation(agentId, 'user', metadata.prompt, {
        workspaceId: metadata.workspaceId, userId: executionUserId,
      }),
      logConversation(agentId, 'assistant', finalText, {
        workspaceId: metadata.workspaceId, userId: executionUserId,
      }),
    ]);
    await recordRunAction({
      runId: run.id, sequence: sequence++, name: 'agent_card.complete', status: 'succeeded',
      metadata: { resultChars: finalText.length, tools: tools || [] },
    });
    await completeRun({
      runId: run.id, metadata: { result: finalText, tools: tools || [], timings: safeTimings },
    });
    emit({ type: 'call.complete', status: 'succeeded', result: finalText, tools, timings: safeTimings });
    return { status: 'succeeded', result: finalText };
  } catch (error) {
    await eventWrites.catch(() => {});
    timings.total_ms = Date.now() - startedAt;
    await failRun({ runId: run.id, error });
    emit({ type: 'call.failed', status: 'failed', error: error.message || 'AgentCard call failed.' });
    return { status: 'failed', error: error.message || 'AgentCard call failed.' };
  }
}
