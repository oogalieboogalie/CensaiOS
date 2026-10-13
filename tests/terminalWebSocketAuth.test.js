import { jest } from '@jest/globals';
import http from 'http';
import { WebSocket } from 'ws';
import { attachTerminalServer } from '../server/terminal/sessions.js';
import { sessions } from '../server/terminal/shared.js';

function fakeBackend() {
  return {
    label: 'Fake sandbox', isSandbox: true, shell: 'bash',
    proc: {
      pid: 123,
      onData: jest.fn(), onExit: jest.fn(), write: jest.fn(), resize: jest.fn(), kill: jest.fn(),
    },
  };
}

function rejectionStatus(address, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/terminal?workspaceId=workspace-a`, { headers });
    const timer = setTimeout(() => reject(new Error('upgrade rejection timed out')), 2000);
    ws.on('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      resolve(response.statusCode);
    });
    ws.on('error', () => {});
  });
}

function connect(address, userId) {
  const ws = new WebSocket(
    `ws://127.0.0.1:${address.port}/api/terminal?workspaceId=workspace-a&sessionId=window-1`,
    { headers: { 'x-test-user': userId } },
  );
  const meta = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('terminal metadata timed out')), 2000);
    ws.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'meta') { clearTimeout(timer); resolve(message); }
    });
    ws.on('error', reject);
  });
  return { ws, meta };
}

describe('terminal WebSocket authentication', () => {
  let server;
  let wss;
  let address;

  afterEach(async () => {
    for (const client of wss?.clients || []) client.terminate();
    await new Promise(resolve => setImmediate(resolve));
    for (const session of sessions.values()) {
      if (session.reapTimer) clearTimeout(session.reapTimer);
      session.pty.kill();
    }
    sessions.clear();
    await new Promise(resolve => server?.close(() => resolve()));
  });

  test('rejects missing authentication before authorization or backend start', async () => {
    const authorize = jest.fn();
    const startBackend = jest.fn();
    server = http.createServer();
    wss = attachTerminalServer(server, { authenticate: async () => null, authorize, startBackend });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    address = server.address();
    await expect(rejectionStatus(address)).resolves.toBe(401);
    expect(authorize).not.toHaveBeenCalled();
    expect(startBackend).not.toHaveBeenCalled();
  });

  test('rejects workspace denial before backend start', async () => {
    const startBackend = jest.fn();
    server = http.createServer();
    wss = attachTerminalServer(server, {
      authenticate: async () => ({ userId: '7' }),
      authorize: async () => { throw Object.assign(new Error('denied'), { statusCode: 403 }); },
      startBackend,
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    address = server.address();
    await expect(rejectionStatus(address)).resolves.toBe(403);
    expect(startBackend).not.toHaveBeenCalled();
  });

  test('isolates identical client session ids by authenticated actor', async () => {
    const startBackend = jest.fn(async () => fakeBackend());
    server = http.createServer();
    wss = attachTerminalServer(server, {
      authenticate: async request => ({ userId: request.headers['x-test-user'] }),
      authorize: async (_url, actor) => ({
        userId: actor.userId, workspaceId: 'workspace-a', role: 'member',
      }),
      startBackend,
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    address = server.address();
    const first = connect(address, '7');
    const second = connect(address, '8');
    await expect(Promise.all([first.meta, second.meta])).resolves.toHaveLength(2);
    expect(startBackend).toHaveBeenCalledTimes(2);
    expect(sessions.size).toBe(2);
    first.ws.close();
    second.ws.close();
  });
});
