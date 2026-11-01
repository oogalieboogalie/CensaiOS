// Agent list server half: members read it, nobody else does, and it carries
// times, names and task titles only, never chat text.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createLiveOpsRouter } from '../server/routes/liveOps.js';
import { collectAgentPresence } from '../server/liveOps/agentPresence.js';

function app({ role = 'viewer', userId = 7 } = {}) {
  const db = { query: jest.fn(async () => ({ rows: role ? [{ id: 'ws-1', name: 'Board', role }] : [] })) };
  const presence = jest.fn(async () => ({ chats: [], tasks: [], network: [] }));
  const server = express();
  server.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  server.use('/api/live-ops', createLiveOpsRouter({ db, presence }));
  return { server, presence };
}

test('any member reads the agent list; strangers and signed-out people get nothing', async () => {
  const { server, presence } = app();
  await request(server).get('/api/live-ops/workspaces/ws-1/agents').expect(200);
  expect(presence).toHaveBeenCalledWith(expect.anything(), 'ws-1');
  await request(app({ role: null }).server).get('/api/live-ops/workspaces/ws-1/agents').expect(403);
  await request(app({ userId: null }).server).get('/api/live-ops/workspaces/ws-1/agents').expect(401);
});

test('collects last chats, open tasks and shared agents, scoped to the board', async () => {
  const at = new Date('2026-10-28T11:56:00Z');
  const db = { query: jest.fn(async (sql, params) => {
    expect(params[0]).toBe('ws-1');
    if (sql.includes('FROM conversations')) {
      expect(sql).not.toMatch(/c\.content/);
      return { rows: [{ agent_id: 'echo', role: 'assistant', created_at: at, with_name: 'Alma' }] };
    }
    if (sql.includes('FROM agent_tasks')) return { rows: [{ id: 't1', parent_id: 'nexus', title: 'Check   the backups', status: 'in_progress', started_at: at, created_at: at, updated_at: at, helper_name: 'Scout' }] };
    if (sql.includes('FROM agent_cards')) {
      return { rows: [
        { id: 'ext:censai:abc', name: 'Shared Atlas', import_kind: 'censai', help_status: 'dispatched', help_task: 'Q', help_at: at, run_status: 'pending', run_relay: { id: 'r' } },
        { id: 'ext:n8n:def', name: 'Support bot', import_kind: 'n8n_chat', help_status: null },
      ] };
    }
    return { rows: [] };
  }) };
  const out = await collectAgentPresence(db, 'ws-1', { now: Date.parse('2026-10-28T12:00:00Z') });
  expect(out.chats).toEqual([{ agentId: 'echo', at: at.toISOString(), lastSpeaker: 'agent', withName: 'Alma' }]);
  expect(out.tasks[0]).toMatchObject({ agentId: 'nexus', title: 'Check the backups', status: 'in_progress', helper: 'Scout' });
  expect(out.network[0]).toMatchObject({ cardId: 'ext:censai:abc', source: 'censai', lastRequest: { status: 'waiting', task: 'Q' } });
  expect(out.network[1]).toMatchObject({ source: 'n8n', lastRequest: null });
  expect(out.errors).toEqual({});
});

test('a missing table never hides the rest', async () => {
  const db = { query: jest.fn(async (sql) => {
    if (sql.includes('FROM agent_tasks')) throw Object.assign(new Error('relation "agent_tasks" does not exist'), { code: '42P01' });
    if (sql.includes('FROM agent_cards')) throw new Error('connection reset by 10.0.0.5');
    return { rows: [] };
  }) };
  const out = await collectAgentPresence(db, 'ws-1');
  expect(out.tasks).toEqual([]);
  expect(out.errors).toEqual({ tasks: 'Not set up on this install', network: 'Could not load' });
  expect(JSON.stringify(out)).not.toContain('10.0.0.5');
});
