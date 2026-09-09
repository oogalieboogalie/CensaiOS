import { jest } from '@jest/globals';
import request from 'supertest';

const mockPool = { query: jest.fn(), connect: jest.fn() };
const createRun = jest.fn();
const startRun = jest.fn();
const completeRun = jest.fn();
const failRun = jest.fn();
const attachArtifactToRun = jest.fn();
const executeCommand = jest.fn();
const listCommands = jest.fn();
const recordCommandAudit = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({
  createRun,
  startRun,
  completeRun,
  failRun,
  attachArtifactToRun,
}));
jest.unstable_mockModule('../server/commands/registry.js', () => ({
  executeCommand,
  listCommands,
}));
jest.unstable_mockModule('../server/commands/audit.js', () => ({
  recordCommandAudit,
}));

const { default: express } = await import('express');
const { commandsRouter } = await import('../server/routes/commands.js');

const command = {
  id: 'demo.command',
  requiredCapabilities: ['demo.run'],
  sideEffects: ['demo.write'],
};

function createApp({
  session = { userId: 'u-1', userRole: 'admin' },
  workspaceContext = { tenantId: 'tenant-1', workspaceId: 'workspace-1' },
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    req.workspaceContext = workspaceContext;
    next();
  });
  app.use('/api', commandsRouter);
  return app;
}

describe('command route execution ledger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HOMEBASE_MODE = 'private_server';
    createRun.mockResolvedValue({ runId: 'run-1' });
    startRun.mockResolvedValue(undefined);
    completeRun.mockResolvedValue(undefined);
    failRun.mockResolvedValue(undefined);
    attachArtifactToRun.mockResolvedValue({ artifactId: 'artifact-1' });
    listCommands.mockReturnValue([command]);
    recordCommandAudit.mockResolvedValue({ id: 'event-1' });
  });

  test('creates, starts, completes, and returns a command run on success', async () => {
    executeCommand.mockResolvedValue({ command, result: { wrote: true } });

    const response = await request(createApp())
      .post('/api/commands/demo.command/execute')
      .send({ value: 42 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      runId: 'run-1',
      result: { wrote: true },
      auditEventId: 'event-1',
    });
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      db: mockPool,
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
      actor: { kind: 'user', id: 'u-1' },
      principal: 'admin',
      runtimeMode: 'private_server',
      metadata: { kind: 'command', commandId: 'demo.command' },
      cause: expect.objectContaining({
        kind: 'user_dispatch',
        userDispatchRef: expect.stringMatching(/^command:u-1:demo\.command:/),
      }),
    }));
    expect(startRun).toHaveBeenCalledWith({ db: mockPool, runId: 'run-1' });
    expect(attachArtifactToRun).toHaveBeenCalledWith(expect.objectContaining({
      db: mockPool,
      runId: 'run-1',
      kind: 'command.audit_event',
      ref: 'event-1',
      metadata: { commandId: 'demo.command', status: 'ok' },
    }));
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      db: mockPool,
      runId: 'run-1',
      metadata: { commandId: 'demo.command', auditEventId: 'event-1' },
    }));
    expect(failRun).not.toHaveBeenCalled();
  });

  test('fails and returns runId when handler execution fails after run creation', async () => {
    const error = new Error('boom');
    error.code = 'DEMO_FAILED';
    error.statusCode = 409;
    executeCommand.mockRejectedValue(error);

    const response = await request(createApp())
      .post('/api/commands/demo.command/execute')
      .send({ value: 42 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      runId: 'run-1',
      commandId: 'demo.command',
      code: 'DEMO_FAILED',
      error: 'boom',
      auditEventId: 'event-1',
    });
    expect(failRun).toHaveBeenCalledWith({ db: mockPool, runId: 'run-1', error });
    expect(completeRun).not.toHaveBeenCalled();
    expect(attachArtifactToRun).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { commandId: 'demo.command', status: 'error' },
    }));
  });

  test('does not execute command side effects when run creation fails', async () => {
    createRun.mockRejectedValue(new Error('runs unavailable'));

    const response = await request(createApp())
      .post('/api/commands/demo.command/execute')
      .send({ value: 42 });

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      ok: false,
      runId: null,
      commandId: 'demo.command',
      code: 'RUN_CREATE_FAILED',
      error: 'runs unavailable',
      auditEventId: null,
    });
    expect(startRun).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
    expect(recordCommandAudit).not.toHaveBeenCalled();
  });
});
