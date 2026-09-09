import express from 'express';
import { requireDb } from './shared.js';
import {
  storeMemory,
  recallMemories,
  loadAgentContext,
  writeJournal,
  readJournals,
  countJournals,
  storeCompressionMemory,
} from '../../memory.js';
import { memoryRouteError, resolveRequestMemoryScope } from './memoryScope.js';


export const memoryRouter = express.Router();

memoryRouter.post('/memory', requireDb, async (req, res) => {
  try {
    const { agentId, content, type, importance, accessLevel, tags, source } = req.body;
    if (!agentId || !content) return res.status(400).json({ error: 'agentId and content required' });
    const scope = await resolveRequestMemoryScope(req);
    const id = await storeMemory(agentId, content, type, { ...scope, importance, accessLevel, tags, source });
    res.json({ id });
  } catch (err) {
    memoryRouteError(res, err);
  }
});

memoryRouter.get('/memory/:agentId', requireDb, async (req, res) => {
  try {
    const { query, type, limit, minImportance } = req.query;
    const scope = await resolveRequestMemoryScope(req);
    const memories = await recallMemories(req.params.agentId, query, {
      ...scope, type, limit: Number(limit) || 20, minImportance: Number(minImportance) || 0,
    });
    res.json(memories);
  } catch (err) {
    memoryRouteError(res, err);
  }
});

memoryRouter.get('/memory/context/:agentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveRequestMemoryScope(req);
    const ctx = await loadAgentContext(req.params.agentId, {
      workspaceId: scope.workspaceId,
      hours: Number(req.query.hours) || 12,
    });
    if (!ctx) return res.status(404).json({ error: 'Agent not found' });
    res.json(ctx);
  } catch (err) {
    memoryRouteError(res, err);
  }
});

memoryRouter.post('/journals/:agentId', requireDb, async (req, res) => {
  try {
    const { content, entryType, project, tags, emotionalWeight } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const scope = await resolveRequestMemoryScope(req);
    const entry = await writeJournal(req.params.agentId, content, entryType, { ...scope, project, tags, emotionalWeight });
    res.json(entry);
  } catch (err) {
    memoryRouteError(res, err);
  }
});

memoryRouter.get('/journals/:agentId/count', requireDb, async (req, res) => {
  try {
    const scope = await resolveRequestMemoryScope(req);
    const count = await countJournals(req.params.agentId, scope);
    res.json({ count });
  } catch (err) {
    memoryRouteError(res, err);
  }
});

// Journals are private to the agent: only the in-process tool loop may read
// plaintext. Over HTTP, entry content is always redacted — the UI shows
// metadata and counts only.
memoryRouter.get('/journals/:agentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveRequestMemoryScope(req);
    const entries = await readJournals(req.params.agentId, {
      ...scope,
      limit: Number(req.query.limit) || 20,
      entryType: req.query.type || null,
    });
    res.json(entries.map(entry => ({ ...entry, content: '[private]' })));
  } catch (err) {
    memoryRouteError(res, err);
  }
});

memoryRouter.post('/compression/:agentId', requireDb, async (req, res) => {
  try {
    const { title, content, emotionType, recoveryPriority } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });
    const scope = await resolveRequestMemoryScope(req);
    const id = await storeCompressionMemory(req.params.agentId, title, content, { ...scope, emotionType, recoveryPriority });
    res.json({ id });
  } catch (err) {
    memoryRouteError(res, err);
  }
});
