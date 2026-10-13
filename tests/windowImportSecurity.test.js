import { jest } from '@jest/globals';
import request from 'supertest';

const callModel = jest.fn();

jest.unstable_mockModule('../server/aiGateway/callModel.js', () => ({
  callModel,
}));

const { default: express } = await import('express');
const { windowImportRouter } = await import('../server/routes/windowImport.js');
const {
  requireFeatureFlag,
  requireLocalFilesystem,
} = await import('../server/middleware/runtimeMode.js');

const envSnapshot = { ...process.env };

function createApp({ session = { userRole: 'user' } } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (session) req.session = session;
    next();
  });
  // Mirror the production mount shape in server/boot/routers.js: the
  // local-filesystem + window-import guards AND the router must be on the
  // same /api/windows prefix. If a future maintainer splits them, the
  // windowImportMountContract test will fail.
  app.use(
    '/api/windows',
    requireLocalFilesystem,
    requireFeatureFlag('window-import'),
    windowImportRouter
  );
  return app;
}

describe('window import security boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...envSnapshot,
      HOMEBASE_MODE: 'local_desktop',
      CENSAI_FEATURE_WINDOW_IMPORT: 'true',
    };
  });

  afterAll(() => {
    process.env = envSnapshot;
  });

  test('blocks the entire route in cloud mode', async () => {
    process.env.HOMEBASE_MODE = 'cloud_saas';

    const response = await request(createApp())
      .post('/api/windows/import')
      .send({ rawJsx: 'export function Example() { return <div>Example</div>; }' });

    expect(response.status).toBe(403);
    expect(callModel).not.toHaveBeenCalled();
  });

  test('blocks /api/windows/sync in cloud mode', async () => {
    process.env.HOMEBASE_MODE = 'cloud_saas';

    const response = await request(createApp()).post('/api/windows/sync').send({});

    expect(response.status).toBe(403);
  });

  test('blocks /api/windows/list-importable in cloud mode', async () => {
    process.env.HOMEBASE_MODE = 'cloud_saas';

    const response = await request(createApp()).get('/api/windows/list-importable');

    expect(response.status).toBe(403);
  });

  test('requires the window import feature flag', async () => {
    process.env.CENSAI_FEATURE_WINDOW_IMPORT = 'false';

    const response = await request(createApp())
      .post('/api/windows/import')
      .send({ rawJsx: 'export function Example() { return <div>Example</div>; }' });

    expect(response.status).toBe(404);
    expect(callModel).not.toHaveBeenCalled();
  });

  test('dry_run validates generated output without writing or syncing', async () => {
    callModel.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            kind: 'example',
            label: 'Example',
            jsx: 'export function ExampleWindow() { return <div>Example</div>; }',
            css: '.example { color: var(--ink); }',
            defaultSize: { w: 420, h: 320 },
          }),
        },
      }],
    });

    const response = await request(createApp())
      .post('/api/windows/import')
      .send({
        dry_run: true,
        rawJsx: 'export function Example() { return <div>Example</div>; }',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      ok: true,
      dryRun: true,
      kind: 'example',
      componentName: 'ExampleWindow',
    }));
  });

  test.each([
    ['fs', "import fs from 'fs';"],
    ['child_process', "import child_process from 'child_process';"],
    ['eval', "const result = eval('2 + 2');"],
    ['new-function', "const run = new Function('return 1');"],
    ['import-http', "const remote = import('https://example.com/module.js');"],
  ])('rejects generated %s code before writes', async (code, generatedLine) => {
    callModel.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            kind: 'unsafe',
            label: 'Unsafe',
            jsx: `${generatedLine}\nexport function UnsafeWindow() { return <div>Unsafe</div>; }`,
            css: '',
          }),
        },
      }],
    });

    const response = await request(createApp())
      .post('/api/windows/import')
      .send({
        dry_run: true,
        rawJsx: 'export function Example() { return <div>Example</div>; }',
      });

    expect(response.status).toBe(422);
    expect(response.body.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
  });

  // P1-2 capability split: dry-run needs window.import.validate (user-OK),
  // real writes need window.import.write (admin-only).
  test('role=user can dry-run via window.import.validate (200)', async () => {
    callModel.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            kind: 'example',
            label: 'Example',
            jsx: 'export function ExampleWindow() { return <div>Example</div>; }',
            css: '.example { color: var(--ink); }',
            defaultSize: { w: 420, h: 320 },
          }),
        },
      }],
    });

    const response = await request(createApp({ session: { userRole: 'user' } }))
      .post('/api/windows/import')
      .send({
        dry_run: true,
        rawJsx: 'export function Example() { return <div>Example</div>; }',
      });

    expect(response.status).toBe(200);
    expect(response.body.dryRun).toBe(true);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  test('role=user cannot persist via window.import.write (403)', async () => {
    const response = await request(createApp({ session: { userRole: 'user' } }))
      .post('/api/windows/import')
      .send({
        dry_run: false,
        rawJsx: 'export function Example() { return <div>Example</div>; }',
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(expect.objectContaining({
      ok: false,
      code: 'CAPABILITY_DENIED',
      error: 'Missing required capability: window.import.write',
    }));
    // The write path must short-circuit BEFORE invoking the LLM — otherwise
    // we waste a model call and risk exposing admin-only mutation code paths.
    expect(callModel).not.toHaveBeenCalled();
  });
});
