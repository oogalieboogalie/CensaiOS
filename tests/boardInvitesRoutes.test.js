import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const redeemJoinCode = jest.fn();
const previewJoinCode = jest.fn();
const inviteToBoard = jest.fn();
const establishAuthenticatedSession = jest.fn(async (req, user) => { req.session.userId = user.id; });

jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/security/authSession.js', () => ({ establishAuthenticatedSession }));
jest.unstable_mockModule('../server/invites/store.js', () => ({
  inviteToBoard, listMyInvites: jest.fn(async () => []), markInvite: jest.fn(), previewJoinCode, redeemJoinCode,
}));

const { boardInvitesPublicRouter, boardInvitesRouter } = await import('../server/routes/boardInvites.js');

function app(userId = null) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.use('/api/invites', boardInvitesPublicRouter);
  a.use('/api', boardInvitesRouter);
  return a;
}

describe('board invite routes', () => {
  const before = { ...process.env };
  afterEach(() => { process.env = { ...before }; jest.clearAllMocks(); });

  test('on a home install, a join link signs the new person in and names their board', async () => {
    process.env.CENSAI_MODE = 'local_desktop';
    redeemJoinCode.mockResolvedValue({ user: { id: 12, name: 'Sam' }, workspaceId: 'board-a' });
    const res = await request(app()).post('/api/invites/redeem').send({ code: 'x'.repeat(32), name: 'Sam' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, workspaceId: 'board-a', user: { id: 12, name: 'Sam' } });
    expect(establishAuthenticatedSession).toHaveBeenCalled();
  });

  test('a private or cloud server never makes accounts from a join link', async () => {
    for (const mode of ['private_server', 'cloud_saas']) {
      process.env.CENSAI_MODE = mode;
      const res = await request(app()).post('/api/invites/redeem').send({ code: 'x'.repeat(32), name: 'Sam' });
      expect(res.status).toBe(403);
      const preview = await request(app()).get(`/api/invites/preview?code=${'x'.repeat(32)}`);
      expect(preview.status).toBe(410);
    }
    expect(redeemJoinCode).not.toHaveBeenCalled();
    expect(previewJoinCode).not.toHaveBeenCalled();
  });

  test('making an invite needs a sign-in and passes the join-link rule along', async () => {
    expect((await request(app()).post('/api/workspaces/board-a/invites').send({})).status).toBe(401);
    process.env.CENSAI_MODE = 'private_server';
    inviteToBoard.mockResolvedValue({ kind: 'account', member: { id: 8, name: 'Jo', email: 'jo@x' }, alreadyMember: false, notified: true });
    const res = await request(app(7)).post('/api/workspaces/board-a/invites').send({ email: 'jo@x' });
    expect(res.status).toBe(201);
    expect(inviteToBoard).toHaveBeenCalledWith({}, { workspaceId: 'board-a', userId: 7, email: 'jo@x', allowJoinLinks: false });
  });

  test('a used code answers in plain words', async () => {
    process.env.CENSAI_MODE = 'local_desktop';
    redeemJoinCode.mockRejectedValue(Object.assign(new Error('This invite was used already or has run out. Ask for a new one.'), { statusCode: 410, code: 'INVITE_USED' }));
    const res = await request(app()).post('/api/invites/redeem').send({ code: 'x'.repeat(32), name: 'Sam' });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/used already or has run out/);
    expect(establishAuthenticatedSession).not.toHaveBeenCalled();
  });
});
