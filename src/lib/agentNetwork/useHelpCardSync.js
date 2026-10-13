// Keeps a help-request card current and hands the answer back.
//   - network cards read the server help request; cli cards read the Agent
//     Console task. Any open board polls while the card is active and writes
//     what it sees into the card, which Yjs then shares with everyone.
//   - When the answer lands, it is posted into the asking chat window once,
//     and the helper's own chat gets the exchange (the request it got and the
//     answer it gave) as its own message pair.
//     Two browsers may both see it finish, so each claims the delivery in the
//     shared card and only the claim that survives the CRDT merge posts.

import React from 'react';
import { useWorkspaceStore } from '../store.js';
import { getCollaborationClientId } from '../collaboration/clientIdentity.js';
import { createAgentNetworkClient } from '../agentRegistry/networkClient.js';
import { cliAgentsApi } from '../../components/agentConsole/cliAgentsApi.js';
import { ACTIVE_HELP_STATUSES, clipResult } from '../../../server/agent-registry/helpCardShape.js';

const POLL_MS = 3000;
const CLAIM_SETTLE_MS = 900;
const TERMINAL = new Set(['completed', 'failed']);
const CLI_STATUS = { done: 'completed', failed: 'failed', stopped: 'failed', needs_approval: 'needs approval' };

function cliPatch(task) {
  if (!task) return null;
  const status = CLI_STATUS[task.status] || 'working';
  return { status, result: clipResult(task.summary), error: task.status === 'failed' ? (task.error || 'The coding agent stopped with an error.') : null };
}

function networkPatch(request) {
  if (!request) return null;
  const patch = { status: request.status, result: clipResult(request.result), error: request.error || null };
  if (request.receipt) patch.receipt = request.receipt;
  return Array.isArray(request.tools) && request.tools.length ? { ...patch, tools: request.tools } : patch;
}

/** The helper's tool calls (outside MCP tools included) as a chat message activity strip. */
export function helperActivity(card) {
  const tools = Array.isArray(card.tools) ? card.tools : [];
  if (!tools.length) return {};
  return { activity: { tools: tools.map((t) => ({ name: t.tool, ms: t.ms, ok: t.ok, summary: t.summary })) } };
}

async function readOnce(win, workspaceId) {
  if (win.executor === 'network' && win.helpRequestId && workspaceId) {
    return networkPatch(await createAgentNetworkClient({ workspaceId }).getHelpRequest(win.helpRequestId));
  }
  if (win.executor === 'cli' && win.cliTaskId) {
    const data = await cliAgentsApi.task(win.cliTaskId);
    return cliPatch(data?.task || data);
  }
  return null;
}

function changed(win, patch) {
  return patch && Object.keys(patch).some((key) => (win[key] ?? null) !== (patch[key] ?? null));
}

function isChat(win) {
  return win?.kind === 'chat' && Boolean(win.agentId);
}

/** The asking chat still has to get the answer. */
export function needsAskerDelivery(card) {
  return card.status === 'completed' && !card.deliveredAt && !card.awaitingTool && Boolean(card.fromWindowId);
}

/** The helper's own chat still has to show the exchange. */
export function needsHelperLog(card, wins) {
  if (card.helperLoggedAt || card.awaitingTool || !TERMINAL.has(card.status) || !card.toWindowId) return false;
  return isChat(wins.find((win) => win.id === card.toWindowId));
}

/** The incoming request and the helper's answer, as the helper's own messages. */
export function helperExchange(card, asker) {
  const askerId = asker?.agentId || (String(card.createdBy || '').startsWith('agent:') ? String(card.createdBy).slice(6) : 'peer');
  const answer = card.status === 'completed'
    ? card.result || '(no answer)'
    : `I could not finish this: ${card.error || 'the request failed.'}`;
  return [
    { from: askerId, text: card.task, helpCardId: card.id, helpRequest: { fromLabel: card.fromLabel } },
    { helpCardId: card.id, text: answer, helpReply: { toLabel: card.fromLabel }, ...helperActivity(card), ...(card.receipt ? { receipt: card.receipt } : {}) },
  ];
}

export function deliverHelpAnswer(cardId, clientId = getCollaborationClientId()) {
  const store = useWorkspaceStore.getState();
  const card = store.wins.find((win) => win.id === cardId);
  if (!card || card.deliveryClaim !== clientId) return false;
  const now = new Date().toISOString();
  const patch = {};
  const asker = store.wins.find((win) => win.id === card.fromWindowId);
  if (needsAskerDelivery(card)) {
    if (isChat(asker)) {
      const msgs = Array.isArray(asker.msgs) ? asker.msgs : [];
      store.onUpdate(asker.id, {
        msgs: [...msgs, { from: asker.agentId, text: `Help from ${card.toLabel}:\n\n${card.result || '(no answer)'}`, helpCardId: card.id, ...(card.receipt ? { receipt: card.receipt } : {}) }],
      });
    }
    patch.deliveredAt = now;
  }
  if (needsHelperLog(card, store.wins)) {
    const helper = store.wins.find((win) => win.id === card.toWindowId);
    const msgs = Array.isArray(helper.msgs) ? helper.msgs : [];
    if (!msgs.some((msg) => msg.helpCardId === card.id)) {
      const [request, answer] = helperExchange(card, asker);
      store.onUpdate(helper.id, { msgs: [...msgs, request, { ...answer, from: helper.agentId }] });
    }
    patch.helperLoggedAt = now;
  }
  if (!Object.keys(patch).length) return false;
  store.onUpdate(card.id, patch);
  return true;
}

export function useHelpCardSync(win, onUpdate) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const active = ACTIVE_HELP_STATUSES.has(win.status) || win.status === 'needs approval';
  const winRef = React.useRef(win);
  winRef.current = win;
  const onUpdateRef = React.useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  React.useEffect(() => {
    if (!active || win.executor === 'module' || win.executor === 'research') return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const patch = await readOnce(winRef.current, workspaceId);
        if (alive && changed(winRef.current, patch)) onUpdateRef.current?.(patch);
      } catch (error) {
        if (alive && error?.status === 404) onUpdateRef.current?.({ status: 'failed', error: 'This request is gone.' });
      }
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [active, win.executor, workspaceId]);

  const helperChat = useWorkspaceStore((state) => {
    const helper = state.wins.find((entry) => entry.id === win.toWindowId);
    return isChat(helper);
  });
  const needsDelivery = needsAskerDelivery(win)
    || (helperChat && !win.helperLoggedAt && !win.awaitingTool && TERMINAL.has(win.status));
  React.useEffect(() => {
    if (!needsDelivery) return undefined;
    const me = getCollaborationClientId();
    if (!winRef.current.deliveryClaim) onUpdateRef.current?.({ deliveryClaim: me });
    const timer = setTimeout(() => deliverHelpAnswer(winRef.current.id, me), CLAIM_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [needsDelivery]);
}
