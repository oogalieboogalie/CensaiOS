// The knowledge graph on a real Postgres: a new job replaces the old one and
// the old one is kept with its end date; "what was true on a date" answers
// from both facts and connections; the agent's tools and the Memory panel
// routes see the same thing; one person never sees another's graph. Runs
// when MEMORY_TEST_DATABASE_URL is set (skipped otherwise).
import express from 'express';
import request from 'supertest';
import pg from 'pg';
import { ensureAgentMemorySchema } from '../server/agentMemory/schema.js';
import { normalizeFactInput } from '../server/agentMemory/facts.js';
import { normalizeLinkInput } from '../server/agentMemory/graph.js';
import * as graphStore from '../server/agentMemory/graphStore.js';
import * as store from '../server/agentMemory/store.js';
import { createMemoryTools } from '../server/agentMemory/tools.js';
import { createAgentMemoryRouter } from '../server/routes/agentMemory.js';

const url = process.env.MEMORY_TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('agent knowledge graph on Postgres', () => {
  let db;
  const users = [];
  const agentId = `atlas-graph-${Date.now()}`;

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: url });
    await ensureAgentMemorySchema(db);
    for (const n of [1, 2]) {
      const { rows } = await db.query('INSERT INTO users (email) VALUES ($1) RETURNING id', [`graphtest-${Date.now()}-${n}@example.invalid`]);
      users.push(rows[0].id);
    }
  });
  afterAll(async () => {
    if (users.length) await db.query('DELETE FROM users WHERE id = ANY($1)', [users]);
    await db?.end();
  });

  test('a new job replaces the old one, which stays with its dates', async () => {
    const [me, other] = users;
    const link = (raw, now) => graphStore.writeRelation(db, { userId: me, agentId, input: normalizeLinkInput(raw, now), now });
    expect((await link({ from: 'Alex', relation: 'works at', to: 'Acme Realty', since: '2023-05-01', from_kind: 'person', to_kind: 'company' }, new Date('2026-10-01'))).status).toBe('new');
    expect((await link({ from: 'alex', relation: 'Works at', to: 'acme realty' }, new Date('2026-10-02'))).status).toBe('same');
    const moved = await link({ from: 'Alex', relation: 'works at', to: 'Iowa AI LLC', since: '2026-01-01', replaces: true }, new Date('2026-10-05'));
    expect(moved.status).toBe('new');
    expect(moved.closed.map((r) => r.to_name)).toEqual(['Acme Realty']);
    await link({ from: 'Alex', relation: 'lives in', to: 'Des Moines', since: '2020-01-01' }, new Date('2026-10-05'));

    const now = await graphStore.currentRelations(db, { userId: me, agentId });
    expect(now.map((r) => `${r.from_name} ${r.relation} ${r.to_name}`).sort()).toEqual(['Alex lives in Des Moines', 'Alex works at Iowa AI LLC']);
    const then = await graphStore.relationsOn(db, { userId: me, agentId, trueAt: new Date('2025-06-01') });
    expect(then.map((r) => [r.to_name, r.valid_to && r.valid_to.toISOString().slice(0, 10)])).toEqual([['Des Moines', null], ['Acme Realty', '2026-01-01']]);
    // What it believed on 2026-10-03, before it learned about the new job.
    const believed = await graphStore.relationsOn(db, { userId: me, agentId, trueAt: new Date('2026-06-01'), knownAt: new Date('2026-10-03') });
    expect(believed.map((r) => r.to_name)).toEqual(['Acme Realty']);
    expect(await graphStore.currentRelations(db, { userId: other, agentId })).toEqual([]);

    const things = await graphStore.entities(db, { userId: me, agentId });
    expect(things.map((e) => [e.name, e.kind])).toEqual([['Acme Realty', 'company'], ['Alex', 'person'], ['Des Moines', 'thing'], ['Iowa AI LLC', 'thing']]);
  });

  test('the agent tools link, end and look back across facts and connections', async () => {
    const [, me] = users;
    await store.writeFact(db, { userId: me, agentId, input: normalizeFactInput({ attribute: 'favorite color', value: 'green', validFrom: '2024-01-01' }), now: new Date('2026-10-01') });
    await store.writeFact(db, { userId: me, agentId, input: normalizeFactInput({ attribute: 'favorite color', value: 'blue', validFrom: '2026-09-01' }), now: new Date('2026-10-02') });
    const tools = createMemoryTools({ db, userId: me, agentId });
    expect(await tools.call('link_things', { from: 'Sam', relation: 'is the sister of', to: 'Alex', since: '1995-04-02' }))
      .toContain('Saved the connection: Sam is the sister of Alex (true since 1995-04-02');
    expect(await tools.call('link_things', { relation: 'lives in', to: 'Austin', since: '2024-03-01' })).toContain('the user lives in Austin');
    expect(await tools.call('end_link', { relation: 'lives in', to: 'Austin', ended: '2026-09-01' }))
      .toContain('Marked as ended: the user lives in Austin (true 2024-03-01 to 2026-09-01');
    const past = await tools.call('what_was_true', { date: '2025-06-01' });
    expect(past).toContain('favorite color of the user: green (true 2024-01-01 to 2026-09-01');
    expect(past).toContain('the user lives in Austin (true 2024-03-01 to 2026-09-01');
    expect(past).toContain('Sam is the sister of Alex');
    const today = await tools.call('what_was_true', { date: '2026-10-10', about: 'Austin' });
    expect(today).toBe('Nothing in memory was true on 2026-10-10 about "Austin".');
    expect(await tools.call('recall_memory', { query: 'sister' })).toContain('Connections:\n- Sam is the sister of Alex');
    expect(await tools.call('recall_memory', { query: 'Austin' })).toContain('the user lives in Austin (true 2024-03-01 to 2026-09-01');
    expect(await tools.call('end_link', { relation: 'works at', to: 'Nowhere' })).toContain('no current connection');
  });

  test('the Memory panel adds, ends, forgets and looks back', async () => {
    const [me] = users;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.session = { userId: me }; next(); });
    app.use('/api/agent-memory', createAgentMemoryRouter({ db, isReady: () => true }));
    const q = `?agentId=${agentId}`;
    const added = await request(app).post(`/api/agent-memory/relations${q}`).send({ from: 'Alex', relation: 'owns', to: 'censaios.com', since: '2024-10-01' });
    expect(added.status).toBe(201);
    const owns = added.body.links.find((l) => l.to === 'censaios.com');
    expect(owns).toMatchObject({ from: 'Alex', relation: 'owns', source: 'person' });
    const ended = await request(app).post(`/api/agent-memory/relations/${owns.id}/end${q}`).send({ ended: '2026-09-01' });
    expect(ended.body.links.find((l) => l.to === 'censaios.com')).toBeUndefined();
    expect(ended.body.linkHistory.filter((l) => l.to === 'censaios.com' && !l.supersededAt)[0].validTo).toMatch(/^2026-09-01/);
    const look = await request(app).get(`/api/agent-memory/as-of${q}&date=2025-06-01`);
    expect(look.body.links.map((l) => l.to).sort()).toEqual(['Acme Realty', 'Des Moines', 'censaios.com']);
    const wrong = (await request(app).get(`/api/agent-memory${q}`)).body.links.find((l) => l.to === 'Des Moines');
    await request(app).delete(`/api/agent-memory/relations/${wrong.id}${q}`).expect(200);
    const after = await request(app).get(`/api/agent-memory/as-of${q}&date=2025-06-01`);
    expect(after.body.links.map((l) => l.to).sort()).toEqual(['Acme Realty', 'censaios.com']);
    await request(app).delete(`/api/agent-memory/relations/abc${q}`).expect(404);
    await request(app).post(`/api/agent-memory/relations${q}`).send({ relation: 'owns' }).expect(400);
  });
});
