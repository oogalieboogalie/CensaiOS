// server/routes/agentMemory.js
//
// The Memory panel's side of agent memory (behind the session guard): see
// who an agent is, what it knows (with dates and history) and what it has
// talked about; edit who it is; add, correct or forget a fact. Everything
// is the signed-in person's own memory of that agent. The knowledge graph
// (connections, and what was true on a date) is in agentMemoryGraph.js.

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { FactError, normalizeFactInput } from '../agentMemory/facts.js';
import * as store from '../agentMemory/store.js';
import { shelfOf } from '../../src/lib/agentMemory/shelves.js';
import { addGraphRoutes, graphSnapshot } from './agentMemoryGraph.js';

import { chatView } from './recents.js';
import * as turnStore from '../agentMemory/turns.js';

// Recents (the person's latest chats across agents) live next door.
export { recentsRouter } from './recents.js';

const AGENT_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function factView(row) {
  return {
    id: String(row.id),
    subject: row.subject,
    attribute: row.attribute,
    key: row.fact_key,
    value: row.value,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    recordedAt: row.recorded_at,
    supersededAt: row.superseded_at,
    kind: row.change_kind,
    source: row.source,
    shelf: shelfOf(row),
  };
}

export function episodeView(row) {
  return {
    id: String(row.id), origin: row.origin, model: row.model, summary: row.summary,
    question: row.question, answer: row.answer, tools: row.tools || [], at: row.created_at,
  };
}

export function createAgentMemoryRouter({ db = pool, isReady = dbReady } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!isReady()) return res.status(503).json({ error: 'The database is not ready yet.' });
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    const agentId = String(req.query.agentId || '');
    if (!AGENT_ID.test(agentId)) return res.status(400).json({ error: 'Pick an agent first.' });
    req.memoryScope = { userId: req.session.userId, agentId };
    return next();
  });

  const fail = (res, error) => res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'Something went wrong.',
  });

  async function snapshot(scope) {
    const [identity, identities, facts, history, episodes, graph] = await Promise.all([
      store.getIdentity(db, scope),
      store.identityHistory(db, scope),
      store.currentFacts(db, { ...scope, limit: 200 }),
      store.factHistory(db, scope),
      store.recentEpisodes(db, { ...scope, limit: 30 }),
      graphSnapshot(db, scope),
    ]);
    return {
      identity: identity ? { core: identity.core, recordedAt: identity.recorded_at } : null,
      identityVersions: identities.map((row) => ({
        id: String(row.id), core: row.core, recordedAt: row.recorded_at, supersededAt: row.superseded_at,
      })),
      facts: facts.map(factView),
      history: history.map(factView),
      episodes: episodes.map(episodeView),
      ...graph,
    };
  }

  router.get('/', async (req, res) => {
    try { res.json(await snapshot(req.memoryScope)); } catch (error) { fail(res, error); }
  });

  router.get('/episodes', async (req, res) => {
    try {
      const query = String(req.query.q || '').slice(0, 300);
      const rows = query.trim()
        ? await store.searchEpisodes(db, { ...req.memoryScope, query, limit: 30 })
        : await store.recentEpisodes(db, { ...req.memoryScope, limit: 30 });
      res.json({ episodes: rows.map(episodeView) });
    } catch (error) { fail(res, error); }
  });

  // Past conversations: whole chats with every message and its time (068).
  router.get('/conversations', async (req, res) => {
    try {
      const query = String(req.query.q || '').slice(0, 300);
      if (query.trim()) {
        const rows = await turnStore.searchTurns(db, { ...req.memoryScope, query, limit: 30 });
        return res.json({ matches: rows.map((t) => ({ id: String(t.id), chatId: t.conversation_id, speaker: t.speaker, text: t.text, at: t.at })) });
      }
      const rows = await turnStore.recentConversations(db, { ...req.memoryScope, limit: 30 });
      return res.json({ chats: rows.map(chatView) });
    } catch (error) { return fail(res, error); }
  });

  router.put('/identity', async (req, res) => {
    try {
      await store.setIdentity(db, { ...req.memoryScope, core: req.body?.core });
      res.json(await snapshot(req.memoryScope));
    } catch (error) { fail(res, error); }
  });

  router.post('/facts', async (req, res) => {
    try {
      const input = normalizeFactInput(req.body || {});
      const result = await store.writeFact(db, { ...req.memoryScope, input, source: 'person' });
      res.status(result.status === 'same' ? 200 : 201).json({ status: result.status, ...(await snapshot(req.memoryScope)) });
    } catch (error) { fail(res, error); }
  });

  router.delete('/facts/:id', async (req, res) => {
    try {
      if (!/^\d{1,18}$/.test(String(req.params.id))) throw new FactError('No current fact with that id.', 404);
      await store.forgetFact(db, { ...req.memoryScope, factId: String(req.params.id) });
      res.json(await snapshot(req.memoryScope));
    } catch (error) { fail(res, error); }
  });

  addGraphRoutes(router, { db, snapshot, fail, factView });

  return router;
}

export const agentMemoryRouter = createAgentMemoryRouter();
