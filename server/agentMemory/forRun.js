// server/agentMemory/forRun.js
//
// What the run engine needs from memory for one run: the memory block to add
// to the agent's instructions, the memory tools, and a way to record the run
// as an episode when it ends. Memory never stops a run: if the tables are
// missing or the database hiccups, the agent simply answers without it.
//
// Outside apps that call an agent through Share get its identity core only:
// they never see the owner's facts or earlier conversations and never get
// the memory tools. Their questions are still recorded, so the owner can see
// what was asked.

import crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { buildMemoryBlock, lastQuestion, summarizeEpisode, toolNames } from './recall.js';
import { chatClock, nowSection } from './recallTurns.js';
import { loadTurnMemory } from './turnMemory.js';
import * as graphStore from './graphStore.js';
import * as store from './store.js';
import * as turnStore from './turns.js';
import { createMemoryTools } from './tools.js';

const log = createLogger('agent-memory');

export const NO_MEMORY_TOOLS = Object.freeze({
  definitions: [], has: () => false, call: async () => 'Memory is not available right now.',
});

export const NO_MEMORY = Object.freeze({
  block: '',
  tools: NO_MEMORY_TOOLS,
  record: async () => null,
});

/** Which chat a run belongs to: the chat window's own id, else one id per run. */
export function conversationFor({ conversationId, windowId, origin }) {
  const given = String(conversationId || '').trim();
  if (given) return given.slice(0, 200);
  if (origin === 'chat' && windowId) return `chat:${windowId}`;
  return `${origin}:${crypto.randomUUID()}`;
}

export async function loadRunMemory({
  db, userId, agentId, origin = 'chat', messages = [], workspaceId = null,
  conversationId = null, windowId = null, timeZone = undefined, now = () => new Date(),
}) {
  if (!db || !userId || !agentId) return NO_MEMORY;
  const outsideCaller = origin === 'endpoint';
  const question = lastQuestion(messages);
  const chatId = conversationFor({ conversationId, windowId, origin });
  const clock = chatClock(messages, { agentId });
  const startedAt = now();
  let block = '';
  let found = { facts: [], episodes: [] };
  try {
    const [identity, facts, links, episodes, turns] = await Promise.all([
      store.getIdentity(db, { userId, agentId }),
      outsideCaller ? [] : store.currentFacts(db, { userId, agentId }),
      // An install that has not applied 062 yet still gets the rest of memory.
      outsideCaller ? [] : graphStore.currentRelations(db, { userId, agentId, limit: 40 }).catch(() => []),
      outsideCaller || !question ? [] : store.searchEpisodes(db, { userId, agentId, query: question, limit: 3 }),
      // The real earlier messages, with times (068); an older install skips them.
      outsideCaller ? null : loadTurnMemory(db, { userId, agentId, question, conversationId: chatId, timeZone })
        .catch((error) => { log.warn('earlier messages unavailable', { agentId, code: safeErrorCode(error) }); return null; }),
    ]);
    // Real messages replace the old one-line summaries when there are any.
    block = buildMemoryBlock({
      identity, facts, links, episodes: turns?.found ? [] : episodes, timeZone,
      timeSections: [nowSection({ now: startedAt, timeZone, clock }), turns?.leftOff, turns?.exchanges],
    });
    found = { facts, episodes };
  } catch (error) {
    // Older database without the memory tables, or a passing hiccup.
    log.warn('memory unavailable for this run', { agentId, code: safeErrorCode(error) });
    return NO_MEMORY;
  }

  return {
    block,
    // What this run's memory found, for the seven-contexts report (server/sevenContexts).
    ...found,
    tools: outsideCaller ? NO_MEMORY_TOOLS : createMemoryTools({ db, userId, agentId, timeZone }),
    conversationId: chatId,
    async record({ answer = '', toolActions = [], model = null } = {}) {
      if (!question) return null;
      const tools = toolNames(toolActions);
      try {
        await turnStore.recordTurns(db, {
          userId, agentId, workspaceId, conversationId: chatId, windowId, origin,
          turns: [
            { speaker: 'person', text: question, at: clock.currentAt || startedAt },
            { speaker: 'agent', text: answer, at: now() },
          ],
        }).catch((error) => log.warn('messages not recorded', { agentId, code: safeErrorCode(error) }));
        return await store.recordEpisode(db, {
          userId, agentId, workspaceId, origin, model,
          question: question.slice(0, 4000),
          answer: String(answer || '').slice(0, 8000),
          summary: summarizeEpisode({ question, answer, tools }),
          tools,
        });
      } catch (error) {
        log.warn('episode not recorded', { agentId, code: safeErrorCode(error) });
        return null;
      }
    },
  };
}
