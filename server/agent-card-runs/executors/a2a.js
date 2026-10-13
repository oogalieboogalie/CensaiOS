import crypto from 'crypto';
import { ClientFactory, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { createA2AGuardedFetch } from '../../agent-registry/adapters/egress.js';
import { completeRun, failRun, recordRunAction } from '../../runs/lifecycle.js';
import { publishAgentCardEvent } from '../events.js';

const MAX_RESULT_CHARS = 60_000;
const CALL_TIMEOUT_MS = 120_000;

function textParts(parts) {
  return (Array.isArray(parts) ? parts : [])
    .filter((part) => part?.kind === 'text' && typeof part.text === 'string')
    .map((part) => part.text);
}

function extractTaskText(task) {
  if (task?.status?.state !== 'completed') {
    throw new Error(`A2A task did not complete (state: ${task?.status?.state || 'unknown'}).`);
  }
  const candidates = [
    ...textParts(task.status?.message?.parts),
    ...(Array.isArray(task.artifacts) ? task.artifacts.flatMap((item) => textParts(item?.parts)) : []),
    ...(Array.isArray(task.history)
      ? task.history.filter((message) => message?.role === 'agent').flatMap((message) => textParts(message.parts))
      : []),
  ];
  return candidates.join('\n').trim();
}

export function extractA2AText(result) {
  const value = result?.kind === 'message' ? textParts(result.parts).join('\n').trim()
    : result?.kind === 'task' ? extractTaskText(result) : '';
  if (!value) throw new Error('A2A response did not contain text output.');
  if (value.length > MAX_RESULT_CHARS) throw new Error('A2A response exceeded the output limit.');
  return value;
}

function defaultClient(executor, options = {}) {
  const guarded = options.guardedFetch || createA2AGuardedFetch(options);
  const timedFetch = (input, init = {}) => guarded(input, {
    ...init,
    signal: init.signal || AbortSignal.timeout(options.timeoutMs || CALL_TIMEOUT_MS),
  });
  return new ClientFactory({
    transports: [new JsonRpcTransportFactory({ fetchImpl: timedFetch })],
    preferredTransports: ['JSONRPC'],
  }).createFromAgentCard(executor.sourceCard);
}

export async function executeA2AAgentCardRun(run, executor, options = {}) {
  const metadata = { ...(run.metadata || {}), runId: run.id };
  const emit = (event) => publishAgentCardEvent(metadata, event);
  const startedAt = Date.now();
  emit({ type: 'call.event', status: 'external_dispatch' });
  try {
    await recordRunAction({
      runId: run.id, sequence: 1, name: 'agent_card.external_dispatch', status: 'succeeded',
      metadata: { adapter: 'a2a', protocolVersion: executor.protocolVersion },
    });
    const client = options.client || await defaultClient(executor, options);
    const response = await client.sendMessage({
      message: {
        kind: 'message', messageId: crypto.randomUUID(), role: 'user',
        parts: [{ kind: 'text', text: metadata.prompt }],
      },
      configuration: { blocking: true, acceptedOutputModes: ['text/plain'], historyLength: 1 },
    });
    const result = extractA2AText(response);
    const timings = { total_ms: Date.now() - startedAt, adapter: 'a2a', model_calls: [], tool_calls: [] };
    await recordRunAction({
      runId: run.id, sequence: 2, name: 'agent_card.external_complete', status: 'succeeded',
      metadata: { adapter: 'a2a', resultChars: result.length },
    });
    await completeRun({ runId: run.id, metadata: { result, tools: [], timings } });
    emit({ type: 'call.complete', status: 'succeeded', result, tools: [], timings });
    return { status: 'succeeded', result };
  } catch (error) {
    await failRun({ runId: run.id, error });
    emit({ type: 'call.failed', status: 'failed', error: error.message || 'External AgentCard call failed.' });
    return { status: 'failed', error: error.message || 'External AgentCard call failed.' };
  }
}
