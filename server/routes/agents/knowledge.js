import express from 'express';
import { requireDb } from './shared.js';
import {
  addTriple,
  queryGraph,
  addNugget,
  getNuggets,
} from '../../memory.js';
import { memoryRouteError, resolveRequestMemoryScope } from './memoryScope.js';


export const knowledgeRouter = express.Router();

knowledgeRouter.post('/graph', requireDb, async (req, res) => {
  try {
    const { agentId, subject, predicate, object, confidence } = req.body;
    if (!agentId || !subject || !predicate || !object) {
      return res.status(400).json({ error: 'agentId, subject, predicate, object required' });
    }
    const scope = await resolveRequestMemoryScope(req);
    const id = await addTriple(agentId, subject, predicate, object, confidence, scope);
    res.json({ id });
  } catch (err) {
    memoryRouteError(res, err);
  }
});

knowledgeRouter.get('/graph/:agentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveRequestMemoryScope(req);
    const triples = await queryGraph(req.params.agentId, req.query.subject || '', scope);
    res.json(triples);
  } catch (err) {
    memoryRouteError(res, err);
  }
});

knowledgeRouter.post('/nuggets', requireDb, async (req, res) => {
  try {
    const { title, content, discoveredBy, qualityScore } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });
    const scope = await resolveRequestMemoryScope(req);
    const id = await addNugget(title, content, discoveredBy, qualityScore, scope);
    res.json({ id });
  } catch (err) {
    memoryRouteError(res, err);
  }
});

knowledgeRouter.get('/nuggets/:agentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveRequestMemoryScope(req);
    const nuggets = await getNuggets(req.params.agentId, Number(req.query.limit) || 10, scope);
    res.json(nuggets);
  } catch (err) {
    memoryRouteError(res, err);
  }
});
