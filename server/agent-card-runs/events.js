import { publish } from '../ws/registryHub.js';

export function agentCardActorChannel(cardId, callerId) {
  return `${String(cardId)}\u001fuser:${String(callerId)}`;
}

export function publishAgentCardEvent(metadata, event) {
  const channel = agentCardActorChannel(metadata.cardId, metadata.callerId);
  return publish(channel, {
    ...event,
    cardId: metadata.cardId,
    taskId: metadata.clientTaskId,
    runId: metadata.runId,
  });
}
