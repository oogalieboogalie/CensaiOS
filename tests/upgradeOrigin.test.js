import { jest } from '@jest/globals';
import http from 'node:http';
import { WebSocket } from 'ws';
import { attachTerminalServer } from '../server/terminal/sessions.js';
import { attachAgentRegistryWs, WS_PATH } from '../server/ws/agentRegistry.js';
import {
  attachWorkspaceCollaborationWs,
  WORKSPACE_COLLABORATION_PATH,
} from '../server/ws/workspaceCollaboration.js';
import { attachHocuspocusWs, HOCUSPOCUS_PATH } from '../server/collab/hocuspocus.js';
import { sessions } from '../server/terminal/shared.js';

const APP_ORIGIN = 'http://localhost:5173';
const FOREIGN_ORIGIN = 'http://localhost:49999';

function memberDb() {
  return {
    query: async (_sql, [workspaceId]) => ({
      rows: [{ id: workspaceId, name: workspaceId, role: 'owner' }],
    }),
  };
}

function upgradeResult(port, path, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch { /* already closed */ }
      resolve('timeout');
    }, 1500);
    ws.once('open', () => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      resolve('open');
    });
    ws.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      resolve(response.statusCode);
    });
    ws.once('error', () => {});
  });
}

async function listen(setup) {
  const server = http.createServer();
  const spies = setup(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, spies };
}

function fakeBackend() {
  return {
    label: 'Fake sandbox', isSandbox: true, shell: 'bash',
    proc: {
      pid: 123,
      onData: jest.fn(), onExit: jest.fn(), write: jest.fn(), resize: jest.fn(), kill: jest.fn(),
    },
  };
}

function clearTerminalSessions() {
  for (const session of sessions.values()) {
    if (session.reapTimer) clearTimeout(session.reapTimer);
    try { session.pty.kill(); } catch { /* already gone */ }
  }
  sessions.clear();
}

const paths = [
  ['terminal', '/api/terminal?workspaceId=user-1-default', (server, authenticate) => {
    const authorize = jest.fn(async () => ({ userId: '1', workspaceId: 'user-1-default', role: 'owner' }));
    const startBackend = jest.fn(async () => fakeBackend());
    attachTerminalServer(server, { authenticate, authorize, startBackend });
    return { authenticate, authorize, startBackend };
  }],
  ['agent registry', WS_PATH, (server, authenticate) => {
    attachAgentRegistryWs(server, { authenticate });
    return { authenticate };
  }],
  ['workspace collaboration', `${WORKSPACE_COLLABORATION_PATH}?workspaceId=board-1&clientId=tab-1`, (server, authenticate) => {
    attachWorkspaceCollaborationWs(server, { authenticate, db: memberDb() });
    return { authenticate };
  }],
  ['hocuspocus', `${HOCUSPOCUS_PATH}?workspaceId=board-1`, (server, authenticate) => {
    attachHocuspocusWs(server, { authenticate, db: memberDb(), hocuspocus: { handleConnection() {} } });
    return { authenticate };
  }],
];

describe('WebSocket upgrades require this app origin', () => {
  const saved = {};

  beforeEach(() => {
    saved.NODE_ENV = process.env.NODE_ENV;
    saved.APP_ORIGIN = process.env.APP_ORIGIN;
    // Leave the Jest shortcut so a missing Origin is not waved through.
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = APP_ORIGIN;
  });

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.APP_ORIGIN === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = saved.APP_ORIGIN;
  });

  test.each(paths)('%s refuses a foreign localhost Origin before auth', async (_name, path, setup) => {
    const authenticate = jest.fn(async () => ({ userId: '1' }));
    const { server, port, spies } = await listen((httpServer) => setup(httpServer, authenticate));
    try {
      await expect(upgradeResult(port, path, { origin: FOREIGN_ORIGIN })).resolves.toBe(403);
      expect(authenticate).not.toHaveBeenCalled();
      if (spies.authorize) expect(spies.authorize).not.toHaveBeenCalled();
      if (spies.startBackend) expect(spies.startBackend).not.toHaveBeenCalled();
    } finally {
      clearTerminalSessions();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test.each(paths)('%s refuses an upgrade with no Origin', async (_name, path, setup) => {
    const authenticate = jest.fn(async () => ({ userId: '1' }));
    const { server, port } = await listen((httpServer) => setup(httpServer, authenticate));
    try {
      await expect(upgradeResult(port, path, {})).resolves.toBe(403);
      expect(authenticate).not.toHaveBeenCalled();
    } finally {
      clearTerminalSessions();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test.each(paths)('%s still accepts the app origin', async (_name, path, setup) => {
    const authenticate = jest.fn(async () => ({ userId: '1' }));
    const { server, port } = await listen((httpServer) => setup(httpServer, authenticate));
    try {
      const status = await upgradeResult(port, path, { origin: APP_ORIGIN });
      expect(authenticate).toHaveBeenCalled();
      expect(status).not.toBe(403);
    } finally {
      clearTerminalSessions();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test.each([
    'http://127.0.0.1:3002',
    'http://[::1]:3002',
  ])('terminal accepts loopback twin %s when the server origin is localhost:3002', async (origin) => {
    process.env.APP_ORIGIN = 'http://localhost:3002';
    const [, path, setup] = paths[0];
    const authenticate = jest.fn(async () => ({ userId: '1' }));
    const { server, port } = await listen((httpServer) => setup(httpServer, authenticate));
    try {
      const status = await upgradeResult(port, path, { origin });
      expect(authenticate).toHaveBeenCalled();
      expect(status).toBe('open');
    } finally {
      clearTerminalSessions();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
