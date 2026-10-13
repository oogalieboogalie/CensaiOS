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

import { createLogger } from '../logger.js';
import { buildMemoryBlock, lastQuestion, summarizeEpisode, toolNames } from './recall.js';
import * as store from './store.js';
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

export async function loadRunMemory({ db, userId, agentId, origin = 'chat', messages = [], workspaceId = null }) {
  if (!db || !userId || !agentId) return NO_MEMORY;
  const outsideCaller = origin === 'endpoint';
  const question = lastQuestion(messages);
  let block = '';
  try {
    const [identity, facts, episodes] = await Promise.all([
      store.getIdentity(db, { userId, agentId }),
      outsideCaller ? [] : store.currentFacts(db, { userId, agentId }),
      outsideCaller || !question ? [] : store.searchEpisodes(db, { userId, agentId, query: question, limit: 3 }),
    ]);
    block = buildMemoryBlock({ identity, facts, episodes });
  } catch (error) {
    // Older database without the memory tables, or a passing hiccup.
    log.warn('memory unavailable for this run', { agentId, error: error.message });
    return NO_MEMORY;
  }

  return {
    block,
    tools: outsideCaller ? NO_MEMORY_TOOLS : createMemoryTools({ db, userId, agentId }),
    async record({ answer = '', toolActions = [], model = null } = {}) {
      if (!question) return null;
      const tools = toolNames(toolActions);
      try {
        return await store.recordEpisode(db, {
          userId, agentId, workspaceId, origin, model,
          question: question.slice(0, 4000),
          answer: String(answer || '').slice(0, 8000),
          summary: summarizeEpisode({ question, answer, tools }),
          tools,
        });
      } catch (error) {
        log.warn('episode not recorded', { agentId, error: error.message });
        return null;
      }
    },
  };
}
