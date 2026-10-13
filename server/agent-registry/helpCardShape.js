// AGENT NETWORK — the help-request card that sits on the shared canvas.
// Pure data, shared by the browser (a person asks from the registry) and the
// server (an agent calls request_agent_help). The card is an ordinary canvas
// window, so it syncs through the Yjs canvas doc like every other window and
// every teammate sees the same request, status and answer.

export const HELP_CARD_KIND = 'agentHelp';
export const HELP_CARD_SIZE = Object.freeze({ w: 340, h: 280 });
export const ACTIVE_HELP_STATUSES = new Set(['pending', 'queued', 'working', 'dispatched', 'waiting']);
export const AGENT_WINDOW_KINDS = new Set(['chat', 'agent', 'agentConsole', 'module']);

const GAP = 48;
const MAX_TASK = 2000;
const MAX_RESULT = 12000;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function overlapsAny(at, wins) {
  return wins.some((win) => at.x < finite(win.x) + finite(win.w, 400) && at.x + HELP_CARD_SIZE.w > finite(win.x)
    && at.y < finite(win.y) + finite(win.h, 300) && at.y + HELP_CARD_SIZE.h > finite(win.y));
}

/** Where a card goes: between the asker and the helper, or beside the helper. */
function basePosition(fromWin, toWin, nudge) {
  if (fromWin && toWin) {
    const ax = finite(fromWin.x) + finite(fromWin.w, 400) / 2;
    const ay = finite(fromWin.y) + finite(fromWin.h, 300) / 2;
    const bx = finite(toWin.x) + finite(toWin.w, 400) / 2;
    const by = finite(toWin.y) + finite(toWin.h, 300) / 2;
    const x = Math.round((ax + bx) / 2 - HELP_CARD_SIZE.w / 2);
    const y = Math.round((ay + by) / 2 - HELP_CARD_SIZE.h / 2);
    // Two windows side by side leave no gap in the middle: drop the card
    // below the pair instead of on top of them.
    const lowest = Math.max(finite(fromWin.y) + finite(fromWin.h, 300), finite(toWin.y) + finite(toWin.h, 300));
    if (overlapsAny({ x, y }, [fromWin, toWin])) return { x, y: lowest + GAP + nudge };
    return { x, y: y + nudge };
  }
  const anchor = toWin || fromWin;
  if (anchor) return { x: finite(anchor.x) + finite(anchor.w, 400) + GAP, y: finite(anchor.y) + nudge };
  return { x: 120, y: 120 + nudge };
}

/**
 * Where a card goes. `others` are the rest of the board's windows: a card
 * that would cover one of them slides down until it sits on clear canvas.
 */
export function helpCardPosition(fromWin, toWin, offset = 0, others = []) {
  const at = basePosition(fromWin, toWin, offset * 28);
  const blockers = (others || []).filter((win) => win && win.kind !== HELP_CARD_KIND
    && win.id !== fromWin?.id && win.id !== toWin?.id);
  for (let step = 0; step < 40 && overlapsAny(at, blockers); step += 1) {
    const hit = blockers.find((win) => overlapsAny(at, [win]));
    at.y = finite(hit.y) + finite(hit.h, 300) + GAP;
  }
  return at;
}

export function windowAgentLabel(win, fallback = 'Agent') {
  if (!win) return fallback;
  return String(win.title || win.agentName || win.agentId || win.cli || fallback).slice(0, 80);
}

/**
 * Build the card window. `executor` says who runs it:
 *   network — a server help request (helpRequestId), status read from the server
 *   cli     — an Agent Console task (cliTaskId)
 *   module  — a question answered by a module on the board
 */
export function helpCardWindow({
  id, request = {}, executor = 'network', fromWin = null, toWin = null,
  fromLabel, toLabel, position, others = [], createdBy = null, runnerClientId = null, now = new Date().toISOString(),
}) {
  const at = position || helpCardPosition(fromWin, toWin, 0, others);
  return {
    id: String(id),
    kind: HELP_CARD_KIND,
    title: 'Help request',
    x: Math.round(at.x), y: Math.round(at.y), w: HELP_CARD_SIZE.w, h: HELP_CARD_SIZE.h,
    executor,
    helpRequestId: request.id || null,
    cliTaskId: request.cliTaskId || null,
    cardId: request.cardId || null,
    fromWindowId: fromWin?.id || null,
    toWindowId: toWin?.id || null,
    fromLabel: String(fromLabel || windowAgentLabel(fromWin, 'A teammate')).slice(0, 80),
    toLabel: String(toLabel || request.cardName || windowAgentLabel(toWin)).slice(0, 80),
    task: String(request.task || '').slice(0, MAX_TASK),
    status: String(request.status || 'queued'),
    result: clipResult(request.result),
    error: request.error ? String(request.error).slice(0, 500) : null,
    createdBy,
    runnerClientId,
    createdAt: now,
    updatedAt: now,
  };
}

export function clipResult(value) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}…` : text;
}

export function helpCardLinks(card, makeId) {
  const links = [];
  const now = Date.now();
  if (card.fromWindowId) links.push({ id: makeId(), fromId: card.fromWindowId, toId: card.id, timestamp: now });
  if (card.toWindowId) links.push({ id: makeId(), fromId: card.id, toId: card.toWindowId, timestamp: now });
  return links;
}

/** The helper window for a card id like "agent:sage": the one nearest the asker. */
export function findHelperWindow(wins, cardId, fromWin = null) {
  const agentId = String(cardId || '').startsWith('agent:') ? String(cardId).slice(6) : null;
  if (!agentId) return null;
  const matches = (wins || []).filter((win) => (win?.kind === 'chat' || win?.kind === 'agent')
    && String(win.agentId || '').toLowerCase() === agentId && win.id !== fromWin?.id);
  if (!fromWin || matches.length < 2) return matches[0] || null;
  const dist = (win) => Math.hypot(finite(win.x) - finite(fromWin.x), finite(win.y) - finite(fromWin.y));
  return matches.sort((a, b) => dist(a) - dist(b))[0];
}
