import { jest } from '@jest/globals';
import request from 'supertest';

// The merge desk's Fix conflicts card through a real request: the agent
// fixing a made-up pull request read a made-up shop's .env on this computer
// (not in the repo), then asks to print that file and to run a command with
// its key. Made-up people on one desktop: Pat (user 1) owns the computer,
// Sam (user 2) is a teammate on the same board. The card on the shared board
// keeps a teammate's words; only Pat's own screen gets the requests whole.

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

const KEY = 'made-up-fix-key-0123456789';
const ENV = '/made-up/home/made-up-shop/.env';
const task = {
  id: 'made-up-fix', status: 'needs_approval', rev: 3, worktree: { dir: '/made-up/fixes/wt' },
  items: [{ id: 'r', kind: 'read', title: 'Read .env', path: ENV, output: `MADE_UP_KEY=${KEY}`, rev: 1 }],
  permissions: [
    { id: 'p1', taskId: 'made-up-fix', status: 'pending', kind: 'command', title: 'Run a command', detail: `cat ${ENV}`, input: { command: `cat ${ENV}` }, rev: 2 },
    { id: 'p2', taskId: 'made-up-fix', status: 'pending', kind: 'command', title: 'Run a command', detail: `echo made-up call with ${KEY}`, input: { command: `echo made-up call with ${KEY}` }, rev: 3 },
  ],
};
const manager = { get: () => task };

const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');
const { mergeDeskRouter, setFixManagerLoader } = await import('../server/routes/github/mergeDesk.js');
const { resetFixJobs, trackFixJob } = await import('../server/github/conflictFixer.js');
const express = (await import('express')).default;
setFixManagerLoader(async () => manager);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId } : {};
  next();
});
app.use('/api/github', requireAuthorizedSession, mergeDeskRouter);

const BOARD = [{ id: 'p1', title: 'Run a command', detail: '' }, { id: 'p2', title: 'Run a command', detail: 'echo made-up call with [hidden]' }];

beforeEach(() => trackFixJob({ id: 'made-up-job', status: 'needs_approval', text: 'The agent wants your OK to continue.', taskId: 'made-up-fix', token: 'made-up-token' }));
afterEach(() => resetFixJobs());

describe("a fix job's waiting requests", () => {
  test("Pat's own screen gets them whole; the board's copy keeps a teammate's words", async () => {
    const res = await request(app).get('/api/github/desk/fix/made-up-job').set('x-user-id', '1');
    expect(res.status).toBe(200);
    expect(res.body.approvals).toEqual(BOARD);
    expect(res.body.whole).toEqual([{ id: 'p1', title: 'Run a command', detail: `cat ${ENV}` }, { id: 'p2', title: 'Run a command', detail: `echo made-up call with ${KEY}` }]);
    expect(JSON.stringify(res.body.approvals)).not.toMatch(/made-up-shop|0123456789/);
    expect(JSON.stringify(res.body.job)).not.toContain('made-up-token');
  });

  test('Sam gets only the board copy: no path to the .env, no key', async () => {
    const res = await request(app).get('/api/github/desk/fix/made-up-job').set('x-user-id', '2');
    expect(res.status).toBe(200);
    expect(res.body.approvals).toEqual(BOARD);
    expect(res.body).not.toHaveProperty('whole');
    expect(JSON.stringify(res.body)).not.toMatch(/made-up-shop|0123456789/);
  });

  test('signed out is refused', async () => {
    expect((await request(app).get('/api/github/desk/fix/made-up-job')).status).toBe(401);
  });
});
