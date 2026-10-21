// AGENT NETWORK — agents asking teammates, coding CLIs and modules on the board.
// A chat agent finds them with discover_agents (card ids "window:<id>") and
// asks with request_agent_help, exactly like asking another chat agent: the
// same help card lands on the canvas between the two windows, and the answer
// comes back in the tool call or, later, in the asking chat.
//   coding CLI — starts an Agent Console task with the same rules as the
//                console: desktop installs only, system admins only, open
//                project folders only. Its approval prompts stay in the
//                console's Action Approvals; the card shows "Needs approval".
//   module     — one question to the module's model, like censai.agent.ask.
//   research   — the Research window: an answer from the board's saved web
//                research, or a fresh Tavily search, with numbered sources.
//   LeadHound  — a Tavily lead hunt on the asker's keys; the leads fill the
//                LeadHound window and a short summary goes back as the answer.

import { randomUUID } from 'crypto';
import { createLogger } from '../logger.js';
import { openCanvasDocReader } from '../collab/liveDoc.js';
import { localFilesystemAllowed } from '../middleware/runtimeMode.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import { getCliTaskManager } from '../cli-agents/index.js';
import { RUNNING } from '../cli-agents/taskStore.js';
import { allowedRoots, assertAllowedFolder } from '../cli-agents/folders.js';
import { askModule } from '../modules/ask.js';
import { listBoardAgents, searchBoardAgents } from '../../src/lib/agentNetwork/boardAgents.js';
import { briefFromTask, huntSummary } from '../../src/lib/agentNetwork/leadHoundHelp.js';
import { clipResult } from './helpCardShape.js';
import { researchReply } from './researchReply.js';
import { patchHelpCard, placeHelpCard, readDocWindows, readHelpCard, settleHelpCard } from './helpCards.js';
import { logBoardAsk, requestBoardTeammate } from './boardAgentAsk.js';

const log = createLogger('agent-board-help');
export const WINDOW_CARD_PREFIX = 'window:';
const MAX_TASK = 8000;
const POLL_MS = 1500;
const HELPER_KIND = { cli: 'coding_cli', leadhound: 'lead_finder', research: 'web_research', module: 'module', network: 'board_agent' };
const CLI_STATUS = { done: 'completed', failed: 'failed', stopped: 'failed', needs_approval: 'needs approval' };

let sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
export function __setBoardHelpSleepForTests(fn) { sleep = fn; }

export function isBoardWindowCard(cardId) {
  return String(cardId || '').startsWith(WINDOW_CARD_PREFIX);
}

async function boardWindows(workspaceId) {
  let reader = null;
  try {
    reader = await openCanvasDocReader(workspaceId);
    return reader ? readDocWindows(reader.doc) : [];
  } catch (error) {
    log.warn('board unavailable', { workspaceId, error: error.message });
    return [];
  } finally {
    try { await reader?.close(); } catch { /* already closed */ }
  }
}

/** Chat agents, coding CLIs and modules on this board only, ranked for the query. */
export async function listBoardHelpers(workspaceId, query = '', limit = 5, { excludeAgentId = '' } = {}) {
  const skip = String(excludeAgentId || '').trim().toLowerCase();
  const helpers = listBoardAgents(await boardWindows(workspaceId))
    .filter((agent) => !skip || String(agent.agentId || '').toLowerCase() !== skip);
  return searchBoardAgents(helpers, query).slice(0, limit).map((agent) => ({
    card_id: `${WINDOW_CARD_PREFIX}${agent.windowId}`,
    name: agent.name,
    kind: HELPER_KIND[agent.executor] || 'module',
    description: agent.role,
    abilities: agent.abilities,
    busy: agent.status === 'working' || undefined,
    you_can_request: true,
    ...(agent.agentId ? { agent_id: agent.agentId } : {}),
  }));
}

function helpPrompt(task, fromLabel) {
  return `${task}\n\n(Asked by ${fromLabel}, an agent on the shared board. Your answer goes back to ${fromLabel}.)`;
}

export function cliOutcome(task) {
  if (!task) return { status: 'failed', error: 'That coding task is gone.' };
  const status = CLI_STATUS[task.status] || 'working';
  return {
    status,
    result: task.summary || null,
    error: task.status === 'failed' ? (task.error || 'The coding agent stopped with an error.') : null,
  };
}

async function cliFolder(win) {
  if (win.folder) return assertAllowedFolder(win.folder);
  const roots = await allowedRoots();
  const root = roots.find((entry) => entry.current) || roots[0];
  if (!root) throw new Error('Open a project folder first, so the coding agent has somewhere to work.');
  return root.path;
}

async function startCli(scope, win, prompt, fromLabel) {
  if (!localFilesystemAllowed()) throw new Error('Coding agents only run on a desktop install of censaiOS.');
  await assertSystemAdmin({ session: { userId: scope.userId } });
  const manager = getCliTaskManager();
  const started = await manager.start({
    cli: win.cli || 'claudecode', folder: await cliFolder(win), prompt, user: { userId: scope.userId, name: fromLabel },
  });
  return started.id;
}

async function waitForCli(taskId, deadline) {
  const manager = getCliTaskManager();
  let task = manager.tasks.get(taskId);
  while (task && RUNNING.has(task.status) && task.status !== 'needs_approval' && Date.now() < deadline) {
    await sleep(POLL_MS);
    task = manager.tasks.get(taskId);
  }
  return cliOutcome(task);
}

// One LeadHound hunt for an agent. The route module is loaded lazily so the
// tool layer does not pull in the model gateway at import time.
async function runLeadHoundHunt(scope, windowId, task) {
  const [{ createCompleter }, { createTavilyClient, resolveTavilyKey }, { runLeadHound }] = await Promise.all([
    import('../routes/agents/leadhound.js'),
    import('../leadhound/tavily.js'),
    import('../leadhound/pipeline.js'),
  ]);
  const brief = briefFromTask(task);
  const { apiKey } = await resolveTavilyKey(scope.userId);
  await patchHelpCard(scope.workspaceId, windowId, { leadHound: { brief, result: null, hunting: true, huntingSince: Date.now() } });
  try {
    const result = await runLeadHound(brief, { tavily: createTavilyClient(apiKey), complete: createCompleter(scope) });
    await patchHelpCard(scope.workspaceId, windowId, { leadHound: { brief, result: { ok: true, ...result } } });
    return huntSummary(result);
  } catch (error) {
    await patchHelpCard(scope.workspaceId, windowId, { leadHound: { brief, result: null } });
    throw error;
  }
}

function withTimeout(promise, deadline) {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.resolve(null);
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), left); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * request_agent_help for a "window:<id>" card id.
 * @returns {Promise<{request_id, agent, status, result?, error?}>}
 */
export async function requestBoardHelp(scope, {
  cardId, task, fromWindowId = null, requesterAgentId = null, fromLabel = 'An agent', waitSeconds = 0, maxWaitSeconds = 45,
}) {
  const text = String(task || '').trim().slice(0, MAX_TASK);
  if (!text) throw new Error('Describe the task you need help with.');
  const windowId = String(cardId).slice(WINDOW_CARD_PREFIX.length);
  const wins = await boardWindows(scope.workspaceId);
  const target = listBoardAgents(wins).find((agent) => agent.windowId === windowId);
  if (!target) {
    logBoardAsk(fromLabel, windowId, { status: 'failed', why: 'not on this board' });
    throw new Error('That window is not on the board any more, or it cannot take requests. Run discover_agents again.');
  }
  if (windowId === fromWindowId) {
    if (target.executor === 'network') logBoardAsk(fromLabel, target.name, { status: 'failed', why: 'cannot ask itself' });
    throw new Error('An agent cannot ask itself for help.');
  }
  const win = wins.find((entry) => entry.id === windowId);
  const waits = Number(waitSeconds) > 0;
  const deadline = Date.now() + Math.min(maxWaitSeconds, Math.max(0, Number(waitSeconds) || 0)) * 1000;
  const prompt = helpPrompt(text, fromLabel);
  const place = (id, request) => placeHelpCard(scope.workspaceId, {
    id, request, executor: target.executor, fromWindowId, toWindowId: windowId, requesterAgentId, awaitingTool: waits,
  });
  if (target.executor === 'network') {
    return requestBoardTeammate(scope, {
      wins, win, target, text, fromWindowId, requesterAgentId, fromLabel, waits, deadline, place, withTimeout,
    });
  }

  if (target.executor === 'cli') {
    const taskId = await startCli(scope, win, prompt, fromLabel);
    const card = await place(`help-cli-${taskId}`, { cliTaskId: taskId, task: text, status: 'working' });
    // An idle console shows the task it was asked to do, approvals included.
    const shown = win.taskId ? getCliTaskManager().tasks.get(win.taskId) : null;
    if (!shown || !RUNNING.has(shown.status)) await patchHelpCard(scope.workspaceId, windowId, { taskId });
    const outcome = waits ? await waitForCli(taskId, deadline) : { status: 'working' };
    if (waits) await settleHelpCard(scope.workspaceId, card, outcome);
    return { request_id: `cli:${taskId}`, agent: target.name, ...outcome };
  }

  const id = randomUUID();
  const kind = target.executor === 'research' ? 'research' : 'module';
  const cardWindowId = `help-${kind}-${id}`;
  const card = await place(cardWindowId, { task: text, status: 'working' });
  const runners = {
    research: () => askBoardResearch(scope, text).then(researchReply),
    leadhound: () => runLeadHoundHunt(scope, windowId, text),
  };
  const work = runners[target.executor]?.() || askModule({
    userId: scope.userId, workspaceId: scope.workspaceId, prompt, moduleName: target.name, source: 'agent-network-module',
  });
  const answer = work.then(
    (reply) => ({ status: 'completed', result: clipResult(reply || '(no answer)'), error: null }),
    (error) => ({ status: 'failed', result: null, error: error.message || `${target.name} could not answer.` }),
  ).then(async (outcome) => {
    await patchHelpCard(scope.workspaceId, cardWindowId, outcome);
    return outcome;
  });
  const outcome = (waits ? await withTimeout(answer, deadline) : null) || { status: 'working' };
  if (waits) await settleHelpCard(scope.workspaceId, card, outcome);
  return { request_id: `${kind}:${id}`, agent: target.name, ...outcome };
}

// Loaded on use: the research stack pulls in the model gateway.
async function askBoardResearch(scope, question) {
  const [{ researchDeps }, { askResearch }] = await Promise.all([import('../research/deps.js'), import('../research/service.js')]);
  return askResearch(scope, question, await researchDeps(scope, { tavily: 'optional' }));
}

/** agent_help_status for "cli:<taskId>", "module:<id>" and "research:<id>" request ids. */
export async function boardHelpStatus(scope, requestId) {
  const [kind, id] = String(requestId).split(/:(.*)/s);
  if (kind === 'cli') return { request_id: requestId, ...cliOutcome(getCliTaskManager().tasks.get(id)) };
  const card = await readHelpCard(scope.workspaceId, `help-${kind}-${id}`);
  if (!card) return { request_id: requestId, status: 'failed', error: 'That request is no longer on the board.' };
  return { request_id: requestId, agent: card.toLabel, status: card.status, result: card.result || null, error: card.error || null };
}

export function isBoardRequestId(requestId) {
  return /^(cli|module|research|board):\S+$/.test(String(requestId || ''));
}
