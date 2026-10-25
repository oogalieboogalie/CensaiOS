import { jest } from '@jest/globals';
import request from 'supertest';

// The board's skill-set library (server/routes/agents/skillSets.js) through a
// real request. Made-up people at Testco: Pat (user 1) owns the board, Sam
// (user 2) is on it as a viewer.
//
// Skill sets belong to the board's library, not to one person, so case 4 is
// that a teammate who may only look (Sam) cannot change or delete what Pat put
// there, nor the board's Idea Foundry settings.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));

const MEMBERS = { 'ws-testco': { 1: 'owner', 2: 'viewer' } };
const requireWorkspaceMember = jest.fn(async (_db, { userId, workspaceId, roles = ['owner', 'admin', 'member', 'viewer'] }) => {
  const role = MEMBERS[workspaceId]?.[Number(userId)];
  if (!role) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  if (!roles.includes(role)) throw Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 });
  return { id: workspaceId, name: 'Testco', role };
});
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));

const library = new Map();
const store = {
  listSkillSets: jest.fn(async () => [...library.values()]),
  getSkillSet: jest.fn(async (_db, _ws, id) => library.get(id) || null),
  saveSkillSet: jest.fn(async (_db, _ws, userId, input) => {
    const set = { ...input, id: input.id || 'testco-sales', updatedBy: userId };
    library.set(set.id, set);
    return set;
  }),
  deleteSkillSet: jest.fn(async (_db, _ws, id) => { library.delete(id); }),
  listSkillSetLog: jest.fn(async () => []),
  addSkillSetLog: jest.fn(async (_db, _ws, entry) => ({ id: 'log-1', ...entry })),
  getEquippedSkillSetIds: jest.fn(async () => ['testco-sales']),
  setEquippedSkillSetIds: jest.fn(async (_db, _ws, _agent, ids) => ids),
};
jest.unstable_mockModule('../server/skillSets/store.js', () => store);
jest.unstable_mockModule('../server/skillSets/research.js', () => ({ researchSkillSet: jest.fn() }));
jest.unstable_mockModule('../server/skillSets/deps.js', () => ({ skillSetResearchDeps: jest.fn() }));
const saveFoundrySettings = jest.fn(async (_db, _ws, _user, input) => input);
jest.unstable_mockModule('../server/skillSets/foundry.js', () => ({
  getFoundrySettings: jest.fn(async () => ({ enabled: false })), saveFoundrySettings, SURPRISE_PROFESSIONS: [],
}));

const { skillSetsRouter } = await import('../server/routes/agents/skillSets.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId } : {};
  next();
});
app.use('/api', skillSetsRouter);

beforeEach(() => {
  library.clear();
  library.set('testco-support', { id: 'testco-support', name: 'Testco support', updatedBy: 1 });
  jest.clearAllMocks();
});

describe('skill sets route', () => {
  test('signed out is refused', async () => {
    expect((await request(app).get('/api/skill-sets?workspaceId=ws-testco')).status).toBe(401);
    expect((await request(app).delete('/api/skill-sets/testco-support?workspaceId=ws-testco')).status).toBe(401);
    expect(store.listSkillSets).not.toHaveBeenCalled();
    expect(store.deleteSkillSet).not.toHaveBeenCalled();
  });

  test('Pat reads the Testco library', async () => {
    const res = await request(app).get('/api/skill-sets?workspaceId=ws-testco').set('x-user-id', '1');
    expect(res.status).toBe(200);
    expect(res.body.skillSets).toEqual([expect.objectContaining({ id: 'testco-support' })]);
    expect(store.listSkillSets).toHaveBeenCalledWith(expect.anything(), 'ws-testco');
  });

  test('Pat saves a new skill set, recorded as Pat', async () => {
    const res = await request(app).post('/api/skill-sets').set('x-user-id', '1')
      .send({ workspaceId: 'ws-testco', skillSet: { name: 'Testco sales' } });
    expect(res.status).toBe(200);
    expect(res.body.skillSet).toMatchObject({ id: 'testco-sales', updatedBy: 1 });
    expect(store.saveSkillSet).toHaveBeenCalledWith(expect.anything(), 'ws-testco', 1, { name: 'Testco sales' }, { origin: 'manual', isNew: true });
  });

  test('Sam, a viewer, can look but cannot change or delete Pat\'s skill set or the foundry', async () => {
    expect((await request(app).get('/api/skill-sets/testco-support?workspaceId=ws-testco').set('x-user-id', '2')).status).toBe(200);
    const edit = await request(app).post('/api/skill-sets').set('x-user-id', '2')
      .send({ workspaceId: 'ws-testco', skillSet: { id: 'testco-support', name: 'Mine now' } });
    const del = await request(app).delete('/api/skill-sets/testco-support?workspaceId=ws-testco').set('x-user-id', '2');
    const foundry = await request(app).put('/api/idea-foundry').set('x-user-id', '2').send({ workspaceId: 'ws-testco', enabled: true });
    expect([edit.status, del.status, foundry.status]).toEqual([403, 403, 403]);
    expect(store.saveSkillSet).not.toHaveBeenCalled();
    expect(store.deleteSkillSet).not.toHaveBeenCalled();
    expect(saveFoundrySettings).not.toHaveBeenCalled();
    expect(library.get('testco-support').name).toBe('Testco support');
  });
});
