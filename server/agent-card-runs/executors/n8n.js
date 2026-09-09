import crypto from 'crypto';
import {
  assertExternalEgressUrl,
  createExternalGuardedFetch,
} from '../../agent-registry/adapters/egress.js';
import { completeRun, failRun, recordRunAction } from '../../runs/lifecycle.js';
import { publishAgentCardEvent } from '../events.js';

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 256_000;
const MAX_RESULT_CHARS = 60_000;
const CALL_TIMEOUT_MS = 120_000;

export function n8nSessionId(metadata = {}) {
  const identity = `${metadata.workspaceId || ''}\0${metadata.cardId || ''}\0${metadata.callerId || ''}`;
  return `censai-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

function outputCandidates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const message = typeof value.message === 'string' ? value.message : value.message?.text;
  return [value.output, value.text, message]
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function extractN8NText(value) {
  const candidates = [...new Set(outputCandidates(value))];
  if (candidates.length === 0) throw new Error('n8n response did not contain text output.');
  if (candidates.length > 1) throw new Error('n8n response contained ambiguous text outputs.');
  if (candidates[0].length > MAX_RESULT_CHARS) throw new Error('n8n response exceeded the output limit.');
  return candidates[0];
}

async function readJson(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/json') && !type.includes('+json')) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error('n8n response must be JSON.');
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error('n8n response exceeded the body limit.');
  }
  const reader = response.body?.getReader?.();
  if (!reader) return JSON.parse(await response.text());
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('n8n response exceeded the body limit.');
    }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function sendMessage(run, executor, options) {
  const guardedFetch = options.guardedFetch || createExternalGuardedFetch(options);
  let endpoint = await assertExternalEgressUrl(executor.endpoint, options);
  const body = JSON.stringify({
    action: 'sendMessage',
    chatInput: run.metadata?.prompt,
    sessionId: n8nSessionId(run.metadata),
  });
  const signal = AbortSignal.timeout(options.timeoutMs || CALL_TIMEOUT_MS);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await guardedFetch(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body,
      signal,
    });
    if ([307, 308].includes(response.status)) {
      await response.body?.cancel?.().catch(() => {});
      if (redirects === MAX_REDIRECTS) throw new Error('n8n webhook redirected too many times.');
      const location = response.headers.get('location');
      if (!location) throw new Error('n8n webhook redirect omitted Location.');
      endpoint = await assertExternalEgressUrl(new URL(location, endpoint), options);
      continue;
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error(`n8n webhook returned unsafe redirect HTTP ${response.status}.`);
    }
    if (!response.ok) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error(`n8n webhook returned HTTP ${response.status}.`);
    }
    return extractN8NText(await readJson(response));
  }
  throw new Error('n8n webhook call failed.');
}

export async function executeN8NChatAgentCardRun(run, executor, options = {}) {
  const metadata = { ...(run.metadata || {}), runId: run.id };
  const emit = (event) => publishAgentCardEvent(metadata, event);
  const startedAt = Date.now();
  emit({ type: 'call.event', status: 'external_dispatch' });
  try {
    await recordRunAction({
      runId: run.id, sequence: 1, name: 'agent_card.external_dispatch', status: 'succeeded',
      metadata: { adapter: 'n8n_chat', protocolVersion: executor.protocolVersion },
    });
    const result = await sendMessage(run, executor, options);
    const timings = { total_ms: Date.now() - startedAt, adapter: 'n8n_chat', model_calls: [], tool_calls: [] };
    await recordRunAction({
      runId: run.id, sequence: 2, name: 'agent_card.external_complete', status: 'succeeded',
      metadata: { adapter: 'n8n_chat', resultChars: result.length },
    });
    await completeRun({ runId: run.id, metadata: { result, tools: [], timings } });
    emit({ type: 'call.complete', status: 'succeeded', result, tools: [], timings });
    return { status: 'succeeded', result };
  } catch (error) {
    await failRun({ runId: run.id, error });
    emit({ type: 'call.failed', status: 'failed', error: error.message || 'n8n AgentCard call failed.' });
    return { status: 'failed', error: error.message || 'n8n AgentCard call failed.' };
  }
}
