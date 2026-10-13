// server/agentMemory/deepMemoryRows.js
//
// Agent memory (facts and episodes) in the row shape the deep_memory tool
// ranks, so deep_memory finds something on every install, not only where
// the family brain file exists.

import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { day, describeFact } from './facts.js';
import * as store from './store.js';
import { matchFacts } from './tools.js';

export async function agentMemoryRows({ agentId, userId, query = '', action = 'recall', limit = 8, db = pool, ready = dbReady }) {
  if (!userId || !agentId || !ready()) return [];
  if (action === 'timeline') {
    const episodes = await store.recentEpisodes(db, { userId, agentId, limit });
    return episodes.map(episodeRow);
  }
  const [facts, episodes] = await Promise.all([
    store.currentFacts(db, { userId, agentId, limit: 200 }),
    store.searchEpisodes(db, { userId, agentId, query, limit }),
  ]);
  return [
    ...matchFacts(facts, query).slice(0, limit).map((fact) => ({
      source: 'facts', title: `${fact.attribute} of ${fact.subject}`, content: describeFact(fact),
      importance: 0.9, timestamp: fact.recorded_at,
    })),
    ...episodes.map(episodeRow),
  ];
}

function episodeRow(episode) {
  return {
    source: 'episodes', title: `Conversation on ${day(episode.created_at)}`, content: episode.summary,
    importance: 0.6, timestamp: episode.created_at,
  };
}
