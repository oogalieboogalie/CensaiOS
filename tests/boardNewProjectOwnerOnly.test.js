import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

// A board's agents work in the projects the board gives them, with this
// computer's files and its GitHub key, so only this computer's owner gives
// them a project that is new to the board. Anyone on the board may still
// hand the board's own projects to its agents, and the projects the owner
// has open on this computer, as the board does each time it is saved. The
// people are made up: Pat Example owns this computer, Sam Example is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const [PAT, SAM] = [1, 2];
const SHARED = 'made-up-shared-board';
const SAMS_OWN = 'made-up-sams-own-board';
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-new-project-'));
const openFolder = path.join(stateDir, 'made-up-open-plans');
fs.mkdirSync(openFolder);
// The project Pat has open on this computer (the board default Files opens).
fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'made-up-open-plans', path: openFolder }));
const priorStateDir = process.env.CENSAI_STATE_DIR;
process.env.CENSAI_STATE_DIR = stateDir;

const SECRET = 'shared-made-up-secret-plans'; // a folder project Pat never opened for the boards
const REPO = 'made-up-private-repo'; // a GitHub project, read with this computer's GitHub key
const OPEN = 'shared-made-up-open-plans';
const BOARDS_OWN = 'shared-made-up-board-plans'; // already given to the shared board's agents
const PROJECTS = { [SECRET]: '/made-up/secret-plans', [REPO]: null, [OPEN]: openFolder, [BOARDS_OWN]: '/made-up/board-plans' };
const ON_BOARD = { [SHARED]: [BOARDS_OWN] };

const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const requireWorkspaceMember = jest.fn();
const replaceCanvasProjectMemberships = jest.fn();
const logged = [];
const record = (level) => (message, meta) => logged.push(`${level} ${message} ${meta ? JSON.stringify(meta) : ''}`);
const log = { error: record('error'), warn: record('warn'), info: record('info'), debug: record('debug'), trace: () => {}, startTimer: () => () => 0 };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => log,
  redactUrl: (url) => url,
  writeLogRecord: () => {},
  onLogRecord: () => () => {},
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/workspaces/projectMemberships.js', () => ({
  listWorkspaceAgentProjects: jest.fn(async () => []),
  replaceCanvasProjectMemberships,
}));

const express = (await import('express')).default;
const { projectMembershipsRouter } = await import('../server/routes/projects/memberships.js');
const { NEW_PROJECT_OWNER_ONLY } = await import('../server/routes/projects/newProjectOwnerOnly.js');
const { OWNER_UNCHECKED_MESSAGE } = await import('../server/security/systemAdmin.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = { userId: Number(req.get('x-made-up-account')) };
  next();
});
app.use('/api', projectMembershipsRouter);

const ATLAS = [{ agentId: 'atlas', permission: 'read' }];
const give = (who, board, projectId, memberships = ATLAS) => request(app)
  .put(`/api/workspaces/${board}/agent-projects/${projectId}`)
  .set('x-made-up-account', String(who))
  .send({ memberships, sourceId: board });

beforeEach(() => {
  jest.clearAllMocks();
  logged.length = 0;
  requireWorkspaceMember.mockResolvedValue({ role: 'member' });
  replaceCanvasProjectMemberships.mockResolvedValue([]);
  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.includes('FROM workspace_agent_projects')) return { rows: (ON_BOARD[params[0]] || []).includes(params[1]) ? [{ on_board: 1 }] : [] };
    if (text.includes('FROM projects')) return { rows: params[0] in PROJECTS ? [{ path: PROJECTS[params[0]] }] : [] };
    throw new Error(`Unexpected query: ${text}`);
  });
});

afterAll(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
  if (priorStateDir === undefined) delete process.env.CENSAI_STATE_DIR;
  else process.env.CENSAI_STATE_DIR = priorStateDir;
});

describe("a project new to the board is this computer's owner's to give", () => {
  test.each([
    ['a folder project', SECRET, SHARED, 'the shared board'],
    ['a GitHub project', REPO, SHARED, 'the shared board'],
    ['a folder project', SECRET, SAMS_OWN, "Sam's own board"],
    ['a GitHub project', REPO, SAMS_OWN, "Sam's own board"],
  ])('Sam cannot give the agents %s on %s', async (_kind, projectId, board) => {
    const res = await give(SAM, board, projectId);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: NEW_PROJECT_OWNER_ONLY, reason: 'owner-only', code: 'computer_owner_only' });
    expect(replaceCanvasProjectMemberships).not.toHaveBeenCalled();
  });

  test('a project that is not there gets Sam the same words, so they never learn which projects there are', async () => {
    const res = await give(SAM, SAMS_OWN, 'shared-made-up-nothing-here');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(NEW_PROJECT_OWNER_ONLY);
  });

  test("Pat gives the board's agents a new project", async () => {
    for (const projectId of [SECRET, REPO]) {
      const res = await give(PAT, SHARED, projectId);
      expect(res.status).toBe(200);
      expect(replaceCanvasProjectMemberships).toHaveBeenLastCalledWith(pool, {
        workspaceId: SHARED, projectId, memberships: ATLAS, sourceId: SHARED, userId: PAT,
      });
    }
  });

  test('when the owner cannot be checked right now, it says so and gives nothing', async () => {
    const answer = pool.query.getMockImplementation();
    pool.query.mockImplementation(async (sql, params) => {
      if (String(sql).includes('FROM users')) throw new Error('made-up database outage');
      return answer(sql, params);
    });
    const res = await give(PAT, SHARED, SECRET);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(OWNER_UNCHECKED_MESSAGE);
    expect(replaceCanvasProjectMemberships).not.toHaveBeenCalled();
  });

  test('a refusal is logged with the account number only, never the project or the board', async () => {
    await give(SAM, SHARED, SECRET);
    expect(logged.filter((line) => line.includes('refused'))).toEqual([
      `info refused giving a board's agents a new project for account ${SAM}: not the owner `,
    ]);
    expect(logged.join('\n')).not.toMatch(/secret-plans|made-up-shared-board|atlas/);
  });
});

describe('what anyone on the board still does, as each save of the board does', () => {
  test("Sam hands the board's own project to its agents, and the project Pat has open on this computer", async () => {
    for (const [board, projectId] of [[SHARED, BOARDS_OWN], [SHARED, OPEN], [SAMS_OWN, OPEN]]) {
      const res = await give(SAM, board, projectId);
      expect(res.status).toBe(200);
      expect(replaceCanvasProjectMemberships).toHaveBeenLastCalledWith(pool, expect.objectContaining({ workspaceId: board, projectId, userId: SAM }));
    }
    expect(logged.filter((line) => line.includes('refused'))).toEqual([]);
  });

  test('a save that gives no agent anything passes', async () => {
    const res = await give(SAM, SAMS_OWN, SECRET, []);
    expect(res.status).toBe(200);
  });

  test('someone not on the board is refused before anything is looked up', async () => {
    requireWorkspaceMember.mockRejectedValueOnce(Object.assign(new Error('Workspace access denied'), { statusCode: 403 }));
    const res = await give(SAM, SHARED, SECRET);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
