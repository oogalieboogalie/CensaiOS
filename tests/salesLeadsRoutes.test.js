import { jest } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
  requireWorkspaceMember: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
  ensurePersonalWorkspace: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
  ensureUserDefaultWorkspace: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
}));

const { default: express } = await import('express');
const { leadsRouter } = await import('../server/routes/agents/leads.js');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  instance.use('/api', leadsRouter);
  return instance;
}

describe('sales-leads routes', () => {
  beforeEach(() => query.mockReset());

  test('lists the workspace queue', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'l-1', name: 'Jane', icp_score: 0.9 }] });

    const res = await request(app()).get('/api/sales-leads?workspaceId=workspace-1');

    expect(res.status).toBe(200);
    expect(res.body.leads).toHaveLength(1);
    expect(query.mock.calls[0][0]).toContain('FROM sales_leads');
    expect(query.mock.calls[0][1]).toEqual(['workspace-1']);
  });

  test('forwards status and score filters', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app()).get('/api/sales-leads?workspaceId=workspace-1&status=new&min_score=0.7');

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual(['workspace-1', 'new', 0.7]);
  });

  test('advances a lead and 404s on misses', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'l-1' }] });
    const ok = await request(app())
      .patch('/api/sales-leads/l-1/status?workspaceId=workspace-1')
      .send({ status: 'contacted' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    query.mockResolvedValueOnce({ rows: [] });
    const miss = await request(app())
      .patch('/api/sales-leads/nope/status?workspaceId=workspace-1')
      .send({ status: 'dead' });
    expect(miss.status).toBe(404);
  });
});
