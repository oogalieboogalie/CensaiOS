import { jest } from '@jest/globals';
import request from 'supertest';

// The knowledge graph and nuggets (server/routes/agents/knowledge.js) through
// a real request. Made-up people: Pat (user 1) owns the Testco board; Sam
// (user 2) is not on it.
//
// Knowledge belongs to the board, not to one person, and the route only adds
// rows (nothing is edited or deleted here). So case 4 checks the line that
// exists: someone off the board cannot read or add to it, and the creator is
// always the signed-in person, never a name sent in the body.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));

const MEMBERS = { 'ws-testco': { 1: 'owner' } };
const resolveWorkspaceContext = jest.fn(async (_db, { userId, workspaceId }) => {
  const role = MEMBERS[workspaceId]?.[Number(userId)];
  if (!role) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  return { id: workspaceId, role };
});
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));

const addTriple = jest.fn().mockResolvedValue('triple-1');
const queryGraph = jest.fn().mockResolvedValue([{ subject: 'Testco', predicate: 'sells', object: 'boards', confidence: 1 }]);
const addNugget = jest.fn().mockResolvedValue('nugget-1');
const getNuggets = jest.fn().mockResolvedValue([{ id: 'nugget-0', nugget_title: 'Pricing' }]);
jest.unstable_mockModule('../server/memory.js', () => ({ addTriple, queryGraph, addNugget, getNuggets }));

const { knowledgeRouter } = await import('../server/routes/agents/knowledge.js');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = userId > 0 ? { userId } : {};
  next();
});
app.use('/api', knowledgeRouter);

const triple = { agentId: 'atlas', subject: 'Testco', predicate: 'sells', object: 'boards', workspaceId: 'ws-testco' };

beforeEach(() => jest.clearAllMocks());

describe('knowledge route', () => {
  test('signed out is refused', async () => {
    expect((await request(app).get('/api/graph/atlas?workspaceId=ws-testco')).status).toBe(401);
    expect((await request(app).post('/api/nuggets').send({ title: 't', content: 'c', workspaceId: 'ws-testco' })).status).toBe(401);
    expect(queryGraph).not.toHaveBeenCalled();
    expect(addNugget).not.toHaveBeenCalled();
  });

  test('Pat reads the graph and nuggets of the Testco board', async () => {
    const graph = await request(app).get('/api/graph/atlas?workspaceId=ws-testco&subject=Testco').set('x-user-id', '1');
    expect(graph.status).toBe(200);
    expect(queryGraph).toHaveBeenCalledWith('atlas', 'Testco', { workspaceId: 'ws-testco', userId: 1 });
    expect(graph.body[0]).toMatchObject({ predicate: 'sells' });

    const nuggets = await request(app).get('/api/nuggets/atlas?workspaceId=ws-testco&limit=3').set('x-user-id', '1');
    expect(nuggets.status).toBe(200);
    expect(getNuggets).toHaveBeenCalledWith('atlas', 3, { workspaceId: 'ws-testco', userId: 1 });
  });

  test('Pat adds a fact; the creator is Pat whatever the body says', async () => {
    const res = await request(app).post('/api/graph').set('x-user-id', '1')
      .send({ ...triple, userId: 2, created_by_user_id: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'triple-1' });
    expect(addTriple).toHaveBeenCalledWith('atlas', 'Testco', 'sells', 'boards', undefined, { workspaceId: 'ws-testco', userId: 1 });
  });

  test('Sam, who is not on the Testco board, cannot read or add to it', async () => {
    const read = await request(app).get('/api/graph/atlas?workspaceId=ws-testco').set('x-user-id', '2');
    const add = await request(app).post('/api/graph').set('x-user-id', '2').send(triple);
    const nugget = await request(app).post('/api/nuggets').set('x-user-id', '2')
      .send({ title: 'Pricing', content: 'Cheaper', workspaceId: 'ws-testco' });
    expect([read.status, add.status, nugget.status]).toEqual([403, 403, 403]);
    expect(queryGraph).not.toHaveBeenCalled();
    expect(addTriple).not.toHaveBeenCalled();
    expect(addNugget).not.toHaveBeenCalled();
  });
});
