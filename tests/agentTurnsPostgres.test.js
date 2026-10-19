// The saved conversation on a real database: messages are kept word for word
// with their times, grouped by chat, found by words, never doubled, and one
// person never sees another person's chats (memory or Recents). Runs when
// MEMORY_TEST_DATABASE_URL points at a database with the censaiOS tables.
import express from 'express';
import request from 'supertest';
import pg from 'pg';
import { ensureAgentMemorySchema } from '../server/agentMemory/schema.js';
import * as turns from '../server/agentMemory/turns.js';
import { createTurnTools } from '../server/agentMemory/turnTools.js';
import { loadTurnMemory } from '../server/agentMemory/turnMemory.js';
import { createRecentsRouter } from '../server/routes/recents.js';

const url = process.env.MEMORY_TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('saved conversations on Postgres', () => {
  let db;
  const users = [];
  const agentId = `atlas-${Date.now()}`;
  const chatA = `chat:a-${Date.now()}`;
  const chatB = `chat:b-${Date.now()}`;
  const TZ = 'America/Chicago';

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: url });
    await ensureAgentMemorySchema(db);
    for (const n of [1, 2]) {
      const { rows } = await db.query('INSERT INTO users (email) VALUES ($1) RETURNING id', [`turntest-${Date.now()}-${n}@example.invalid`]);
      users.push(rows[0].id);
    }
    const base = { userId: users[0], agentId, workspaceId: 'board-1' };
    await turns.recordTurns(db, { ...base, conversationId: chatA, windowId: 'wa', turns: [
      { speaker: 'person', text: 'The Maple Street listing goes live Friday.', at: '2026-10-16T15:00:00Z' },
      { speaker: 'agent', text: 'Noted.', at: '2026-10-16T15:00:02Z' },
      { speaker: 'person', text: 'We pulled Maple Street. Oak Avenue duplex instead.', at: '2026-10-16T17:00:00Z' },
      { speaker: 'agent', text: 'Switched to Oak Avenue.', at: '2026-10-16T17:00:03Z' },
    ] });
    await turns.recordTurns(db, { ...base, conversationId: chatB, windowId: 'wb', turns: [
      { speaker: 'person', text: 'Lunch order for Friday?', at: '2026-10-17T16:00:00Z' },
      { speaker: 'agent', text: 'Tacos.', at: '2026-10-17T16:00:01Z' },
    ] });
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id = ANY($1)', [users]);
    await db.end();
  });

  test('a re-sent message is not saved twice', async () => {
    const again = await turns.recordTurns(db, { userId: users[0], agentId, conversationId: chatB, turns: [
      { speaker: 'person', text: 'Lunch order for Friday?', at: '2026-10-17T16:00:00Z' },
    ] });
    expect(again).toEqual([]);
    expect(await turns.conversationTurns(db, { userId: users[0], conversationId: chatB })).toHaveLength(2);
  });

  test('the agent recalls the real messages, the ending, and where it left off', async () => {
    const memory = await loadTurnMemory(db, { userId: users[0], agentId, question: 'What about Maple Street?', conversationId: 'chat:new', timeZone: TZ });
    expect(memory.found).toBe(true);
    expect(memory.leftOff).toContain('Person: Lunch order for Friday?');
    expect(memory.exchanges).toContain('[Fri 2026-10-16 10:00:00 CDT] Person: The Maple Street listing goes live Friday.');
    expect(memory.exchanges).toContain('Oak Avenue');
  });

  test('recall_conversation reads a whole chat, a day, or matching words', async () => {
    const tools = createTurnTools({ db, userId: users[0], agentId, timeZone: TZ });
    const whole = await tools.recall_conversation({ chat_id: chatA });
    expect(whole).toContain('4 messages');
    expect(whole).toContain('[Fri 2026-10-16 12:00:03 CDT] You: Switched to Oak Avenue.');
    expect(await tools.recall_conversation({ day: '2026-10-17' })).toContain('Tacos.');
    expect(await tools.recall_conversation({ query: 'duplex' })).toContain('Oak Avenue duplex');
    const other = createTurnTools({ db, userId: users[1], agentId, timeZone: TZ });
    expect(await other.recall_conversation({ chat_id: chatA })).toContain('No chat');
  });

  test('Recents lists the newest chat first, per board, and only your own', async () => {
    const app = express();
    let who = users[0];
    app.use((req, _res, next) => { req.session = { userId: who }; next(); });
    app.use('/api/recents', createRecentsRouter({ db, isReady: () => true }));
    const mine = await request(app).get('/api/recents?scope=board&workspaceId=board-1');
    expect(mine.status).toBe(200);
    expect(mine.body.chats.map((c) => c.id)).toEqual([chatB, chatA]);
    expect(mine.body.chats[1]).toMatchObject({ title: 'The Maple Street listing goes live Friday.', messages: 4, lastLine: 'Switched to Oak Avenue.' });
    const full = await request(app).get(`/api/recents/chats/${encodeURIComponent(chatA)}`);
    expect(full.body.turns).toHaveLength(4);
    who = users[1];
    expect((await request(app).get('/api/recents?scope=all')).body.chats).toEqual([]);
    expect((await request(app).get(`/api/recents/chats/${encodeURIComponent(chatA)}`)).status).toBe(404);
  });
});
