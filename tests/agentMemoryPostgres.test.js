// Agent memory on a real Postgres: facts keep their history with both
// dates, episodes are found by plain words, identity is versioned, and
// one person never sees another person's memory. Runs when
// MEMORY_TEST_DATABASE_URL points at a database with the censaiOS tables
// (skipped otherwise).
import express from 'express';
import request from 'supertest';
import pg from 'pg';
import { ensureAgentMemorySchema } from '../server/agentMemory/schema.js';
import { normalizeFactInput } from '../server/agentMemory/facts.js';
import * as store from '../server/agentMemory/store.js';
import { createMemoryTools } from '../server/agentMemory/tools.js';
import { agentMemoryRows } from '../server/agentMemory/deepMemoryRows.js';
import { createAgentMemoryRouter } from '../server/routes/agentMemory.js';

const url = process.env.MEMORY_TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('agent memory on Postgres', () => {
  let db;
  const users = [];
  const agentId = `atlas-${Date.now()}`;

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: url });
    await ensureAgentMemorySchema(db);
    for (const n of [1, 2]) {
      const { rows } = await db.query('INSERT INTO users (email) VALUES ($1) RETURNING id', [`memtest-${Date.now()}-${n}@example.invalid`]);
      users.push(rows[0].id);
    }
  });
  afterAll(async () => {
    if (users.length) await db.query('DELETE FROM users WHERE id = ANY($1)', [users]);
    await db?.end();
  });

  test('a change and a correction keep every version with its dates', async () => {
    const [me] = users;
    const tell = (raw, now) => store.writeFact(db, { userId: me, agentId, input: normalizeFactInput(raw, now), now });
    expect((await tell({ attribute: 'lives in', value: 'Austin', validFrom: '2024-03-01' }, new Date('2026-10-01'))).status).toBe('new');
    expect((await tell({ attribute: 'lives in', value: 'austin' }, new Date('2026-10-02'))).status).toBe('same');
    expect((await tell({ attribute: 'lives in', value: 'Denver', validFrom: '2026-09-01' }, new Date('2026-10-05'))).status).toBe('change');
    expect((await tell({ attribute: 'lives in', value: 'Boulder', kind: 'correction' }, new Date('2026-10-06'))).status).toBe('correction');

    const current = await store.currentFacts(db, { userId: me, agentId });
    expect(current.map((f) => [f.value, f.valid_from.toISOString().slice(0, 10)])).toEqual([['Boulder', '2026-09-01']]);

    const history = await store.factHistory(db, { userId: me, agentId, key: 'the user|lives in' });
    expect(history.map((f) => [f.value, f.change_kind, Boolean(f.superseded_at), f.valid_to && f.valid_to.toISOString().slice(0, 10)])).toEqual([
      ['Austin', 'new', true, null],
      ['Austin', 'history', false, '2026-09-01'],
      ['Denver', 'change', true, null],
      ['Boulder', 'correction', false, null],
    ]);

    const tools = createMemoryTools({ db, userId: me, agentId: agentId.toUpperCase() });
    const told = await tools.call('fact_history', { attribute: 'Lives in' });
    expect(told).toContain('was "Austin" (true 2024-03-01 to 2026-09-01');
    expect(told).toContain('corrected to "Boulder" (true since 2026-09-01; learned 2026-10-06; current)');
  });

  test('episodes are found by plain words, newest first, and stay private', async () => {
    const [me, other] = users;
    await store.recordEpisode(db, { userId: me, agentId, origin: 'chat', question: 'brand color?', answer: 'Ultem yellow', summary: 'Asked: brand color? | Answered: Ultem yellow' });
    await store.recordEpisode(db, { userId: other, agentId, origin: 'chat', question: 'brand color?', answer: 'red', summary: 'Asked: brand color? | Answered: red' });
    const mine = await store.searchEpisodes(db, { userId: me, agentId, query: 'Which brand color did we pick?' });
    expect(mine.map((e) => e.answer)).toEqual(['Ultem yellow']);
    expect(await store.searchEpisodes(db, { userId: me, agentId, query: 'the and of' })).toEqual([]);
    const deep = await agentMemoryRows({ agentId, userId: me, query: 'brand color', db, ready: () => true });
    expect(deep.map((r) => r.content)).toEqual(['Asked: brand color? | Answered: Ultem yellow']);
  });

  test('the Memory panel routes: identity versions, add, correct, forget, sign-in, privacy', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { const u = req.get('x-test-user'); req.session = u ? { userId: Number(u) } : {}; next(); });
    app.use('/api/agent-memory', createAgentMemoryRouter({ db, isReady: () => true }));
    const as = (n) => ({ 'x-test-user': String(users[n]) });
    const path = (p = '') => `/api/agent-memory${p}?agentId=${agentId}`;

    expect((await request(app).get(path())).status).toBe(401);
    expect((await request(app).get('/api/agent-memory?agentId=../x').set(as(0))).status).toBe(400);

    await request(app).put(path('/identity')).set(as(0)).send({ core: 'I am Atlas.' });
    const second = await request(app).put(path('/identity')).set(as(0)).send({ core: 'I am Atlas, the planner.' });
    expect(second.body.identity.core).toBe('I am Atlas, the planner.');
    expect(second.body.identityVersions.map((v) => [v.core, Boolean(v.supersededAt)])).toEqual([
      ['I am Atlas, the planner.', false], ['I am Atlas.', true],
    ]);

    const added = await request(app).post(path('/facts')).set(as(0)).send({ attribute: 'favorite color', value: 'green' });
    expect(added.status).toBe(201);
    const corrected = await request(app).post(path('/facts')).set(as(0)).send({ attribute: 'favorite color', value: 'blue', kind: 'correction' });
    expect(corrected.body.status).toBe('correction');
    const fact = corrected.body.facts.find((f) => f.attribute === 'favorite color');
    expect(fact).toMatchObject({ value: 'blue', kind: 'correction', source: 'person' });
    expect(corrected.body.history.filter((f) => f.key === fact.key).map((f) => f.value)).toEqual(['green', 'blue']);

    const theirs = await request(app).get(path()).set(as(1));
    expect(theirs.body.facts).toEqual([]);
    expect(theirs.body.identity).toBeNull();
    expect((await request(app).delete(path(`/facts/${fact.id}`)).set(as(1))).status).toBe(404);

    const forgotten = await request(app).delete(path(`/facts/${fact.id}`)).set(as(0));
    expect(forgotten.body.facts.find((f) => f.attribute === 'favorite color')).toBeUndefined();
    expect(forgotten.body.history.filter((f) => f.key === fact.key)).toHaveLength(2);
    expect((await request(app).post(path('/facts')).set(as(0)).send({ value: 'x' })).status).toBe(400);
  });
});
