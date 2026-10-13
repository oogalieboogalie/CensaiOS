// Scout agents, wired in: every core agent that can read projects has
// scout_map and scout_find; the scout runs on the cheapest fast model the
// person has a key for unless they pick one; the Scout panel's routes need
// sign-in and a board member, and only map projects the agent has open.
import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const settings = new Map();
let keys = [];
function fakeQuery(sql, params = []) {
  const s = String(sql);
  if (s.includes('FROM user_api_keys')) return { rows: keys.map((provider) => ({ provider })) };
  if (s.includes('FROM agent_scout_settings')) {
    const row = settings.get(`${params[0]}|${params[1]}`);
    return { rows: row ? [row] : [] };
  }
  if (s.includes('INSERT INTO agent_scout_settings')) {
    settings.set(`${params[0]}|${params[1]}`, { model_provider: params[2], model_name: params[3] });
    return { rows: [] };
  }
  return { rows: [] };
}
const db = { query: jest.fn(async (sql, params) => fakeQuery(sql, params)), on: jest.fn() };
let root;
const requireWorkspaceMember = jest.fn(async () => ({ id: 'board-1', role: 'member' }));
const listWorkspaceAgentProjects = jest.fn(async () => [
  { project_id: 'p1', project_name: 'censaiOS', project_path: root, project_repo: null },
  { project_id: 'p2', project_name: 'remote', project_path: null, project_repo: 'me/remote' },
]);
const resolveProjectForCall = jest.fn(async () => ({ project: { name: 'censaiOS', path: root } }));

jest.unstable_mockModule('../server/db.js', () => ({ default: db, createDbPool: () => db }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/tools/helpers.js', () => ({ resolveProjectForCall }));

const { pickAutoModel, resolveScoutModel, saveScoutSetting, scoutModelChoices } = await import('../server/repoScout/settings.js');
const { handleScoutTool } = await import('../server/tools/handlers/scout.js');
const { createAgentScoutRouter } = await import('../server/routes/agentScout.js');
const { familyDefaultToolNames, familyToolPolicy } = await import('../server/tools/rbac/familyBaseline.js');
const { listToolCatalog } = await import('../server/tools/catalog.js');
const { forgetRepoMaps } = await import('../server/repoScout/map.js');

beforeEach(() => {
  settings.clear();
  keys = [];
  forgetRepoMaps();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-tools-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/labels.js'), "export const startButtonLabel = 'Begin';\n");
  const from = (p) => `from '${p}'`;
  fs.writeFileSync(path.join(root, 'src/Welcome.jsx'), `import { startButtonLabel } ${from('./labels.js')};\nexport function Welcome() { return startButtonLabel; }\n`);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('scout model', () => {
  test('auto takes the cheapest fast model the person has a key for', async () => {
    expect(pickAutoModel([])).toBeNull();
    expect(pickAutoModel(['anthropic', 'google']).model).toBe('gemini-3.8-flash');
    expect(pickAutoModel(['anthropic', 'openai']).model).toBe('claude-haiku-5-5');
    keys = ['anthropic'];
    expect(await resolveScoutModel({ userId: 1, agentId: 'atlas' }, { db })).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5', auto: true });
    keys = [];
    expect(await resolveScoutModel({ userId: 1, agentId: 'atlas' }, { db })).toMatchObject({ provider: null, reason: expect.stringMatching(/map alone/) });
  });

  test('a picked model wins while its key is there, and falls back when it is not', async () => {
    keys = ['google', 'anthropic'];
    await saveScoutSetting(db, { userId: 1, agentId: 'atlas', provider: 'anthropic', model: 'claude-haiku-5-5' });
    expect(await resolveScoutModel({ userId: 1, agentId: 'atlas' }, { db })).toMatchObject({ model: 'claude-haiku-5-5', auto: false });
    keys = ['google'];
    expect(await resolveScoutModel({ userId: 1, agentId: 'atlas' }, { db })).toMatchObject({
      model: 'gemini-3.8-flash', auto: true, reason: expect.stringMatching(/No anthropic key/),
    });
    await saveScoutSetting(db, { userId: 1, agentId: 'atlas', provider: 'ollama', model: 'llama3.1:8b' });
    expect(await resolveScoutModel({ userId: 1, agentId: 'atlas' }, { db })).toMatchObject({ provider: 'ollama', auto: false });
    await expect(saveScoutSetting(db, { userId: 1, agentId: 'atlas', provider: 'google', model: 'made-up' })).rejects.toMatchObject({ statusCode: 400 });
    expect(scoutModelChoices(['google']).find((c) => c.model === 'gemini-3.8-flash')).toMatchObject({ hasKey: true });
  });
});

describe('agent tools', () => {
  test('core agents that read projects get both scout tools, read-only', () => {
    for (const agent of ['atlas', 'echo', 'genesis', 'nexus']) {
      expect(familyDefaultToolNames(agent)).toEqual(expect.arrayContaining(['scout_map', 'scout_find']));
    }
    expect(familyToolPolicy('atlas', 'scout_find')).toMatchObject({ risk: 'read' });
    const catalog = listToolCatalog().tools.filter((t) => t.name.startsWith('scout_')).sort((a, b) => a.name.localeCompare(b.name));
    expect(catalog.map((t) => [t.name, t.risk, t.scopeKind])).toEqual([['scout_find', 'read', 'project'], ['scout_map', 'read', 'project']]);
  });

  test('scout_map and scout_find answer on the agent\'s project', async () => {
    const context = { workspaceId: 'board-1', userId: 1 };
    expect(await handleScoutTool('atlas', 'scout_map', {}, context)).toMatch(/Scout map of censaiOS: 2 files/);
    expect(await handleScoutTool('atlas', 'scout_map', { path: 'labels.js' }, context)).toContain('Used by (change these too if the change breaks them): src/Welcome.jsx');
    const found = await handleScoutTool('atlas', 'scout_find', { change: 'change the start button label' }, context);
    expect(found).toMatch(/^Scout \(map only\): change src\/labels\.js at line 1/);
    expect(found).toMatch(/No model key saved yet/);
    expect(await handleScoutTool('atlas', 'scout_find', { change: ' ' }, context)).toMatch(/^Error/);
    resolveProjectForCall.mockResolvedValueOnce({ project: { name: 'remote', repo: 'me/remote' } });
    expect(await handleScoutTool('atlas', 'scout_map', {}, context)).toMatch(/^Error: It lives on GitHub/);
  });
});

describe('Scout panel routes', () => {
  const app = (userId = 1) => {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
    a.use('/api/agent-scout', createAgentScoutRouter({ db, isReady: () => true, deps: { listProjects: listWorkspaceAgentProjects } }));
    return a;
  };
  const q = '?agentId=atlas&workspaceId=board-1';

  test('need sign-in and an agent', async () => {
    expect((await request(app(null)).get(`/api/agent-scout${q}`)).status).toBe(401);
    expect((await request(app()).get('/api/agent-scout?agentId=../x')).status).toBe(400);
  });

  test('load, pick a model, map and find', async () => {
    keys = ['google'];
    const loaded = await request(app()).get(`/api/agent-scout${q}`);
    expect(loaded.body.model).toMatchObject({ model: 'gemini-3.8-flash', auto: true });
    expect(loaded.body.projects).toEqual([
      expect.objectContaining({ id: 'p1', mappable: true }), expect.objectContaining({ id: 'p2', mappable: false }),
    ]);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(db, expect.objectContaining({ roles: ['owner', 'admin', 'member'] }));
    const picked = await request(app()).put(`/api/agent-scout/model${q}`).send({ provider: 'ollama', model: 'llama3.1:8b' });
    expect(picked.body.model).toMatchObject({ provider: 'ollama', auto: false });
    const map = await request(app()).post(`/api/agent-scout/map${q}`).send({ projectId: 'p1', path: 'labels.js' });
    expect(map.body.stats.files).toBe(2);
    expect(map.body.file.usedBy).toEqual(['src/Welcome.jsx']);
    const other = await request(app()).post(`/api/agent-scout/map${q}`).send({ projectId: 'not-open' });
    expect(other.status).toBe(404);
    const remote = await request(app()).post(`/api/agent-scout/map${q}`).send({ projectId: 'p2' });
    expect(remote.status).toBe(422);
  });

  test('find uses the scout model through the injected completer', async () => {
    const router = createAgentScoutRouter({
      db, isReady: () => true,
      deps: { listProjects: listWorkspaceAgentProjects, find: { resolveModel: async () => ({ provider: 'google', model: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }),
        makeCompleter: async () => async () => '{"file":"src/labels.js","line":1,"column":14,"reason":"The label lives here."}' } },
    });
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { req.session = { userId: 1 }; next(); });
    a.use('/api/agent-scout', router);
    const res = await request(a).post(`/api/agent-scout/find${q}`).send({ projectId: 'p1', change: 'start button label' });
    expect(res.body.result).toMatchObject({ pickedBy: 'model', model: 'Gemini 3.8 Flash', file: 'src/labels.js', line: 1, column: 14 });
  });
});
