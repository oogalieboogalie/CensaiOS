import { jest } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const resolveWorkspaceContext = jest.fn();
const ensureOperationalIntelligenceSchema = jest.fn();
const envSnapshot = { ...process.env };

jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));
jest.unstable_mockModule('../server/operational-intelligence/schema.js', () => ({ ensureOperationalIntelligenceSchema }));

const { default: express } = await import('express');
const { operationalIntelligenceRouter } = await import('../server/routes/operationalIntelligence.js');
const { recordProvenance } = await import('../server/operational-intelligence/provenance.js');

function app(session = { userId: 7 }) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.session = session;
    next();
  });
  instance.use('/api/operational-intelligence', operationalIntelligenceRouter);
  return instance;
}

const RECORD_ID = '3f2a6a8e-1c2b-4d5e-8f90-123456789abc';

function row(userId) {
  return {
    id: RECORD_ID,
    workspace_id: 'workspace-owned',
    owner_id: 'atlas',
    title: 'AI Generation: src/app.js',
    created_at: '2026-10-04T00:00:00.000Z',
    data: { file_path: 'src/app.js', model: 'gpt-x', code_snippet: 'export {}', prompt_preview: 'secret prompt' },
    metadata: { full_prompt: 'secret prompt in full', user_id: userId, repo: 'me/app' },
  };
}

describe('provenance routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-owned', role: 'member' });
  });

  afterAll(() => {
    process.env = envSnapshot;
  });

  test('lists only the authorized workspace and shows the viewer their own prompt', async () => {
    query.mockResolvedValueOnce({ rows: [row('7')] });
    const response = await request(app())
      .get('/api/operational-intelligence/provenance')
      .query({ workspaceId: 'workspace-owned' });

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/workspace_id = \$1[\s\S]*artifact_type = 'ai_provenance'/),
      ['workspace-owned', 50]
    );
    expect(response.body[0].metadata.full_prompt).toBe('secret prompt in full');
    expect(response.body[0].metadata.prompt_visible).toBe(true);
  });

  test("hides another member's prompt but keeps the code and who wrote it", async () => {
    query.mockResolvedValueOnce({ rows: [row('99')] });
    const response = await request(app())
      .get('/api/operational-intelligence/provenance')
      .query({ workspaceId: 'workspace-owned' });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('secret prompt');
    expect(response.body[0].data.code_snippet).toBe('export {}');
    expect(response.body[0].metadata.prompt_length).toBe('secret prompt in full'.length);
  });

  test('loads one record with its events, constrained to the workspace', async () => {
    query
      .mockResolvedValueOnce({ rows: [row('7')] })
      .mockResolvedValueOnce({ rows: [{ id: 'e1', event_type: 'agent.code_generation', actor_id: 'atlas' }] });
    const response = await request(app())
      .get(`/api/operational-intelligence/provenance/${RECORD_ID}`)
      .query({ workspaceId: 'workspace-owned' });

    expect(response.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([RECORD_ID, 'workspace-owned']);
    expect(query.mock.calls[1][1]).toEqual([RECORD_ID, 'workspace-owned']);
    expect(response.body.events).toHaveLength(1);
  });

  test('rejects a malformed id without querying', async () => {
    const response = await request(app())
      .get('/api/operational-intelligence/provenance/not-a-uuid')
      .query({ workspaceId: 'workspace-owned' });
    expect(response.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  test('recordProvenance writes nothing without an authorized workspace', async () => {
    const id = await recordProvenance({ workspace_id: null, agent_id: 'atlas', prompt: 'p', model: 'm', code_snippet: 'x', file_path: 'a.js' });
    expect(id).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  test('recordProvenance stores the workspace and requesting user', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] }).mockResolvedValueOnce({ rows: [] });
    await recordProvenance({ workspace_id: 'workspace-owned', user_id: 7, agent_id: 'atlas', prompt: [{ type: 'text', text: 'hi' }], model: 'm', code_snippet: 'x', file_path: 'a.js' });
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe('workspace-owned');
    expect(params[4]).toEqual(expect.objectContaining({ user_id: '7', full_prompt: JSON.stringify([{ type: 'text', text: 'hi' }]) }));
  });
});
