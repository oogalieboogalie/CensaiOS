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
const { communicationRouter } = await import('../server/routes/agents/communication.js');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  instance.use('/api', communicationRouter);
  return instance;
}

const row = {
  id: 'm-1', from_agent: 'atlas', to_agent: 'censai', content: 'ping',
  subject: null, message_type: 'agent-to-agent', priority: 'high',
  thread_id: null, created_at: new Date().toISOString(),
  from_name: 'Atlas', to_name: 'Censai',
};

describe('mail activity feed', () => {
  beforeEach(() => query.mockReset());

  test('returns recent workspace mail newest-first', async () => {
    query.mockResolvedValueOnce({ rows: [row] });

    const res = await request(app()).get('/api/mail-activity?workspaceId=workspace-1');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0]).toMatchObject({ id: 'm-1', from_name: 'Atlas' });
    expect(query.mock.calls[0][0]).toContain('FROM agent_messages');
    expect(query.mock.calls[0][0]).toContain('ORDER BY am.created_at DESC LIMIT 20');
    expect(query.mock.calls[0][1]).toEqual(['workspace-1']);
  });

  test('forwards a since watermark to the query', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app()).get('/api/mail-activity?workspaceId=workspace-1&since=2026-09-06T00:00:00.000Z');

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
    expect(query.mock.calls[0][0]).toContain('am.created_at > $2');
    expect(query.mock.calls[0][1]).toEqual(['workspace-1', '2026-09-06T00:00:00.000Z']);
  });

  test('ignores an invalid since value', async () => {
    query.mockResolvedValueOnce({ rows: [row] });

    const res = await request(app()).get('/api/mail-activity?workspaceId=workspace-1&since=not-a-date');

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual(['workspace-1']);
  });
});
