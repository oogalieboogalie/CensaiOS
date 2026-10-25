import pool from '../../db.js';
import { dbReady } from '../../dbState.js';
import { logConversation, runHealingCascadeIfMentioned } from '../../memory.js';
import { getApiKey, publicToolActions, publicTimings } from './shared.js';
import { runAgentTurn } from '../../runEngine/index.js';
import { createSessionTrace, finalizeTrace } from '../../operational-intelligence/traces.js';
import { applyChatRetryHeader, publicChatError } from './httpErrors.js';
import { resolveFreeTierRuntime } from '../../aiGateway/freeTierRuntime.js';
import { isCloudRuntime } from '../../middleware/runtimeMode.js';
import { isFromAnotherComputer } from '../../webOs/door.js';
import { safeTimeZone } from '../../../src/lib/agentMemory/timeWords.js';
import { chatLog, noteFailure } from './chatLog.js';
import { safeErrorCode } from '../../security/errorCode.js';

export async function handleChat(req, res) {
  const { messages, agentId, windowId, workspaceId, currentProject, stream, conversationId, timeZone } = req.body;
  const startedAt = Date.now();
  const timings = {
    total_ms: 0,
    setup_ms: 0,
    model_ms: 0,
    tool_ms: 0,
    model_calls: [],
    tool_calls: [],
  };

  const isStreaming = !!stream;
  // Spec 3 stop button: the browser aborts its fetch, the socket closes
  // before we end the response, and the loop stops at its next step.
  const abort = new AbortController();
  res.on?.('close', () => { if (!res.writableEnded) abort.abort(); });
  let streamStarted = false;
  const bufferedEvents = [];

  const writeEvent = (obj) => {
    res.write(JSON.stringify(obj) + '\n');
    if (typeof res.flush === 'function') res.flush();
  };
  const beginStream = () => {
    if (!isStreaming || streamStarted) return;
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    streamStarted = true;
    bufferedEvents.splice(0).forEach(writeEvent);
  };
  const sendEvent = (obj) => {
    if (!isStreaming) return;
    if (!streamStarted) bufferedEvents.push(obj);
    else writeEvent(obj);
  };
  const sendError = (error) => {
    const publicError = publicChatError(error, timings);
    if (isStreaming && streamStarted) {
      sendEvent({ type: 'error', error: publicError.body });
      return res.end();
    }
    applyChatRetryHeader(res, publicError.retryAfter);
    return res.status(publicError.status).json(publicError.body);
  };

  let centrallyManagedFreeAccess = false;
  try {
    centrallyManagedFreeAccess = resolveFreeTierRuntime().enabled;
  } catch {
    return sendError(Object.assign(new Error('AI access is temporarily unavailable'), {
      code: 'FREE_TIER_CONFIG_UNAVAILABLE', statusCode: 503, retryAfter: 5,
    }));
  }
  if (!getApiKey() && !centrallyManagedFreeAccess && !isCloudRuntime()) {
    return sendError(Object.assign(
      new Error('No AI provider is configured. Add a provider key in Settings.'),
      { code: 'AI_CONFIGURATION_REQUIRED', statusCode: 503 },
    ));
  }

  let traceId = null;
  try {
    let changeImpact = null;
    let projectContext = [];
    let sevenContexts = null;
    let authorizedWorkspaceId = null;
    // The run engine (server/runEngine) builds the context, adds the outside
    // MCP tools this agent was given, and runs the model and tool loop.
    const { finalText, toolActions } = await runAgentTurn({
      origin: 'chat',
      agentId,
      messages,
      currentProject,
      userId: req.session?.userId,
      userRole: req.session?.userRole,
      // Typed at this computer, not through the web door: an owner-only refusal may name the owner.
      atThisComputer: !isFromAnotherComputer(req),
      workspaceId,
      windowId,
      conversationId: typeof conversationId === 'string' ? conversationId : null,
      timeZone: safeTimeZone(timeZone),
      sendEvent,
      onModelAccepted: beginStream,
      timings,
      signal: abort.signal,
      onPrepared: async (context) => {
        ({ changeImpact, projectContext, sevenContexts } = context);
        authorizedWorkspaceId = context.workspaceId;
        if (process.env.NODE_ENV !== 'production') {
          chatLog.debug('chat setup timed', { agentId, setupMs: timings.setup_ms });
        }
        if (dbReady()) {
          try {
            const trace = await createSessionTrace({ db: pool }, {
              workspaceId: authorizedWorkspaceId || 'default',
              agentId,
              windowId,
              initialContext: { messagesCount: messages?.length || 0 }
            });
            traceId = trace.id;
          } catch (traceErr) {
            noteFailure('session trace not created', { agentId })(traceErr);
          }
        }
        sendEvent({ type: 'status', status: 'thinking', detail: { round: 1 } });
        if (changeImpact) sendEvent({ type: 'change_impact', impact: changeImpact });
        return { traceId };
      },
    });

    if (traceId) {
      finalizeTrace({ db: pool }, {
        traceId,
        status: 'success',
        finalText,
        timings,
      }).catch(noteFailure('trace not finalized', { agentId }));
    }

    // Log conversation
    const lastUserMsg = messages?.filter(m => m.from === 'me').pop()?.text;
    if (dbReady() && agentId && lastUserMsg && authorizedWorkspaceId && req.session?.userId) {
      const memoryScope = { workspaceId: authorizedWorkspaceId, userId: req.session.userId };
      logConversation(agentId, 'user', lastUserMsg, memoryScope)
        .catch(noteFailure('dropped conversation log', { agentId, side: 'user' }));
      logConversation(agentId, 'assistant', finalText, memoryScope)
        .catch(noteFailure('dropped conversation log', { agentId, side: 'assistant' }));

      // Reactive Memory Healing Cascade
      runHealingCascadeIfMentioned(lastUserMsg, `user:${req.session.userId}`, memoryScope)
        .catch(noteFailure('memory healing cascade failed', { agentId }));
    }

    timings.total_ms = Date.now() - startedAt;
    const safeTools = publicToolActions(toolActions);
    const safeTimings = publicTimings(timings);

    if (isStreaming) {
      beginStream();
      sendEvent({
        type: 'result',
        text: finalText,
        tools: safeTools,
        timings: safeTimings,
        changeImpact,
        projectContext,
        sevenContexts,
      });
      res.end();
    } else {
      res.json({
        text: finalText,
        tools: safeTools,
        timings: safeTimings,
        changeImpact,
        projectContext,
        sevenContexts,
      });
    }
  } catch (err) {
    if (err?.code === 'CHAT_ABORTED') {
      if (traceId) {
        finalizeTrace({ db: pool }, { traceId, status: 'failed', finalText: 'Stopped by user', timings })
          .catch(noteFailure('stopped trace not finalized', { agentId }));
      }
      if (!res.writableEnded) res.end();
      return undefined;
    }
    chatLog.error('chat request failed', { agentId, code: safeErrorCode(err) });
    if (traceId) {
      finalizeTrace({ db: pool }, {
        traceId,
        status: 'failed',
        finalText: `Error: ${err.message}`,
        timings,
      }).catch(noteFailure('failed trace not finalized', { agentId }));
    }
    timings.total_ms = Date.now() - startedAt;
    return sendError(err);
  }
}
