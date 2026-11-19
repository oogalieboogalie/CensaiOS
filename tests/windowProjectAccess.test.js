import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

// A chat window can be set to its own project from the window's project menu,
// while the board's main project (the top-left File menu) is another one.
// The agent in that window must be able to work in the window's project, the
// same way it works in the board's main project, through every save of the
// board, and lose it again when the window moves to another project or
// closes. Made-up board: "Garden" is the board's main project, "Homebase" is
// open on this computer and picked in Censai's chat window only.
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-window-project-'));
const GARDEN = path.join(stateDir, 'made-up-garden');
const HOMEBASE = path.join(stateDir, 'made-up-homebase');
const ATTIC = path.join(stateDir, 'made-up-attic'); // a project nobody opened on this computer
for (const folder of [GARDEN, HOMEBASE, ATTIC]) fs.mkdirSync(folder);
fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'made-up-garden', path: GARDEN, projectId: 'garden' }));
fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([HOMEBASE, GARDEN]));
const priorStateDir = process.env.CENSAI_STATE_DIR;
process.env.CENSAI_STATE_DIR = stateDir;

const BOARD = 'made-up-board';
const [PAT, SAM] = [1, 2]; // Pat owns this computer, Sam is a teammate on the board
const ROLES = { [PAT]: 'admin', [SAM]: 'user' };
const PROJECTS = [
  { id: 'garden', name: 'made-up-garden', path: GARDEN },
  { id: 'homebase', name: 'made-up-homebase', path: HOMEBASE },
  { id: 'attic', name: 'made-up-attic', path: ATTIC },
];

// Just enough of the database for these statements: the rows that say which
// agent may work in which project on which board.
let accessRows = [];
const key = (row) => `${row.workspace_id}|${row.project_id}|${row.agent_id}|${row.source_kind}`;
async function answer(sql, params = []) {
  const text = String(sql).replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
  if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
  if (text.includes('FROM workspace_members')) return { rows: [{ role: params[1] === PAT ? 'owner' : 'member' }] };
  if (text.startsWith('SELECT id FROM projects WHERE id = $1')) {
    return { rows: PROJECTS.filter((p) => p.id === params[0]).map(({ id }) => ({ id })) };
  }
  if (text.startsWith('SELECT path FROM projects WHERE id = $1')) {
    return { rows: PROJECTS.filter((p) => p.id === params[0]).map(({ path: folder }) => ({ path: folder })) };
  }
  if (text.includes('FROM projects WHERE id = ANY($1)')) {
    return { rows: PROJECTS.filter((p) => params[0].includes(p.id)) };
  }
  if (text.includes('FROM projects WHERE path IS NOT NULL')) return { rows: PROJECTS };
  if (text.includes('FROM sub_agents')) return { rows: [] };
  if (text.startsWith('SELECT * FROM agents')) return { rows: params[0].map((id) => ({ id, name: id })) };
  if (text.startsWith('SELECT 1 FROM workspace_agent_projects')) {
    return { rows: accessRows.filter((r) => r.workspace_id === params[0] && r.project_id === params[1]).map(() => ({ on_board: 1 })) };
  }
  if (text.startsWith('DELETE FROM workspace_agent_projects')) {
    const [workspaceId, mainProject, mainAgents, keptProjects = [], keptAgents = []] = params;
    const kept = new Set(keptProjects.map((projectId, i) => `${projectId}|${keptAgents[i]}`));
    const exempt = text.includes('unnest($4');
    accessRows = accessRows.filter((r) => !(r.workspace_id === workspaceId && r.source_kind === 'canvas'
      && (r.project_id !== mainProject || !mainAgents.includes(r.agent_id))
      && !(exempt && kept.has(`${r.project_id}|${r.agent_id}`))));
    return { rows: [] };
  }
  if (text.startsWith('INSERT INTO workspace_agent_projects')) {
    const [workspaceId, projectId, agentId, permission, , sourceId] = params;
    const row = { workspace_id: workspaceId, project_id: projectId, agent_id: agentId, permission, source_kind: 'canvas', source_id: sourceId };
    accessRows = [...accessRows.filter((r) => key(r) !== key(row)), row];
    return { rows: [] };
  }
  if (text.startsWith('SELECT permission FROM workspace_agent_projects')) {
    const [workspaceId, projectId, agentId] = params;
    const rows = accessRows.filter((r) => r.workspace_id === workspaceId && r.project_id === projectId && r.agent_id === agentId);
    rows.sort((a, b) => (a.permission === 'work' ? 0 : 1) - (b.permission === 'work' ? 0 : 1));
    return { rows: rows.slice(0, 1).map(({ permission }) => ({ permission })) };
  }
  if (text.includes('FROM workspace_agent_projects wap JOIN projects')) return { rows: [] };
  throw new Error(`Unexpected query: ${text}`);
}
const client = { query: jest.fn(answer), release: jest.fn() };
const pool = { query: jest.fn(answer), connect: jest.fn(async () => client), on: jest.fn(), end: jest.fn() };
const log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {}, startTimer: () => () => 0 };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => log,
  redactUrl: (url) => url,
  writeLogRecord: () => {},
  onLogRecord: () => () => {},
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember: jest.fn(async () => ({ role: 'member' })) }));

const express = (await import('express')).default;
const { projectMembershipsRouter } = await import('../server/routes/projects/memberships.js');
const { assertAgentProjectAccess } = await import('../server/workspaces/projectMemberships.js');
const { persistWorkspaceWithPrewarm, deriveWindowProjectMemberships } = await import('../src/lib/projectPrewarm.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = { userId: Number(req.get('x-made-up-account')) };
  next();
});
app.use('/api', projectMembershipsRouter);

// The browser's fetch, answered by the real route on the made-up database.
let account = PAT;
const realFetch = global.fetch;
global.fetch = async (url, { method = 'GET', body } = {}) => {
  const res = await request(app)[method.toLowerCase()](url)
    .set('x-made-up-account', String(account))
    .send(body ? JSON.parse(body) : undefined);
  return { ok: res.status < 400, status: res.status, json: async () => res.body };
};

const api = { saveWorkspace: jest.fn(async () => ({ revision: 2 })) };
const garden = { type: 'local', name: 'made-up-garden', path: GARDEN, projectId: 'garden' };
// What the window's project menu stores: the open project's folder and name.
const homebase = { type: 'local', name: 'made-up-homebase', path: HOMEBASE, chosen: true };
const censaiChat = (project = homebase) => ({ id: 'w-censai', kind: 'chat', agentId: 'censai', x: 0, y: 0, w: 400, h: 300, project });
const atlasChat = { id: 'w-atlas', kind: 'chat', agentId: 'atlas', x: 500, y: 0, w: 400, h: 300 };
const saveBoard = (wins) => persistWorkspaceWithPrewarm({
  api,
  workspace: { workspaceId: BOARD, currentProject: garden, wins, canvasGroups: [] },
  expectedRevision: 1,
});
const mayWork = (agentId, projectId) => assertAgentProjectAccess(pool, {
  workspaceId: BOARD, projectId, agentId, requiredPermission: 'work',
}).then(() => true, () => false);

beforeEach(() => {
  accessRows = [];
  account = PAT;
});

afterAll(() => {
  global.fetch = realFetch;
  fs.rmSync(stateDir, { recursive: true, force: true });
  if (priorStateDir === undefined) delete process.env.CENSAI_STATE_DIR;
  else process.env.CENSAI_STATE_DIR = priorStateDir;
});

describe("an agent works in the project its own window is set to", () => {
  test("Censai's window is on Homebase while the board's main project is Garden: Censai may work in Homebase", async () => {
    const saved = await saveBoard([censaiChat(), atlasChat]);
    expect(saved.prewarmSynced).toBe(true);
    expect(await mayWork('censai', 'homebase')).toBe(true);
    // The board's main project is still given to everyone, as before.
    expect(await mayWork('censai', 'garden')).toBe(true);
    expect(await mayWork('atlas', 'garden')).toBe(true);
    // Atlas's window follows the board, so Atlas gets nothing more.
    expect(await mayWork('atlas', 'homebase')).toBe(false);
  });

  test('the next save of the board keeps it', async () => {
    await saveBoard([censaiChat(), atlasChat]);
    await saveBoard([censaiChat(), atlasChat]);
    expect(await mayWork('censai', 'homebase')).toBe(true);
  });

  test('it goes when the window moves back to the main project or closes', async () => {
    await saveBoard([censaiChat(), atlasChat]);
    await saveBoard([censaiChat({ ...garden, chosen: true }), atlasChat]);
    expect(await mayWork('censai', 'homebase')).toBe(false);
    expect(await mayWork('censai', 'garden')).toBe(true);

    await saveBoard([censaiChat(), atlasChat]);
    await saveBoard([atlasChat]);
    expect(await mayWork('censai', 'homebase')).toBe(false);
  });

  test("the same access as the board's main project, nothing more", () => {
    expect(deriveWindowProjectMemberships({ currentProject: garden, wins: [censaiChat(), atlasChat], canvasGroups: [] }))
      .toEqual([{ path: HOMEBASE, memberships: [{ agentId: 'censai', permission: 'work' }] }]);
  });

  test("a save leaves alone what was given some other way (a hand-off's or by hand)", async () => {
    const handoff = { workspace_id: BOARD, project_id: 'homebase', agent_id: 'atlas', permission: 'work', source_kind: 'task', source_id: 'made-up-plan' };
    accessRows.push(handoff);
    await saveBoard([atlasChat]);
    expect(accessRows).toContainEqual(handoff);
  });

  test("a teammate's save cannot give a window a project nobody opened on this computer", async () => {
    account = SAM;
    const saved = await saveBoard([censaiChat({ type: 'local', name: 'made-up-attic', path: ATTIC, chosen: true }), atlasChat]);
    expect(await mayWork('censai', 'attic')).toBe(false);
    // The board's main project still goes to its agents.
    expect(saved.prewarmSynced).toBe(true);
    expect(await mayWork('atlas', 'garden')).toBe(true);

    // A project open on this computer is theirs to give, as the main project is.
    await saveBoard([censaiChat(), atlasChat]);
    expect(await mayWork('censai', 'homebase')).toBe(true);
  });

  test("nor can the owner's own save, since a teammate may have set that window on the shared board", async () => {
    // Windows travel through the shared board, so Pat's tab saves Sam's pick too.
    const saved = await saveBoard([censaiChat({ type: 'local', name: 'made-up-attic', path: ATTIC, chosen: true }), atlasChat]);
    expect(saved.prewarmSynced).toBe(true);
    expect(await mayWork('censai', 'attic')).toBe(false);
    expect(await mayWork('atlas', 'garden')).toBe(true);
  });
});
