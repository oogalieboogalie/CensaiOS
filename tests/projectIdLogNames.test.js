import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

// A project's id is made from the name someone gave it (shared-<name>,
// server/workspaces/projects.js), and a board saves which of its agents work
// in a project at /api/workspaces/<board>/agent-projects/<the project's id>.
// The request log keeps each request's method, route, status and time, never
// the project's name. Made-up names for Pat Example, this computer's owner.
const NAME = 'made-up-garden-plans';
const ID = `shared-${NAME}`;
const NAMED = /made-up|garden/i;
const BOARD = 'user-1-default';

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-project-log-'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-project-home-'));
const folder = path.join(home, NAME);
fs.mkdirSync(folder);
const priorStateDir = process.env.CENSAI_STATE_DIR;
process.env.CENSAI_STATE_DIR = stateDir;

const pool = { query: jest.fn(async (_sql, [id] = []) => ({ rows: id === 1 ? [{ role: 'admin' }] : [] })), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  requireWorkspaceMember: jest.fn(async () => ({ role: 'owner' })),
  resolveWorkspaceContext: jest.fn(),
  ensurePersonalWorkspace: jest.fn(),
}));
jest.unstable_mockModule('../server/workspaces/projectMemberships.js', () => ({
  listWorkspaceAgentProjects: jest.fn(async () => []),
  replaceCanvasProjectMemberships: jest.fn(async () => []),
}));
jest.unstable_mockModule('../server/workspaces.js', () => ({
  listProjects: jest.fn(async () => []),
  openProject: jest.fn(async (_owner, { name, existingPath }) => ({ id: `shared-${name}`, name, path: existingPath })),
}));

const { onLogRecord, redactUrl } = await import('../server/logger.js');
const { requestLogger } = await import('../server/boot/requestLog.js');
const { projectsRouter } = await import('../server/routes/projects/index.js');
const { hideNamesInAddress } = await import('../shared/logs/addressNames.js');

const app = express();
app.use(express.json());
app.use(requestLogger());
app.use((req, _res, next) => { req.session = { userId: 1 }; next(); });
app.use('/api', projectsRouter);

const records = [];
onLogRecord((r) => records.push(r));

afterAll(() => {
  if (priorStateDir === undefined) delete process.env.CENSAI_STATE_DIR;
  else process.env.CENSAI_STATE_DIR = priorStateDir;
  for (const dir of [stateDir, home]) fs.rmSync(dir, { recursive: true, force: true });
});

test('opening, saving and taking a project off a board logs each request without the project\'s name', async () => {
  const give = (memberships) => ({ memberships, sourceId: BOARD });
  for (const [method, url, body] of [
    ['post', '/api/projects/open', { path: folder }],
    ['get', `/api/workspaces/${BOARD}/agent-projects?agentId=atlas`],
    ['put', `/api/workspaces/${BOARD}/agent-projects/${ID}`, give([{ agentId: 'atlas', permission: 'read' }])],
    ['put', `/api/workspaces/${BOARD}/agent-projects/${ID}`, give([])],
  ]) expect([url, (await request(app)[method](url).send(body)).status]).toEqual([url, 200]);

  const lines = records.filter((r) => r.namespace === 'http').map((r) => r.message);
  expect(lines.map((line) => line.replace(/ \d+ms$/, ''))).toEqual([
    'POST /api/projects/open 200',
    `GET /api/workspaces/${BOARD}/agent-projects?agentId=atlas 200`,
    `PUT /api/workspaces/${BOARD}/agent-projects/[redacted] 200`,
    `PUT /api/workspaces/${BOARD}/agent-projects/[redacted] 200`,
  ]);
  for (const line of lines) expect(line).toMatch(/ \d+ms$/);
  expect(JSON.stringify(records)).not.toMatch(NAMED);
});

test('a project\'s id is hidden wherever an address carries it, and the app\'s own words stay', () => {
  // An older install made a project's id from its name another way.
  expect(redactUrl(`/api/workspaces/${BOARD}/agent-projects/censai-made-up-old-plans`)).toBe(`/api/workspaces/${BOARD}/agent-projects/[redacted]`);
  expect(redactUrl(`/api/some-new-route/${ID}/notes?limit=5`)).toBe('/api/some-new-route/[redacted]/notes?limit=5');
  expect(redactUrl(`/api/projects?id=${ID}&workspace=${ID}&limit=5`)).toBe('/api/projects?id=[redacted]&workspace=[redacted]&limit=5');
  // A data box's notes by project: the board's own word stays.
  expect(redactUrl(`/api/scratchpad/sub-1/${NAME}?workspaceId=${BOARD}`)).toBe(`/api/scratchpad/sub-1/[redacted]?workspaceId=${BOARD}`);
  expect(redactUrl(`/api/scratchpad/sub-1/default?workspaceId=${BOARD}`)).toBe(`/api/scratchpad/sub-1/default?workspaceId=${BOARD}`);
  for (const plain of [`/api/workspaces/${BOARD}/agent-projects`, '/api/projects/open', '/api/current-project', '/api/projects?id=42', '/assets/shared-a1b2c3.js']) {
    expect(redactUrl(plain)).toBe(plain);
  }
  // The board's failed-request line shows the same address.
  expect(hideNamesInAddress(`/api/workspaces/${BOARD}/agent-projects/${ID}`)).toBe(`/api/workspaces/${BOARD}/agent-projects/[redacted]`);
});
