import pool from '../../db.js';
import { dbReady } from '../../dbState.js';
import { logConversation, runHealingCascadeIfMentioned } from '../../memory.js';
import { getApiKey, publicToolActions, publicTimings } from './shared.js';
import { prepareChatContext } from './chatContext.js';
import { runChatLoop } from './chatExecution.js';
import { createSessionTrace, finalizeTrace } from '../../operational-intelligence/traces.js';
import { applyChatRetryHeader, publicChatError } from './httpErrors.js';
import { resolveFreeTierRuntime } from '../../aiGateway/freeTierRuntime.js';
import { isCloudRuntime } from '../../middleware/runtimeMode.js';

export async function handleChat(req, res) {
  const { messages, agentId, windowId, workspaceId, currentProject, stream } = req.body;
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
    const setupStartedAt = Date.now();
    const {
      reqModel, reqBaseUrl, reqApiKey, reqProvider, chatMessages, toolsForCaller, changeImpact,
      projectContext, workspaceId: authorizedWorkspaceId,
    } = await prepareChatContext(
      agentId,
      currentProject,
      messages,
      req.session?.userId,
      req.session?.userRole,
      workspaceId
    );
    timings.setup_ms = Date.now() - setupStartedAt;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Perf] Chat setup (prepareChatContext) for agent ${agentId} took ${timings.setup_ms}ms`);
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
        console.error('Failed to create session trace:', traceErr.message);
      }
    }

    sendEvent({ type: 'status', status: 'thinking', detail: { round: 1 } });
    if (changeImpact) sendEvent({ type: 'change_impact', impact: changeImpact });

    const { finalText, toolActions } = await runChatLoop({
      agentId,
      windowId,
      workspaceId: authorizedWorkspaceId || 'default',
      authorizationWorkspaceId: authorizedWorkspaceId,
      chatMessages,
      toolsForCaller,
      reqModel,
      reqBaseUrl,
      reqApiKey,
      reqProvider,
      sendEvent,
      onModelAccepted: beginStream,
      timings,
      userId: req.session?.userId,
      traceId
    });

    if (traceId) {
      finalizeTrace({ db: pool }, {
        traceId,
        status: 'success',
        finalText,
        timings,
      }).catch(err => console.error('Failed to finalize trace:', err.message));
    }

    // Log conversation
    const lastUserMsg = messages?.filter(m => m.from === 'me').pop()?.text;
    if (dbReady() && agentId && lastUserMsg && authorizedWorkspaceId && req.session?.userId) {
      const memoryScope = { workspaceId: authorizedWorkspaceId, userId: req.session.userId };
      logConversation(agentId, 'user', lastUserMsg, memoryScope).catch(err =>
        console.error('[chat] dropped conversation log (user)', { agentId, error: err.message })
      );
      logConversation(agentId, 'assistant', finalText, memoryScope).catch(err =>
        console.error('[chat] dropped conversation log (assistant)', { agentId, error: err.message })
      );

      // Reactive Memory Healing Cascade
      runHealingCascadeIfMentioned(lastUserMsg, `user:${req.session.userId}`, memoryScope).catch(err => {
        console.error('[FMHA] Error in chat healing cascade:', err.message);
      });
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
      });
      res.end();
    } else {
      res.json({
        text: finalText,
        tools: safeTools,
        timings: safeTimings,
        changeImpact,
        projectContext,
      });
    }
  } catch (err) {
    console.error('Chat API error:', err.message);
    if (traceId) {
      finalizeTrace({ db: pool }, {
        traceId,
        status: 'failed',
        finalText: `Error: ${err.message}`,
        timings,
      }).catch(e => console.error('Failed to finalize failed trace:', e.message));
    }
    timings.total_ms = Date.now() - startedAt;
    return sendError(err);
  }
}
