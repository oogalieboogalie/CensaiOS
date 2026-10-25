import { jest } from '@jest/globals';
import request from 'supertest';

// The GitHub window's review team (server/routes/github/reviewTeam.js)
// through a real request, with the real review job store. GitHub, git and
// the coding CLIs are stand-ins. Made-up people on one Testco desktop: Pat
// (user 1) owns the computer and starts a review; Sam (user 2) is a teammate
// signed in on it with his own GitHub token.

jest.unstable_mockModule('../server/db.js', () => ({
  default: {
    query: jest.fn(async (sql, [userId] = []) => {
      if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: Number(userId) === 1 ? 'admin' : 'user' }] };
      return { rows: [] };
    }),
    on: jest.fn(),
    end: jest.fn(),
  },
}));
jest.unstable_mockModule('../server/security/authPolicy.js', () => ({
  isSessionAuthorized: (session) => Boolean(session?.userId),
}));

const createReview = jest.fn(async () => ({ data: { html_url: 'https://github.com/testco/app/pull/7#review' } }));
const octokit = { rest: { pulls: {
  get: async () => ({ data: { title: 'Fix the loop', head: { ref: 'feature' }, base: { ref: 'master' } } }),
  createReview,
} } };
jest.unstable_mockModule('../server/github/mergeDesk.js', () => ({
  deskError: (message, status = 400) => Object.assign(new Error(message), { status }),
  createOctokit: jest.fn(() => octokit),
}));
jest.unstable_mockModule('../server/github/writeToken.js', () => ({
  resolveGithubWriteToken: jest.fn(async (req) => ({ token: `token-of-${req.session.userId}`, source: 'user' })),
}));
jest.unstable_mockModule('../server/routes/github/mergeDesk.js', () => ({
  canRunAgents: jest.fn(async (req) => Number(req.session?.userId) === 1),
  actorName: jest.fn(async (req) => ({ userId: req.session?.userId ?? null, name: req.session?.userId === 1 ? 'Pat' : 'Sam' })),
}));
jest.unstable_mockModule('../server/github/conflictFixer.js', () => ({
  runGit: jest.fn(async (args) => (args[0] === 'rev-parse' ? 'abc123\n' : '')),
  fixRoot: () => '/tmp/review-route-test',
  ensureClone: jest.fn(async () => '/tmp/review-route-test/testco-app'),
  setJob: (job, patch) => Object.assign(job, patch, { updatedAt: Date.now() }),
}));

const answer = 'Read it.\n\n```json\n{"summary":"One bug.","findings":[{"path":"a.js","line":2,"severity":"high","title":"Off by one","explanation":"Reads past the end."}]}\n```';
const manager = {
  start: jest.fn(async ({ cli }) => ({ id: `task-${cli}` })),
  get: (id) => ({ id, status: 'done', permissions: [], items: [{ kind: 'message', role: 'assistant', text: answer }] }),
  decide: jest.fn(),
};

const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');
const { reviewTeamRouter, setReviewLoaders } = await import('../server/routes/github/reviewTeam.js');
const { resetReviews } = await import('../server/github/reviewTeam.js');
const express = (await import('express')).default;
setReviewLoaders({ manager: async () => manager, roster: async () => [] });

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId, userEmail: userId === 1 ? 'pat@example.com' : 'sam@example.com' } : {};
  next();
});
app.use('/api/github', requireAuthorizedSession, reviewTeamRouter);

const startAsPat = () => request(app).post('/api/github/desk/review').set('x-user-id', '1')
  .send({ repo: 'testco/app', number: 7, reviewers: ['claudecode'] });

beforeEach(() => jest.clearAllMocks());
afterEach(() => resetReviews());

describe('review team route', () => {
  test('signed out is refused', async () => {
    expect((await request(app).post('/api/github/desk/review').send({ repo: 'testco/app', number: 7, reviewers: ['claudecode'] })).status).toBe(401);
    expect((await request(app).get('/api/github/desk/review/abc')).status).toBe(401);
    expect(manager.start).not.toHaveBeenCalled();
  });

  test('Pat starts a review and reads its merged findings', async () => {
    const started = await startAsPat();
    expect(started.status).toBe(202);
    expect(started.body.review).toMatchObject({ repo: 'testco/app', number: 7, by: 'Pat', status: 'done' });

    const read = await request(app).get(`/api/github/desk/review/${started.body.review.id}`).set('x-user-id', '1');
    expect(read.status).toBe(200);
    expect(read.body.review.findings).toEqual([expect.objectContaining({ path: 'a.js', title: 'Off by one' })]);
    expect(read.body.review.userId).toBeUndefined();
  });

  test('Pat posts the findings to the pull request', async () => {
    const { body } = await startAsPat();
    const posted = await request(app).post(`/api/github/desk/review/${body.review.id}/post`).set('x-user-id', '1');
    expect(posted.status).toBe(200);
    expect(posted.body.review.posted).toMatchObject({ url: 'https://github.com/testco/app/pull/7#review' });
    expect(createReview).toHaveBeenCalledTimes(1);
  });

  test('Sam cannot read, post or answer for Pat\'s review', async () => {
    const { body } = await startAsPat();
    const id = body.review.id;
    const read = await request(app).get(`/api/github/desk/review/${id}`).set('x-user-id', '2');
    const post = await request(app).post(`/api/github/desk/review/${id}/post`).set('x-user-id', '2');
    const approve = await request(app).post(`/api/github/desk/review/${id}/approve`).set('x-user-id', '2')
      .send({ taskId: 'task-claudecode', approvalId: 'a1', allow: true });
    expect([read.status, post.status, approve.status]).toEqual([404, 404, 403]);
    expect(createReview).not.toHaveBeenCalled();
    expect(manager.decide).not.toHaveBeenCalled();
  });
});
