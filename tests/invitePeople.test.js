// One-tap invites: the people you share a board with, and inviting one of
// them by tapping their name (no email, no link).
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { emailOfKnownPerson, listKnownPeople } from '../server/invites/people.js';

describe('people you share a board with', () => {
  test('lists the others on your boards, never you', async () => {
    const db = { query: jest.fn(async () => ({ rows: [{ id: 2, name: 'Dana', email: 'dana@x.test' }, { id: 3, name: '', email: 'lee@x.test' }] })) };
    await expect(listKnownPeople(db, 1)).resolves.toEqual([{ id: 2, name: 'Dana' }, { id: 3, name: 'lee' }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/theirs\.user_id <> \$1/);
    expect(params).toEqual([1]);
  });

  test('a tap only reaches someone you share a board with', async () => {
    const db = { query: jest.fn(async (_sql, [, id]) => ({ rows: id === 2 ? [{ email: 'dana@x.test' }] : [] })) };
    await expect(emailOfKnownPerson(db, 1, 2)).resolves.toBe('dana@x.test');
    await expect(emailOfKnownPerson(db, 1, 99)).resolves.toBeNull();
    await expect(emailOfKnownPerson(db, 1, 'abc')).resolves.toBeNull();
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});

const inviteToBoard = jest.fn();
const known = { listKnownPeople: jest.fn(), emailOfKnownPerson: jest.fn() };
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/security/authSession.js', () => ({ establishAuthenticatedSession: jest.fn() }));
jest.unstable_mockModule('../server/invites/store.js', () => ({
  inviteToBoard, listMyInvites: jest.fn(async () => []), markInvite: jest.fn(), previewJoinCode: jest.fn(), redeemJoinCode: jest.fn(),
}));
jest.unstable_mockModule('../server/invites/people.js', () => known);
const { boardInvitesRouter } = await import('../server/routes/boardInvites.js');

function app(userId = 1) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', boardInvitesRouter);
  return a;
}

describe('invite by tapping a name', () => {
  afterEach(() => jest.clearAllMocks());

  test('lists the people to tap', async () => {
    known.listKnownPeople.mockResolvedValue([{ id: 2, name: 'Dana' }]);
    const res = await request(app()).get('/api/invites/people');
    expect(res.body).toEqual({ people: [{ id: 2, name: 'Dana' }] });
  });

  test('tapping a name invites that account and notifies them, never makes a link', async () => {
    known.emailOfKnownPerson.mockResolvedValue('dana@x.test');
    inviteToBoard.mockResolvedValue({ kind: 'account', member: { id: 2, name: 'Dana', email: 'dana@x.test' }, alreadyMember: false, notified: true });
    const res = await request(app()).post('/api/workspaces/board-a/invites').send({ personId: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'account', notified: true, member: { id: 2 } });
    expect(inviteToBoard).toHaveBeenCalledWith({}, expect.objectContaining({ workspaceId: 'board-a', userId: 1, email: 'dana@x.test', allowJoinLinks: false }));
  });

  test('a name that is not on your boards is refused', async () => {
    known.emailOfKnownPerson.mockResolvedValue(null);
    const res = await request(app()).post('/api/workspaces/board-a/invites').send({ personId: 99 });
    expect(res.status).toBe(404);
    expect(inviteToBoard).not.toHaveBeenCalled();
  });
});
