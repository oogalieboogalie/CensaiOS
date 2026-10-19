import express from 'express';
import { requireDb } from './shared.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';
import { resolveTavilyKey } from '../../leadhound/tavily.js';
import { resolveEmbedder } from '../../research/embedder.js';
import { researchDeps } from '../../research/deps.js';
import { askResearch, fillCell, knowledgePrompt, queryKnowledge, runSearch, saveFile, saveToKnowledge } from '../../research/service.js';
import { RECIPES } from '../../research/recipes.js';

// Tavily Research: search, save to the board's knowledge base, ask over it,
// and fill spreadsheet cells. All BYOK: the person's own Tavily, embedding
// and model keys, inside this server. The board is the workspace.
export const researchRouter = express.Router();

researchRouter.get('/research/status', async (req, res) => {
  try {
    const { source } = await resolveTavilyKey(req.session?.userId);
    const embedder = await resolveEmbedder(req.session?.userId);
    res.json({ tavily: { configured: Boolean(source), source }, embedding: { model: embedder.id, label: embedder.label } });
  } catch (err) {
    agentRouteError(res, err);
  }
});

researchRouter.post('/research/search', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { tavily } = await researchDeps(scope);
    res.json({ ok: true, ...(await runSearch(tavily, req.body || {})) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Save picked results (or a whole search) to the board's knowledge base.
researchRouter.post('/research/kb/save', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const deps = await researchDeps(scope);
    const out = await saveToKnowledge(scope, { query: req.body?.query, results: req.body?.results }, deps);
    res.json({ ok: true, ...out, sources: await deps.store.listSources(scope.workspaceId) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Feed a file in (diagram 13): cut into pieces, every piece tagged.
researchRouter.post('/research/kb/file', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const deps = await researchDeps(scope, { tavily: 'none' });
    const source = await saveFile(scope, { name: req.body?.name, text: req.body?.text }, deps);
    res.json({ ok: true, source, sources: await deps.store.listSources(scope.workspaceId) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// One source's pieces and their tags, for the Knowledge tab.
researchRouter.get('/research/kb/:sourceId/chunks', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { store } = await researchDeps(scope, { tavily: 'none' });
    res.json({ chunks: await store.listChunks(scope.workspaceId, req.params.sourceId) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

researchRouter.get('/research/kb', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { store } = await researchDeps(scope, { tavily: 'none' });
    res.json({ sources: await store.listSources(scope.workspaceId) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

researchRouter.delete('/research/kb/:sourceId', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { store } = await researchDeps(scope, { tavily: 'none' });
    const removed = await store.deleteSource(scope.workspaceId, req.params.sourceId);
    res.json({ ok: removed, sources: await store.listSources(scope.workspaceId) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Top passages for a question; with `asPrompt` the chat-ready system message.
researchRouter.post('/research/kb/query', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const deps = await researchDeps(scope, { tavily: 'none' });
    const k = Math.min(12, Math.max(1, Number(req.body?.k) || 6));
    const { hits, total } = await queryKnowledge(scope, String(req.body?.query || ''), deps, { k });
    res.json({ hits, total, ...(req.body?.asPrompt && hits.length ? knowledgePrompt(hits) : {}) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

researchRouter.post('/research/ask', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const deps = await researchDeps(scope, { tavily: req.body?.web === false ? 'none' : 'optional' });
    res.json({ ok: true, ...(await askResearch(scope, req.body?.question, deps)) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// One spreadsheet cell. The browser walks the rows one at a time, so the
// person sees progress, can stop, and Tavily is never hit in a burst.
researchRouter.post('/research/fill', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const deps = await researchDeps(scope);
    res.json({ ok: true, ...(await fillCell(deps, req.body || {})) });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Recipes: References for a paper, Market brief. One line in, a shaped answer out.
researchRouter.post('/research/recipe', requireDb, async (req, res) => {
  try {
    const recipe = RECIPES[req.body?.recipe];
    if (!recipe) {
      res.status(400).json({ error: 'Unknown recipe.', code: 'RECIPE_UNKNOWN' });
      return;
    }
    const scope = await resolveAgentRouteScope(req);
    res.json({ ok: true, ...(await recipe(scope, req.body?.input, await researchDeps(scope))) });
  } catch (err) {
    agentRouteError(res, err);
  }
});
