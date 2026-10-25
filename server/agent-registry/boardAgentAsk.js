// One board agent asks another agent whose chat is on the same board.
// The question is written into both chats, a stand-in or the helper's model
// answers, and the board-help log records who asked whom and whether it
// was answered. Nothing here reads another workspace's canvas.

import { randomUUID } from 'crypto';
import { createLogger } from '../logger.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { upsertWindowInDoc } from '../collab/serverWriter.js';
import { patchHelpCard, readDocWindows, settleHelpCard } from './helpCards.js';

const log = createLogger('board-help');

let runTeammate = null;

/** Tests pass a stand-in model. Production uses the helper's own run. */
export function __setBoardTeammateRunnerForTests(fn) {
  runTeammate = typeof fn === 'function' ? fn : null;
}

async function defaultRunner({ agentId, prompt, userId, workspaceId, windowId }) {
  const { runAgentTurn } = await import('../runEngine/index.js');
  const { finalText } = await runAgentTurn({
    origin: 'help',
    agentId,
    messages: [{ from: 'me', text: prompt }],
    userId,
    workspaceId,
    windowId,
    loopWorkspaceId: workspaceId,
  });
  return String(finalText || '').trim() || '(no answer)';
}

function windowTitle(wins, windowId) {
  const win = (wins || []).find((entry) => entry.id === windowId);
  if (!win || (win.kind !== 'chat' && win.kind !== 'agent')) return '';
  return String(win.title || '').trim();
}

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const loggedId = (id) => (SAFE_ID.test(String(id ?? '')) ? String(id) : 'unknown');

/**
 * One line: which agent asked which, and answered or why not. Ids only:
 * window titles and agent names are typed text and stay out of the log.
 */
export function logBoardAsk({ from, to } = {}, outcome) {
  const answered = outcome?.status === 'completed';
  log.info('board ask', {
    from: loggedId(from),
    to: loggedId(to),
    outcome: answered ? 'answered' : 'not answered',
    ...(answered ? {} : { why: outcome?.why || 'could not answer' }),
  });
}

function appendMsgs(doc, windowId, extra) {
  const chat = readDocWindows(doc).find((win) => win.id === windowId);
  if (!chat || (chat.kind !== 'chat' && chat.kind !== 'agent')) return;
  const msgs = Array.isArray(chat.msgs) ? chat.msgs : [];
  upsertWindowInDoc(doc, { ...chat, msgs: [...msgs, ...extra] });
}

async function showExchange(scope, { cardId, text, askerId, asker, helperId, helperWindowId, fromWindowId, outcome }) {
  const answer = outcome.status === 'completed'
    ? (outcome.result || '(no answer)')
    : `I could not finish this: ${outcome.error || 'the request failed.'}`;
  try {
    await transactCanvasDoc(scope.workspaceId, (doc) => {
      appendMsgs(doc, helperWindowId, [
        { from: askerId, text, helpCardId: cardId, helpRequest: { fromLabel: asker } },
        { from: helperId, text: answer, helpCardId: cardId, helpReply: { toLabel: asker } },
      ]);
      if (fromWindowId) {
        const asked = { from: askerId, text, helpCardId: cardId };
        const heard = outcome.status === 'completed'
          ? { from: askerId, text: `Help from ${outcome.helperName}:\n\n${outcome.result || '(no answer)'}`, helpCardId: cardId }
          : null;
        appendMsgs(doc, fromWindowId, heard ? [asked, heard] : [asked]);
      }
    });
  } catch (error) {
    log.warn('board ask not shown on the chats', { code: SAFE_ID.test(String(error?.code ?? '')) ? String(error.code) : null });
  }
}

async function answerTeammate(scope, input) {
  const { target, agentId, text, fromLabel } = input;
  const prompt = `${text}\n\n(Asked by ${fromLabel}, an agent on this board. Answer them directly.)`;
  try {
    const runner = runTeammate || defaultRunner;
    const answer = await runner({
      agentId, prompt, task: text, userId: scope.userId, workspaceId: scope.workspaceId,
      windowId: target.windowId, fromLabel,
    });
    const result = String(answer || '').trim() || '(no answer)';
    return { status: 'completed', result, error: null, helperName: target.name };
  } catch (error) {
    return {
      status: 'failed', result: null, helperName: target.name,
      error: error.message || `${target.name} could not answer.`, why: 'could not answer',
    };
  }
}

/**
 * Ask a chat or agent window that listBoardHelpers already found on this board.
 * @returns {Promise<{request_id, agent, status, result?, error?}>}
 */
export async function requestBoardTeammate(scope, {
  wins, win, target, text, fromWindowId, requesterAgentId, fromLabel, waits, deadline, place, withTimeout,
}) {
  const asker = windowTitle(wins, fromWindowId) || fromLabel;
  const id = randomUUID();
  const cardId = `help-board-${id}`;
  const card = await place(cardId, { task: text, status: 'working' });
  const askerId = requesterAgentId || win.agentId;
  const work = (async () => {
    const outcome = await answerTeammate(scope, { target, agentId: win.agentId, text, fromLabel: asker });
    logBoardAsk({ from: askerId, to: win.agentId }, outcome);
    await showExchange(scope, {
      cardId, text, askerId, asker, helperId: win.agentId, helperWindowId: target.windowId,
      fromWindowId, outcome,
    });
    const patch = { status: outcome.status, result: outcome.result ?? null, error: outcome.error ?? null };
    await patchHelpCard(scope.workspaceId, cardId, {
      ...patch,
      helperLoggedAt: new Date().toISOString(),
      ...(outcome.status === 'completed' ? { deliveredAt: new Date().toISOString() } : {}),
    }).catch(() => {});
    return patch;
  })();
  const outcome = (waits ? await withTimeout(work, deadline) : null) || { status: 'working' };
  if (!waits) work.catch(() => {});
  if (waits) await settleHelpCard(scope.workspaceId, card, outcome);
  return { request_id: `board:${id}`, agent: target.name, ...outcome };
}
