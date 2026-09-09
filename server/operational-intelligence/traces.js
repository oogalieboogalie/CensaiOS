import { createArtifact, createWorkspaceEvent } from './factories.js';
import {
  sanitizeToolTracePayload,
  sanitizeTraceFailurePayload,
  sanitizeTraceInitialContext,
  sanitizeTraceRoundPayload,
  sanitizeTraceTimings,
} from './tracePrivacy.js';

/**
 * Creates a new agent session trace artifact.
 */
export async function createSessionTrace(ctx, { workspaceId, agentId, windowId, initialContext }) {
  return createArtifact(ctx, {
    workspaceId,
    type: 'agent_session_trace',
    title: `Chat Session: ${agentId} (${new Date().toISOString()})`,
    owner: { kind: 'agent', id: agentId },
    data: {
      agentId,
      windowId,
      initialContext: sanitizeTraceInitialContext(initialContext),
      status: 'active',
      startedAt: new Date().toISOString(),
    },
    metadata: {
      source: 'chat_api',
    },
  });
}

/**
 * Records a round of agent reasoning and tool usage.
 */
export async function recordTraceRound(ctx, { workspaceId, traceId, round, messages, toolsAvailable, modelConfig }) {
  return createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'agent.round',
    actor: { kind: 'system', id: 'observability' },
    artifactId: traceId,
    payload: sanitizeTraceRoundPayload({ round, messages, toolsAvailable, modelConfig }),
  });
}

/**
 * Records a tool invocation and its result.
 */
export async function recordToolTrace(ctx, {
  workspaceId, traceId, toolName, result, ms, ok, round, summary, privateTool,
}) {
  return createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'tool.invocation',
    actor: { kind: 'system', id: 'observability' },
    artifactId: traceId,
    payload: sanitizeToolTracePayload({ toolName, result, ms, ok, round, summary, privateTool }),
  });
}

/**
 * Records a session failure using metadata only.
 */
export async function recordTraceFailure(ctx, { workspaceId, traceId, error, contextSnapshot }) {
  return createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'session.failure',
    actor: { kind: 'system', id: 'observability' },
    artifactId: traceId,
    payload: sanitizeTraceFailurePayload({ error, contextSnapshot }),
  });
}

/**
 * Updates the trace artifact with final summary data.
 */
export async function finalizeTrace(ctx, { traceId, status, finalText, timings, totalTokens }) {
  const db = ctx.db;
  const finalStatus = status === 'failed' ? 'failed' : 'success';
  const tokenCount = Number(totalTokens);
  await db.query(
    `UPDATE artifacts
     SET status = $2,
         data = (data - 'finalTextPreview') || $3::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [
      traceId,
      finalStatus === 'failed' ? 'archived' : 'active',
      JSON.stringify({
        status: finalStatus,
        finalTextLength: typeof finalText === 'string' ? finalText.length : 0,
        timings: sanitizeTraceTimings(timings),
        totalTokens: Number.isFinite(tokenCount) && tokenCount >= 0 ? tokenCount : undefined,
        endedAt: new Date().toISOString(),
      }),
    ]
  );
}
