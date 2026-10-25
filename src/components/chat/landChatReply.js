// When a reply arrives, add it to the chat as that chat is now. The copy
// taken at send time used to replace the whole thread, so a message someone
// else wrote while the agent was answering disappeared.
import { logToApp } from '../../lib/appLog/browserLog.js';

function sameTurn(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.localDevRestartId != null || b.localDevRestartId != null) return a.localDevRestartId === b.localDevRestartId;
  return a.from === b.from && String(a.text ?? '') === String(b.text ?? '') && String(a.at || '') === String(b.at || '');
}

function sharedPrefix(now, base) {
  let i = 0;
  while (i < base.length && i < now.length && sameTurn(base[i], now[i])) i += 1;
  return i;
}

function writtenSince(now, base) {
  return now.filter((message) => !base.some((prior) => sameTurn(prior, message)));
}

/**
 * The live chat plus the reply that just arrived (one message, or a list
 * when a group answers in turn). `started` is the thread this send left
 * behind, so the question stays even if the live chat has not caught up,
 * and anything written since stays too.
 */
export function mergeChatReply(live, started, incoming) {
  const now = Array.isArray(live) ? live : [];
  const base = Array.isArray(started) ? started : [];
  const landed = (Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean);
  const shared = sharedPrefix(now, base);
  const kept = shared === base.length ? now.slice(base.length) : writtenSince(now, base);
  const msgs = shared === base.length ? [...now, ...landed] : [...base, ...kept, ...landed];
  return { msgs, kept: kept.length };
}

/** Write the reply onto the chat. One log line when that chat changed meanwhile. No message text. */
export function landChatReply(setMsgs, started, incoming, windowId) {
  let merged = [];
  setMsgs((live) => {
    const { msgs, kept } = mergeChatReply(live, started, incoming);
    if (kept > 0) {
      logToApp('info', `chat: reply landed in window ${windowId || 'unknown'}, kept ${kept} ${kept === 1 ? 'message' : 'messages'} written meanwhile`, { where: 'chat' });
    }
    merged = msgs;
    return msgs;
  });
  return merged;
}

function toolFromEvent(detail) {
  return { tool: detail.tool, ms: detail.ms, ok: detail.ok, summary: detail.summary };
}

function buildActivity(reply) {
  const timings = reply?.timings;
  const tools = reply?.tools || [];
  if (!timings && tools.length === 0 && !reply?.sevenContexts) return null;
  return {
    totalMs: timings?.total_ms,
    modelMs: timings?.model_ms,
    setupMs: timings?.setup_ms,
    toolMs: timings?.tool_ms,
    rounds: timings?.model_calls?.length || 0,
    changeImpact: reply?.changeImpact || null,
    projectContext: reply?.projectContext || [],
    sevenContexts: reply?.sevenContexts || null,
    tools: tools.map(t => ({
      name: t.tool,
      ms: t.ms,
      resultChars: t.result_chars,
      round: t.round,
      summary: t.summary,
      ok: t.ok,
    })),
  };
}

export function answerMessage(agentId, reply, sources) {
  return {
    from: agentId,
    text: reply.text,
    at: new Date().toISOString(),
    activity: buildActivity(reply),
    ...(sources?.length ? { knowledge: sources } : {}),
  };
}

export function stoppedMessage(agentId, text, events) {
  return {
    from: agentId,
    text: text || '(stopped before replying)',
    at: new Date().toISOString(),
    stopped: true,
    activity: buildActivity({ tools: (events || []).map(toolFromEvent) }),
  };
}

export function errorMessage(agentId, error) {
  return {
    from: agentId,
    at: new Date().toISOString(),
    text: error?.message || 'Something went wrong. Try again.',
    error: {
      code: error?.code,
      status: error?.status,
      retryAfter: error?.retryAfter,
      keyProvider: error?.details?.keyProvider || null,
    },
  };
}
