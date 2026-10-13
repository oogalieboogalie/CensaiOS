// Board history routes: members read history, viewers can't roll back.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createBoardHistoryRouter } from '../server/routes/boardHistory.js';

function app({ role = 'member', userId = 7 } = {}) {
  const db = { query: jest.fn(async () => ({ rows: role ? [{ id: 'ws-1', name: 'Board', role }] : [] })) };
  const history = {
    listBoardHistory: jest.fn(async () => ({ entries: [{ seq: 3 }], latestSeq: 3 })),
    boardAt: jest.fn(async () => ({ wins: [{ id: 'a' }] })),
    restoreBoard: jest.fn(async (_id, seq) => ({ restoredTo: seq, windows: 1 })),
  };
  const publish = jest.fn();
  const server = express();
  server.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  server.use('/api', createBoardHistoryRouter({ db, history, publish }));
  return { server, history, publish };
}

test('a member reads the history and a point in it', async () => {
  const { server, history } = app();
  await request(server).get('/api/workspaces/ws-1/history').expect(200, { entries: [{ seq: 3 }], latestSeq: 3 });
  const point = await request(server).get('/api/workspaces/ws-1/history/2').expect(200);
  expect(point.body).toEqual({ seq: 2, board: { wins: [{ id: 'a' }] } });
  expect(history.boardAt).toHaveBeenCalledWith('ws-1', 2);
  await request(server).get('/api/workspaces/ws-1/history/zero').expect(400);
});

test('a member rolls back as themselves and everyone is told', async () => {
  const { server, history, publish } = app();
  await request(server).post('/api/workspaces/ws-1/history/2/restore').expect(200, { ok: true, restoredTo: 2, windows: 1 });
  expect(history.restoreBoard).toHaveBeenCalledWith('ws-1', 2, { actor: 'user:7' });
  expect(publish).toHaveBeenCalledWith('ws-1', expect.objectContaining({ type: 'board.history.restored', restoredTo: 2 }));
});

test('viewers can look but not roll back; strangers and signed-out people get nothing', async () => {
  const viewer = app({ role: 'viewer' });
  await request(viewer.server).get('/api/workspaces/ws-1/history').expect(200);
  await request(viewer.server).post('/api/workspaces/ws-1/history/2/restore').expect(403);
  expect(viewer.history.restoreBoard).not.toHaveBeenCalled();
  await request(app({ role: null }).server).get('/api/workspaces/ws-1/history').expect(403);
  await request(app({ userId: null }).server).get('/api/workspaces/ws-1/history').expect(401);
});
