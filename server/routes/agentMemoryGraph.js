// server/routes/agentMemoryGraph.js
//
// The Memory panel's side of the knowledge graph: how things are connected,
// add / end / forget a connection, and "what was true on a date" across
// facts and connections. Mounted inside the agent memory router, so every
// call is already the signed-in person's own memory of one agent.

import { FactError, factsAsOf, parseWhen } from '../agentMemory/facts.js';
import { normalizeLinkInput } from '../agentMemory/graph.js';
import * as graphStore from '../agentMemory/graphStore.js';
import * as store from '../agentMemory/store.js';

export function relationView(row) {
  return {
    id: String(row.id),
    from: row.from_name,
    fromKind: row.from_kind,
    relation: row.relation,
    to: row.to_name,
    toKind: row.to_kind,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    recordedAt: row.recorded_at,
    supersededAt: row.superseded_at,
    kind: row.change_kind,
    source: row.source,
  };
}

/** Connections for the panel. Never fails the whole panel on an older database. */
export async function graphSnapshot(db, scope) {
  try {
    const [links, history, things] = await Promise.all([
      graphStore.currentRelations(db, { ...scope, limit: 200 }),
      graphStore.relationHistory(db, scope),
      graphStore.entities(db, scope),
    ]);
    return {
      links: links.map(relationView),
      linkHistory: history.map(relationView),
      things: things.map((e) => ({ id: String(e.id), name: e.name, kind: e.kind, openLinks: e.open_links })),
    };
  } catch {
    return { links: [], linkHistory: [], things: [] };
  }
}

const ID = /^\d{1,18}$/;
const checkId = (id) => {
  if (!ID.test(String(id))) throw new FactError('No current connection with that id.', 404);
  return String(id);
};

export function addGraphRoutes(router, { db, snapshot, fail, factView }) {
  router.get('/as-of', async (req, res) => {
    try {
      const trueAt = parseWhen(req.query.date, new Date());
      const [history, links] = await Promise.all([
        store.factHistory(db, req.memoryScope),
        graphStore.relationsOn(db, { ...req.memoryScope, trueAt }),
      ]);
      res.json({
        date: trueAt,
        facts: factsAsOf(history, { trueAt }).map(factView),
        links: links.map(relationView),
      });
    } catch (error) { fail(res, error); }
  });

  router.post('/relations', async (req, res) => {
    try {
      const input = normalizeLinkInput(req.body || {});
      const result = await graphStore.writeRelation(db, { ...req.memoryScope, input, source: 'person' });
      res.status(result.status === 'same' ? 200 : 201).json({ status: result.status, ...(await snapshot(req.memoryScope)) });
    } catch (error) { fail(res, error); }
  });

  router.post('/relations/:id/end', async (req, res) => {
    try {
      const endAt = parseWhen(req.body?.ended, new Date());
      await graphStore.endRelation(db, { ...req.memoryScope, id: checkId(req.params.id), endAt, source: 'person' });
      res.json(await snapshot(req.memoryScope));
    } catch (error) { fail(res, error); }
  });

  router.delete('/relations/:id', async (req, res) => {
    try {
      await graphStore.forgetRelation(db, { ...req.memoryScope, id: checkId(req.params.id) });
      res.json(await snapshot(req.memoryScope));
    } catch (error) { fail(res, error); }
  });
}
