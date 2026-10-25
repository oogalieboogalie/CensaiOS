import { getAgent, logConversation } from '../../memory.js';
import { newTimings, runAgentTurn } from '../../runEngine/index.js';
import { publicTimings, publicToolActions } from '../../chatModel/display.js';
import { completeRun, failRun, recordRunAction } from '../../runs/lifecycle.js';
import { recordScheduleRunOutcome } from '../../scheduler/lastRun.js';
import { resolveBuiltInAgentId, safeRuntimeEvent } from '../contract.js';
import { publishAgentCardEvent } from '../events.js';

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
    // Same run engine as the chat window (server/runEngine).
    const { finalText, toolActions } = await runAgentTurn({
      origin: 'help', agentId, messages: [{ from: 'me', text: metadata.prompt }],
      userId: executionUserId, workspaceId: metadata.workspaceId || null,
      loopWorkspaceId: metadata.workspaceId || 'default', sendEvent: recordEvent, timings,
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
    await recordScheduleRunOutcome({
      scheduleId: metadata.scheduleId, runId: run.id, agentId: metadata.agentId, answer: finalText,
    });
    return { status: 'succeeded', result: finalText };
  } catch (error) {
    await eventWrites.catch(() => {});
    timings.total_ms = Date.now() - startedAt;
    await failRun({ runId: run.id, error });
    emit({ type: 'call.failed', status: 'failed', error: error.message || 'AgentCard call failed.' });
    await recordScheduleRunOutcome({
      scheduleId: metadata.scheduleId, runId: run.id, agentId: metadata.agentId, failed: true,
    });
    return { status: 'failed', error: error.message || 'AgentCard call failed.' };
  }
}
