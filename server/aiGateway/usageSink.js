import pool from '../db.js';
import { createLogger } from '../logger.js';
import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { usageErrorSummary } from './usage.js';

const log = createLogger('ai:usage-sink');

export function usageEventPayload(record = {}, attribution = {}) {
  return compactObject({
    usageType: record.type,
    ok: record.ok,
    source: attribution.source || record.source,
    provider: record.provider,
    model: record.model,
    ms: record.ms,
    attempts: record.attempts,
    requestCount: requestCount(record),
    resultCount: resultCount(record),
    finishReason: record.finishReason,
    dimensions: record.dimensions,
    usage: record.usage,
    error: usageErrorSummary(record.error),
  });
}

export function bestEffortUsageSink(usageSink, sinkLog = log) {
  if (typeof usageSink !== 'function') return null;
  return async (input) => {
    try {
      return await usageSink(input);
    } catch (error) {
      sinkLog.warn('usage event append failed', {
        error: error?.message || String(error),
        source: input?.attribution?.source || input?.record?.source,
        usageType: input?.record?.type,
      });
      return null;
    }
  };
}

export async function createUsageWorkspaceEvent(ctx, {
  record,
  attribution = {},
} = {}) {
  if (!String(attribution.workspaceId || '').trim()) return null;
  try {
    return await createWorkspaceEvent(ctx, {
      workspaceId: attribution.workspaceId,
      type: 'ai.usage.recorded',
      actor: attribution.actor,
      artifactId: attribution.artifactId,
      correlationId: attribution.correlationId,
      payload: usageEventPayload(record, attribution),
    });
  } catch (error) {
    (ctx.log || log).warn('usage event append failed', {
      error: error?.message || String(error),
      source: attribution.source || record?.source,
      usageType: record?.type,
    });
    return null;
  }
}

export function workspaceUsageSink(input) {
  return createUsageWorkspaceEvent({ db: pool, log }, input);
}

function requestCount(record) {
  return record.messages ?? record.inputs ?? record.prompts;
}

function resultCount(record) {
  if (record.type === 'chat_completion') return record.ok ? 1 : 0;
  return record.images ?? record.candidates;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}
