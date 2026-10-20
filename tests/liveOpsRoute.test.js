// Live Operations route: members of the board read it; nobody else does.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createLiveOpsRouter } from '../server/routes/liveOps.js';
import { boardTerminals, collectLiveOps } from '../server/liveOps/collect.js';

function app({ role = 'viewer', userId = 7 } = {}) {
  const db = { query: jest.fn(async () => ({ rows: role ? [{ id: 'ws-1', name: 'Board', role }] : [] })) };
  const collect = jest.fn(async () => ({ workflowRuns: [], workflowTriggers: [], terminals: [] }));
  const server = express();
  server.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  server.use('/api/live-ops', createLiveOpsRouter({ db, collect }));
  return { server, collect };
}

test('any member, viewers too, reads the board; strangers and signed-out people get nothing', async () => {
  const { server, collect } = app();
  await request(server).get('/api/live-ops/workspaces/ws-1').expect(200);
  expect(collect).toHaveBeenCalledWith(expect.anything(), 'ws-1');
  await request(app({ role: null }).server).get('/api/live-ops/workspaces/ws-1').expect(403);
  await request(app({ userId: null }).server).get('/api/live-ops/workspaces/ws-1').expect(401);
});

test('terminals are listed only for their own board, without their output', () => {
  const live = new Map([
    ['a', { id: 'a', clientSessionId: 'tab-a', alive: true, cli: 'claudecode', backendLabel: 'Claude Code', owner: { userId: '7', workspaceId: 'ws-1' }, scrollback: 'secret', createdAt: 1, lastActivity: 2 }],
    ['b', { id: 'b', alive: true, owner: { userId: '8', workspaceId: 'ws-2' }, createdAt: 1, lastActivity: 2 }],
    ['c', { id: 'c', alive: false, owner: { userId: '7', workspaceId: 'ws-1' } }],
  ]);
  const list = boardTerminals('ws-1', { live });
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ id: 'tab-a', cli: 'claudecode', label: 'Claude Code', ownerUserId: '7' });
  expect(JSON.stringify(list)).not.toContain('secret');
});

test('a failing query never hides the rest', async () => {
  const db = { query: jest.fn(async (sql) => {
    if (sql.includes('board_workflow_triggers')) throw new Error('relation does not exist');
    if (sql.includes('FROM users')) return { rows: [{ id: 7, name: 'Alma' }] };
    return { rows: [{ id: 'r1', window_id: 'w', trigger: 'manual', status: 'failed', error: 'boom', started_at: new Date(), finished_at: null, started_by_name: 'Alma' }] };
  }) };
  const live = new Map([['a', { id: 'a', alive: true, owner: { userId: '7', workspaceId: 'ws-1' }, createdAt: 1, lastActivity: 2 }]]);
  const out = await collectLiveOps(db, 'ws-1', { live });
  expect(out.workflowRuns[0]).toMatchObject({ id: 'r1', status: 'failed', error: 'boom', startedBy: 'Alma' });
  expect(out.workflowTriggers).toEqual([]);
  expect(out.errors.workflowTriggers).toMatch(/does not exist/);
  expect(out.terminals[0].owner).toBe('Alma');
});
