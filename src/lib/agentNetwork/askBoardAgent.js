// Ask an agent on the board for help. Files the request with whatever runs
// that agent (a server help request for chat agents, an Agent Console task
// for coding CLIs, a module question for built modules) and drops a request
// card on the canvas between the asking window and the helper, joined by
// link lines. The card is a normal window, so every teammate sees it.

import { useWorkspaceStore } from '../store.js';
import { getAgentById } from '../agentStore.js';
import { getCollaborationClientId } from '../collaboration/clientIdentity.js';
import { getSelf } from '../modules/presenceRoster.js';
import { askFromModule } from '../modules/moduleApi.js';
import { researchApi } from '../research/researchApi.js';
import { cliAgentsApi } from '../../components/agentConsole/cliAgentsApi.js';
import { FAMILY_AGENT_BY_ID } from '../../data/family-agents.js';
import { researchReply } from '../../../server/agent-registry/researchReply.js';
import { briefFromTask, huntSummary } from './leadHoundHelp.js';
import { HELP_CARD_KIND, clipResult, findHelperWindow, helpCardLinks, helpCardWindow } from '../../../server/agent-registry/helpCardShape.js';
import { newId } from '../ids/newId.js';

function labelFor(win) {
  if (!win) return null;
  if (win.agentId) return getAgentById(win.agentId)?.name || win.agentId;
  return win.title || null;
}

function spawnCard(card) {
  const store = useWorkspaceStore.getState();
  const { x, y, w, h, ...props } = card;
  delete props.id;
  const id = store.spawnAt(HELP_CARD_KIND, props, { x, y }, { w, h });
  for (const link of helpCardLinks({ ...card, id }, () => newId())) store.createLink(link.fromId, link.toId);
  return id;
}

function moduleQuestion(task, fromLabel) {
  return `${fromLabel ? `${fromLabel} asks` : 'A teammate asks'} for help:\n\n${task}`;
}

/**
 * @param {{ target: object, task: string, fromWindowId?: string|null, client: object, workspaceId?: string }} input
 *   target is an entry from listBoardAgents().
 * @returns {Promise<string>} the card window id
 */
export async function askBoardAgent({ target, task, fromWindowId = null, client, workspaceId }) {
  const text = String(task || '').trim();
  if (!text) throw new Error('Describe the task you need help with.');
  const { wins } = useWorkspaceStore.getState();
  const toWin = wins.find((win) => win.id === target.windowId) || null;
  const fromWin = fromWindowId ? wins.find((win) => win.id === fromWindowId) || null : null;
  if (fromWin && toWin && fromWin.id === toWin.id) throw new Error('An agent cannot ask itself for help.');
  const self = getSelf();
  const base = {
    fromWin, toWin, others: wins,
    fromLabel: labelFor(fromWin) || self?.label || 'A teammate',
    toLabel: target.name,
    createdBy: self?.label || null,
    runnerClientId: getCollaborationClientId(),
  };

  if (target.executor === 'network') {
    const onBehalfOf = fromWin?.agentId && FAMILY_AGENT_BY_ID[String(fromWin.agentId).toLowerCase()]
      ? String(fromWin.agentId).toLowerCase() : undefined;
    const request = await client.requestHelp({ cardId: target.cardId, task: text, onBehalfOf });
    return spawnCard(helpCardWindow({ ...base, id: 'pending', request, executor: 'network' }));
  }

  if (target.executor === 'cli') {
    const { task: started } = await cliAgentsApi.start({ cli: toWin?.cli || 'claudecode', folder: toWin?.folder, prompt: text });
    return spawnCard(helpCardWindow({
      ...base, id: 'pending', executor: 'cli',
      request: { cliTaskId: started?.id, task: text, status: 'working' },
    }));
  }

  if (target.executor === 'module') {
    const id = spawnCard(helpCardWindow({ ...base, id: 'pending', executor: 'module', request: { task: text, status: 'working' } }));
    const update = useWorkspaceStore.getState().onUpdate;
    try {
      const answer = await askFromModule({ prompt: moduleQuestion(text, base.fromLabel), moduleName: target.name, workspaceId });
      update(id, { status: 'completed', result: clipResult(answer || '(no answer)') });
    } catch (error) {
      update(id, { status: 'failed', error: error.message || 'The module could not answer.' });
    }
    return id;
  }
  if (target.executor === 'research') {
    const id = spawnCard(helpCardWindow({ ...base, id: 'pending', executor: 'research', request: { task: text, status: 'working' } }));
    const update = useWorkspaceStore.getState().onUpdate;
    try {
      const answer = await researchApi.ask({ question: text, workspaceId });
      update(id, { status: 'completed', result: clipResult(researchReply(answer)) });
      // The Research window keeps the exchange with its own questions.
      const live = useWorkspaceStore.getState().wins.find((win) => win.id === target.windowId);
      if (live) {
        const entry = { id: `ask-${Date.now()}`, question: text, answer: answer.answer, sources: answer.sources || [], usedWeb: Boolean(answer.usedWeb), by: base.fromLabel, at: new Date().toISOString() };
        update(live.id, { research: { ...(live.research || {}), asks: [entry, ...(live.research?.asks || [])].slice(0, 12) } });
      }
    } catch (error) {
      update(id, { status: 'failed', error: error.message || 'Research could not answer.' });
    }
    return id;
  }

  // A lead hunt: the leads fill the LeadHound window, the card gets the summary.
  if (target.executor === 'leadhound') {
    const id = spawnCard(helpCardWindow({ ...base, id: 'pending', executor: 'leadhound', request: { task: text, status: 'working' } }));
    const update = useWorkspaceStore.getState().onUpdate;
    const brief = briefFromTask(text);
    update(target.windowId, { leadHound: { brief, result: null, hunting: true, huntingSince: Date.now() } });
    try {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`/api/leadhound/run${qs}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brief),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error || 'LeadHound could not run the hunt.');
      update(target.windowId, { leadHound: { brief, result } });
      update(id, { status: 'completed', result: clipResult(huntSummary(result)) });
    } catch (error) {
      update(target.windowId, { leadHound: { brief, result: null } });
      update(id, { status: 'failed', error: error.message || 'LeadHound could not run the hunt.' });
    }
    return id;
  }
  throw new Error('That window cannot take requests yet.');
}

/** Pan the board so a window sits in the middle of the screen and raise it. */
export function showWindow(id) {
  const store = useWorkspaceStore.getState();
  const win = store.wins.find((entry) => entry.id === id);
  if (!win || typeof window === 'undefined') return false;
  const zoom = store.zoom || 1;
  store.setPan({ x: window.innerWidth / 2 - (win.x + (win.w || 0) / 2) * zoom, y: window.innerHeight / 2 - (win.y + (win.h || 0) / 2) * zoom });
  store.setActiveId?.(id);
  return true;
}

/** A request filed from the registry list: card beside the helper's window, if it has one. */
export function placeRegistryRequestCard(request) {
  const { wins } = useWorkspaceStore.getState();
  const toWin = findHelperWindow(wins, request.cardId);
  const self = getSelf();
  return spawnCard(helpCardWindow({
    id: 'pending', request, executor: 'network', toWin, others: wins,
    fromLabel: request.requester?.kind === 'agent' ? (getAgentById(request.requester.id)?.name || request.requester.id) : (self?.label || 'A teammate'),
    toLabel: request.cardName, createdBy: self?.label || null, runnerClientId: getCollaborationClientId(),
  }));
}
