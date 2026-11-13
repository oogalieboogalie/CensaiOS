import { jest } from '@jest/globals';
import request from 'supertest';

// A teammate's check-only window import must pay with their own key: the AI
// call carries who asked (their user and workspace), never nothing.
const callModel = jest.fn();
const resolveImportScope = jest.fn();

jest.unstable_mockModule('../server/aiGateway/callModel.js', () => ({ callModel }));
jest.unstable_mockModule('../server/window-import/importScope.js', () => ({ resolveImportScope }));

const { default: express } = await import('express');
const { windowImportRouter } = await import('../server/routes/windowImport.js');
const { requireFeatureFlag, requireLocalFilesystem } = await import('../server/middleware/runtimeMode.js');

const envSnapshot = { ...process.env };
const RAW = 'export function Example() { return <div>Example</div>; }';
const ANSWER = {
  choices: [{
    message: {
      content: JSON.stringify({
        kind: 'example',
        label: 'Example',
        jsx: 'export function ExampleWindow() { return <div>Example</div>; }',
        css: '.example { color: var(--ink); }',
      }),
    },
  }],
};

function createApp(session) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (session) req.session = session; next(); });
  app.use('/api/windows', requireLocalFilesystem, requireFeatureFlag('window-import'), windowImportRouter);
  return app;
}

describe('window import uses the asking person\'s key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...envSnapshot, HOMEBASE_MODE: 'local_desktop', CENSAI_FEATURE_WINDOW_IMPORT: 'true' };
    resolveImportScope.mockImplementation(async (req) => ({
      userId: req.session.userId, workspaceId: 'ws-pat', role: 'member',
    }));
    callModel.mockResolvedValue(ANSWER);
  });

  afterAll(() => { process.env = envSnapshot; });

  test('a regular teammate\'s check-only import carries their who-asked context', async () => {
    const res = await request(createApp({ userId: 'user-pat', userRole: 'user' }))
      .post('/api/windows/import')
      .send({ dry_run: true, rawJsx: RAW });

    expect(res.status).toBe(200);
    expect(callModel).toHaveBeenCalledTimes(1);
    const call = callModel.mock.calls[0][0];
    expect(call.accessContext).toEqual(expect.objectContaining({
      userId: 'user-pat', workspaceId: 'ws-pat', source: 'window-import',
    }));
    expect(call.usageAttribution).toEqual({
      workspaceId: 'ws-pat', actor: { kind: 'user', id: 'user-pat' }, source: 'window-import',
    });
  });

  test('nobody signed in: refused before any AI call', async () => {
    const res = await request(createApp({ userRole: 'user' }))
      .post('/api/windows/import')
      .send({ dry_run: true, rawJsx: RAW });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SIGN_IN_REQUIRED');
    expect(callModel).not.toHaveBeenCalled();
  });

  test('not a member of the workspace: refused with no raw error text', async () => {
    resolveImportScope.mockRejectedValue(Object.assign(new Error('secret db detail'), { statusCode: 403, code: 'WORKSPACE_FORBIDDEN' }));
    const res = await request(createApp({ userId: 'user-pat', userRole: 'user' }))
      .post('/api/windows/import')
      .send({ dry_run: true, rawJsx: RAW, workspaceId: 'ws-other' });

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('secret db detail');
    expect(callModel).not.toHaveBeenCalled();
  });

  test('a database hiccup gives a short message, not the raw error', async () => {
    resolveImportScope.mockRejectedValue(new Error('connection refused at 10.0.0.5'));
    const res = await request(createApp({ userId: 'user-pat', userRole: 'user' }))
      .post('/api/windows/import')
      .send({ dry_run: true, rawJsx: RAW });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CALLER_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    expect(callModel).not.toHaveBeenCalled();
  });
});
