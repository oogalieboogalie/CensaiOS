// Group goals and milestones through the real routes and a real Postgres:
// made with POST, then changed with PATCH, for tables with UUID ids (what
// docker/004-sub-agents.sql makes) and with plain whole-number ids (an older
// install made another way). Runs when MEMORY_TEST_DATABASE_URL or the local
// docker database on port 5433 answers; skipped when neither is reachable.
// Made-up person: Pat (user 1) at Testco.
import pg from 'pg';
import { jest } from '@jest/globals';
import request from 'supertest';

async function reachableDatabaseUrl() {
  const candidate = process.env.MEMORY_TEST_DATABASE_URL
    || 'postgresql://homebase:homebase@127.0.0.1:5433/homebase';
  const client = new pg.Client({ connectionString: candidate, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return candidate;
  } catch {
    return '';
  } finally {
    await client.end().catch(() => {});
  }
}

const url = await reachableDatabaseUrl();
const maybe = url ? describe : describe.skip;

const current = { pool: null };
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: (...args) => current.pool.query(...args), on: () => {}, end: async () => {} },
}));

const { goalsRouter } = await import('../server/routes/agents/goals.js');
const { milestonesRouter } = await import('../server/routes/agents/milestones.js');
const { nonUuidGroupIds } = await import('../server/boot/groupIdColumns.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { userId: 1 }; next(); });
app.use('/api', goalsRouter, milestonesRouter);

const ID = { uuid: 'UUID PRIMARY KEY DEFAULT gen_random_uuid()', integer: 'SERIAL PRIMARY KEY' };

function tablesSql(idType) {
  return `
    CREATE TABLE group_goals (id ${ID[idType]}, owner_user_id INTEGER, group_name TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE group_milestones (id ${ID[idType]}, owner_user_id INTEGER, group_name TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, completed BOOLEAN DEFAULT FALSE, completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW());`;
}

maybe('group goals and milestones on a real Postgres', () => {
  const schemas = {};
  let admin;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    for (const idType of Object.keys(ID)) {
      const schema = `goals_${idType}_${Date.now()}`;
      await admin.query(`CREATE SCHEMA ${schema}`);
      await admin.query(`SET search_path TO ${schema}; ${tablesSql(idType)}`);
      schemas[idType] = { schema, pool: new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` }) };
    }
  });

  afterAll(async () => {
    for (const { schema, pool } of Object.values(schemas)) {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    }
    await admin.end();
  });

  test.each(Object.keys(ID))('a goal and a milestone with %s ids can be made and then changed', async (idType) => {
    current.pool = schemas[idType].pool;
    const goal = await request(app).post('/api/goals').send({ groupName: 'Testco launch', title: 'Ship the beta' }).expect(200);
    await request(app).patch(`/api/goals/${goal.body.id}`).send({ status: 'done' }).expect(200);
    const goals = await request(app).get('/api/goals/Testco%20launch').expect(200);
    expect(goals.body[0].status).toBe('done');

    const milestone = await request(app).post('/api/milestones').send({ groupName: 'Testco launch', title: 'Beta out' }).expect(200);
    await request(app).patch(`/api/milestones/${milestone.body.id}/complete`).expect(200);
    const milestones = await request(app).get('/api/milestones/Testco%20launch').expect(200);
    expect(milestones.body[0].completed).toBe(true);
  });

  test('the start check names whole-number id columns and passes UUID ones', async () => {
    const asIn = async (idType) => {
      const client = await schemas[idType].pool.connect();
      try { return await nonUuidGroupIds(client); } finally { client.release(); }
    };
    expect(await asIn('uuid')).toEqual([]);
    expect(await asIn('integer')).toEqual([
      { table: 'group_goals', type: 'integer' },
      { table: 'group_milestones', type: 'integer' },
    ]);
  });
});
