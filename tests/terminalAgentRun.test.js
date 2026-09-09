import { jest } from '@jest/globals';
import http from 'http';
import { WebSocket } from 'ws';
import { attachTerminalServer } from '../server/terminal/sessions.js';
import { sessions } from '../server/terminal/shared.js';
import { startAgentBackend } from '../server/terminal/backends.js';
import { sandboxAgentArgv } from '../server/sandbox/execution.js';

describe('headless opencode argv', () => {
  test('prompt travels as a single argv element with a pinned model', () => {
    expect(sandboxAgentArgv('sbx-1', 'fix the login bug')).toEqual([
      'exec', '-it', '-w', '/workspace', 'sbx-1', 'opencode', 'run',
      '--model', 'opencode/muse-spark-1.3-contributor-free', 'fix the login bug',
    ]);
  });

  test('model override wins over the default', () => {
    const argv = sandboxAgentArgv('sbx-1', 'hi', { model: 'custom/model' });
    expect(argv).toContain('--model');
    expect(argv[argv.indexOf('--model') + 1]).toBe('custom/model');
  });

  test('rejects empty and oversized prompts before touching docker', () => {
    expect(() => sandboxAgentArgv('sbx-1', '   ')).toThrow(/non-empty prompt/);
    expect(() => sandboxAgentArgv('sbx-1', 'x'.repeat(4001))).toThrow(/exceeds 4000/);
  });
});

describe('agent backend validation', () => {
  test('requires a project folder without touching docker', async () => {
    await expect(startAgentBackend('', 'do things', {})).rejects.toThrow(/project folder/);
  });
});

describe('agent websocket upgrades', () => {
  let server;
  let wss;
  let address;

  afterEach(async () => {
    for (const client of wss?.clients || []) client.terminate();
    await new Promise(resolve => setImmediate(resolve));
    for (const session of sessions.values()) {
      if (session.reapTimer) clearTimeout(session.reapTimer);
      try { session.pty.kill(); } catch { /* already gone */ }
    }
    sessions.clear();
    await new Promise(resolve => server?.close(() => resolve()));
  });

  function serve() {
    const startBackend = jest.fn(async () => {
      throw new Error('should not start a shell for agent upgrades');
    });
    server = http.createServer();
    wss = attachTerminalServer(server, {
      authenticate: async () => ({ userId: '7' }),
      authorize: async (_url, actor) => ({
        userId: actor.userId, workspaceId: 'workspace-a', role: 'member',
      }),
      startBackend,
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address())));
  }

  function agentError(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error('agent error timed out')), 2000);
      ws.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'error') {
          clearTimeout(timer);
          resolve(message.reason);
          ws.close();
        }
      });
      ws.on('error', () => {});
    });
  }

  test('rejects unknown agent kinds before backend start', async () => {
    address = await serve();
    const reason = await agentError(
      `ws://127.0.0.1:${address.port}/api/terminal?workspaceId=workspace-a&agent=evil&prompt=hi`,
    );
    expect(reason).toMatch(/agent=opencode/);
    expect(sessions.size).toBe(0);
  });

  test('rejects agent upgrades without a prompt', async () => {
    address = await serve();
    const reason = await agentError(
      `ws://127.0.0.1:${address.port}/api/terminal?workspaceId=workspace-a&agent=opencode`,
    );
    expect(reason).toMatch(/non-empty prompt/);
    expect(sessions.size).toBe(0);
  });
});
