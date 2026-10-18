import http from 'http';
import { WebSocket } from 'ws';
import { attachTerminalServer } from '../server/terminal/sessions.js';
import { sessions } from '../server/terminal/shared.js';
import { openTerminalSocket } from '../src/components/terminal/terminalSocket.js';

// A terminal whose shell can't start (Docker off for an agent run, a coding
// CLI that isn't installed) used to reconnect forever: every half second it
// tried again and printed the same error under "Connection lost". The server
// now says the start failed, so the window stops and waits for Enter.

let server;
let wss;
let starts;

beforeEach(async () => {
  starts = 0;
  server = http.createServer();
  wss = attachTerminalServer(server, {
    authenticate: async () => ({ userId: '7' }),
    authorize: async (_url, actor) => ({ userId: actor.userId, workspaceId: 'ws-a', role: 'owner' }),
    startBackend: async () => { starts += 1; throw new Error('Start Docker Desktop and retry.'); },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  for (const client of wss.clients) client.terminate();
  sessions.clear();
  await new Promise((resolve) => server.close(resolve));
});

test('a shell that cannot start ends the terminal instead of retrying forever', async () => {
  const { port } = server.address();
  const seen = { drops: 0, exits: 0, text: '' };
  const link = openTerminalSocket(`ws://127.0.0.1:${port}/api/terminal?sessionId=t1&workspaceId=ws-a`, {
    onMessage: (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'output') seen.text += message.data;
    },
    onDrop: () => { seen.drops += 1; },
    onExit: () => { seen.exits += 1; },
  }, { WebSocketImpl: WebSocket, win: null });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  link.close();
  expect(seen.text).toContain('Failed to start a terminal: Start Docker Desktop and retry.');
  expect(seen.exits).toBe(1);
  expect(seen.drops).toBe(0);
  expect(starts).toBe(1);
});
