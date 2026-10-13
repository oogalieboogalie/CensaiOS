// server/runEngine/index.js
//
// One run engine for every way an agent gets started: a person typing in its
// chat window, another agent asking it for help (request_agent_help and the
// agent registry), and an outside app calling it through its shared endpoint.
// Imported agents run through the same paths. Each run does the same steps
// in the same order, so an agent behaves the same wherever it is asked:
//
//   1. build the agent's context (model, the owner's vault key, memory prompt,
//      the tools it is allowed)
//   2. add the outside MCP tools its owner gave it (server/outsideTools)
//   3. add the agent's memory (server/agentMemory): who it is, the facts it
//      knows with their dates, related earlier conversations, and the
//      memory tools
//   4. narrow the tools for the caller when the caller is outside censaiOS
//   5. run the model and tool loop, with a time limit when one is set
//   6. record the run as an episode, and remember the exchange when asked to
//
// While it runs, everyone on the board sees the agent's cursor move to its
// window and type the answer (server/collab/agentPresence.js).
//
// Parts 4 and 5 of docs/architecture/ideas-catalog-and-frontier-architecture.md.

import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { logConversation } from '../memory.js';
import { prepareChatContext } from '../routes/chat/chatContext.js';
import { runChatLoop } from '../routes/chat/chatExecution.js';
import { loadOutsideTools, EMPTY_OUTSIDE_TOOLS } from '../outsideTools/forAgent.js';
import { loadRunMemory, NO_MEMORY } from '../agentMemory/forRun.js';
import { withMemoryBlock } from '../agentMemory/recall.js';
import { beginAgentPresence } from '../collab/agentPresence.js';
import { getAgent } from '../memory/core/agents.js';
import { noteAgentWork } from '../social/agentNotes.js';

export const RUN_ORIGINS = Object.freeze(['chat', 'help', 'endpoint']);

export function newTimings() {
  return { total_ms: 0, setup_ms: 0, model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] };
}

/** An abort signal that fires when the caller aborts or the time runs out. */
export function runSignal(signal, timeoutMs) {
  if (!timeoutMs) return { signal, done: () => {} };
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  timer.unref?.();
  if (signal?.aborted) abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  return {
    signal: controller.signal,
    done: () => { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); },
  };
}

/**
 * Route outside tools to their server and memory tools to memory, everything
 * else to censaiOS's own tools. Undefined (the loop's own default) when the
 * agent has neither.
 */
export function toolRunner(...extras) {
  const sets = extras.filter((set) => set?.definitions?.length);
  if (!sets.length) return undefined;
  return async (agentId, name, args, context) => {
    const owner = sets.find((set) => set.has(name));
    if (owner) return owner.call(name, args);
    const { executeTool } = await import('../tools.js');
    return executeTool(agentId, name, args, context);
  };
}

export function withOutsideTools(tools, ...extras) {
  if (!Array.isArray(tools)) return tools;
  const out = [...tools];
  const seen = new Set(tools.map((tool) => tool?.function?.name));
  for (const set of extras) {
    for (const tool of set?.definitions || []) {
      if (seen.has(tool.function.name)) continue;
      seen.add(tool.function.name);
      out.push(tool);
    }
  }
  return out.length === tools.length ? tools : out;
}

async function remember({ agentId, question, answer, workspaceId, userId }) {
  if (!dbReady() || !workspaceId || !question) return;
  const scope = { workspaceId, userId };
  await Promise.allSettled([
    logConversation(agentId, 'user', question, scope),
    logConversation(agentId, 'assistant', answer, scope),
  ]);
}

/**
 * Run one agent turn. Returns { finalText, toolActions, context, timings }.
 * Throws what prepareChatContext and the loop throw (callers map errors).
 */
export async function runAgentTurn({
  origin = 'chat', agentId, messages, currentProject = null, userId = null, userRole = null,
  workspaceId = null, windowId = null, loopWorkspaceId = null, sendEvent = () => {}, onModelAccepted,
  signal = null, timeoutMs = 0, toolFilter = null, onPrepared = null, rememberQuestion = null,
  timings = newTimings(), loadOutside = loadOutsideTools, loadMemory = loadRunMemory,
}) {
  const setupStartedAt = Date.now();
  const context = await prepareChatContext(agentId, currentProject, messages, userId, userRole, workspaceId);
  const outside = agentId && userId && dbReady()
    ? await loadOutside({ db: pool, userId, agentId, origin })
    : EMPTY_OUTSIDE_TOOLS;
  const memory = agentId && userId && dbReady()
    ? await loadMemory({ db: pool, userId, agentId, origin, messages, workspaceId: context.workspaceId || workspaceId })
    : NO_MEMORY;
  context.chatMessages = withMemoryBlock(context.chatMessages, memory.block);
  let tools = withOutsideTools(context.toolsForCaller, outside, memory.tools);
  if (toolFilter) tools = toolFilter(tools);
  timings.setup_ms = Date.now() - setupStartedAt;
  const hooks = (await onPrepared?.(context)) || {};

  const limit = runSignal(signal, timeoutMs);
  const cursor = await beginAgentPresence({
    workspaceId: context.workspaceId, agentId, windowId, describe: () => getAgent(agentId),
  });
  let answer = '';
  try {
    const authorized = context.workspaceId;
    const { finalText, toolActions } = await runChatLoop({
      agentId,
      windowId,
      workspaceId: loopWorkspaceId || authorized || 'default',
      authorizationWorkspaceId: authorized ?? null,
      chatMessages: context.chatMessages,
      toolsForCaller: tools,
      reqModel: context.reqModel,
      reqBaseUrl: context.reqBaseUrl,
      reqApiKey: context.reqApiKey,
      reqProvider: context.reqProvider,
      sendEvent: cursor.wrap(sendEvent),
      onModelAccepted,
      timings,
      userId,
      traceId: hooks.traceId ?? null,
      signal: limit.signal,
      runTool: toolRunner(outside, memory.tools),
    });
    await memory.record({ answer: finalText, toolActions, model: context.reqModel });
    answer = finalText;
    // Social canvas: one line in the feed when this board is on someone's profile.
    if (authorized) {
      Promise.resolve(getAgent(agentId)).then((agent) => noteAgentWork({
        workspaceId: authorized, agentId, agentName: agent?.name, toolActions,
      })).catch(() => undefined);
    }
    if (rememberQuestion) {
      await remember({
        agentId, question: rememberQuestion, answer: finalText, workspaceId: authorized || workspaceId, userId,
      });
    }
    return { finalText, toolActions, context, timings };
  } finally {
    limit.done();
    cursor.finish(answer);
  }
}
