import { jest } from '@jest/globals';
import http from 'http';
import { WebSocket } from 'ws';
import { RUNTIME_MODES } from '../server/middleware/runtimeMode.js';
import { attachTerminalServer } from '../server/terminal/sessions.js';
import { OWNER_ONLY_HERE, OWNER_ONLY_REMOTE } from '../server/terminal/access.js';
import { markThroughDoor } from '../server/webOs/door.js';

// Pretend people: Sam (8) is signed in and a member of the board, but the
// users table says Sam isn't this computer's owner.
const fakeDb = (userRole) => ({ query: jest.fn(async (sql) => (
  sql.startsWith('SELECT role FROM users')
    ? { rows: [{ role: userRole }] }
    : { rows: [{ id: 'workspace-a', role: 'member' }] }
)) });

function firstWords(address) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/terminal?workspaceId=workspace-a&sessionId=w1`);
    const timer = setTimeout(() => reject(new Error('no answer from the terminal')), 2000);
    let message = null;
    ws.on('message', (raw) => { message = JSON.parse(raw.toString()); });
    ws.on('close', (code) => { clearTimeout(timer); resolve({ message, code }); });
    ws.on('unexpected-response', (_req, res) => { clearTimeout(timer); res.resume(); resolve({ status: res.statusCode }); });
    ws.on('error', () => {});
  });
}

describe("terminal refusal for someone who isn't this computer's owner", () => {
  let server;
  afterEach(async () => { await new Promise((resolve) => server?.close(() => resolve())); });

  async function start(role, { throughDoor = false } = {}) {
    const startBackend = jest.fn();
    server = http.createServer();
    if (throughDoor) server.on('connection', markThroughDoor);
    attachTerminalServer(server, {
      authenticate: async () => ({ userId: '8' }),
      db: fakeDb(role),
      mode: RUNTIME_MODES.LOCAL_DESKTOP,
      env: {},
      startBackend,
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { address: server.address(), startBackend };
  }

  test('on this computer: says why in plain words, closes, and never starts a shell', async () => {
    const { address, startBackend } = await start('user');
    const answer = await firstWords(address);
    expect(answer.message).toEqual({ type: 'refused', reason: 'owner-only', message: OWNER_ONLY_HERE });
    expect(answer.code).toBe(4403);
    expect(startBackend).not.toHaveBeenCalled();
  });

  test('a member who joined from another computer is still refused, with no shell', async () => {
    const { address, startBackend } = await start('user', { throughDoor: true });
    const answer = await firstWords(address);
    expect(answer.message).toEqual({ type: 'refused', reason: 'owner-only', message: OWNER_ONLY_REMOTE });
    expect(answer.code).toBe(4403);
    expect(startBackend).not.toHaveBeenCalled();
  });

  test('signed out is still a plain refused upgrade', async () => {
    const startBackend = jest.fn();
    server = http.createServer();
    attachTerminalServer(server, { authenticate: async () => null, startBackend });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await expect(firstWords(server.address())).resolves.toEqual({ status: 401 });
    expect(startBackend).not.toHaveBeenCalled();
  });
});
