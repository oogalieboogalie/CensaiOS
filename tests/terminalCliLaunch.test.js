import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { WebSocket } from 'ws';
import { attachTerminalServer } from '../server/terminal/sessions.js';
import { sessions } from '../server/terminal/shared.js';
import { startCliBackend, terminalCliAdapter, interactiveCliEnv, cliCredentialFor, privateHome } from '../server/terminal/cliBackend.js';
import { getAdapter } from '../server/cli-agents/adapters/index.js';
import { resolveCliKey } from '../server/cli-agents/index.js';

// A stand-in "Claude Code": prints a line, echoes one line of input, exits.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-cli-term-'));
const standIn = path.join(dir, 'standin.mjs');
fs.writeFileSync(standIn, [
  "process.stdout.write(`stand-in ready TERM=${process.env.TERM} SECRET=${process.env.SESSION_SECRET || 'none'}\\r\\n`);",
  "process.stdin.once('data', (d) => { process.stdout.write(`got ${String(d).trim()}\\r\\n`); process.exit(0); });",
].join('\n'));
const home = path.join(dir, 'home');
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{}');

const owners = path.join(dir, 'login-owners.json');
const env = { PATH: process.env.PATH, CENSAI_CLI_CLAUDECODE_BIN: standIn, CENSAI_CLI_AGENT_HOME: home, CENSAI_CLI_AGENT_DATA: path.join(dir, 'data'), CENSAI_CLI_LOGIN_OWNERS_FILE: owners, SESSION_SECRET: 'do-not-leak-1234' };

describe('terminal that opens into a coding CLI', () => {
  test('only known CLI ids are accepted', () => {
    expect(terminalCliAdapter('claudecode').id).toBe('claudecode');
    expect(terminalCliAdapter('COPILOT').id).toBe('copilot');
    expect(terminalCliAdapter('rm -rf /')).toBeNull();
    expect(terminalCliAdapter('')).toBeNull();
  });

  test('interactive env is the agent allowlist with colors on', () => {
    const out = interactiveCliEnv({ adapter: getAdapter('claudecode'), env });
    expect(out.TERM).toBe('xterm-256color');
    expect(out.NO_COLOR).toBeUndefined();
    expect(out.CI).toBeUndefined();
    expect(out.SESSION_SECRET).toBeUndefined();
    expect(out.HOME).toBe(home);
  });

  test('spawns the resolved CLI binary, never a client command', async () => {
    const spawn = jest.fn(() => ({ pid: 1 }));
    const backend = await startCliBackend({ cli: 'claudecode', cwd: dir, size: { cols: 80, rows: 24 }, userId: '7', env, spawn });
    expect(backend.cli).toBe('claudecode');
    expect(backend.label).toBe('Claude Code');
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([standIn]);
    expect(options.cwd).toBe(dir);
    expect(options.env.SESSION_SECRET).toBeUndefined();
  });

  test('a CLI sign-in stays with its owner; others need their own key, in a private home', async () => {
    const adapter = getAdapter('claudecode');
    fs.rmSync(owners, { force: true });
    expect(await cliCredentialFor(adapter, '1', env)).toEqual({ key: null, home });
    expect(await cliCredentialFor(adapter, '1', env)).toEqual({ key: null, home });
    await expect(cliCredentialFor(adapter, '2', env)).rejects.toThrow(/another person's Anthropic account/);
    // Their own vault key: a private home, never the owner's sign-in.
    const own = async ({ adapter: a, userId }) => resolveCliKey({ adapter: a, userId }, { mayUse: async () => false, vault: async () => ({ apiKey: 'sk-ant-api-teammate-key' }) });
    const teammate = await cliCredentialFor(adapter, '2', env, own);
    expect(teammate).toEqual({ key: 'sk-ant-api-teammate-key', home: privateHome('2', env) });
    expect(teammate.home).not.toBe(home);
    // The computer's .env key is the owner's: a teammate without sharing is still refused.
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api-owner-env-key';
    try {
      // (personalHome here only skips resolveCliKey's own claim on the real owners file.)
      const envOnly = async ({ adapter: a, userId }) => resolveCliKey({ adapter: { ...a, personalHome: true }, userId }, { mayUse: async () => false, vault: async () => null });
      await expect(cliCredentialFor(adapter, '2', env, envOnly)).rejects.toThrow(/another person's Anthropic account/);
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
    }
    fs.rmSync(owners, { force: true });
  });

  test('unknown CLI is refused', async () => {
    await expect(startCliBackend({ cli: 'evil', cwd: dir, size: { cols: 80, rows: 24 } })).rejects.toThrow(/Unknown coding CLI/);
  });
});

describe('cli terminal over the websocket', () => {
  let server;
  let wss;
  const saved = {};

  beforeAll(() => {
    for (const [k, v] of Object.entries({ CENSAI_CLI_CLAUDECODE_BIN: standIn, CENSAI_CLI_AGENT_HOME: home, CENSAI_CLI_LOGIN_OWNERS_FILE: owners, SESSION_SECRET: 'do-not-leak-1234' })) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    for (const client of wss?.clients || []) client.terminate();
    for (const session of sessions.values()) {
      if (session.reapTimer) clearTimeout(session.reapTimer);
      try { session.pty.kill(); } catch { /* gone */ }
    }
    sessions.clear();
    await new Promise((resolve) => server?.close(() => resolve()));
  });

  test('?cli=claudecode runs the CLI in a real terminal, not a shell', async () => {
    const startBackend = jest.fn(async () => { throw new Error('should not start a shell'); });
    server = http.createServer();
    wss = attachTerminalServer(server, {
      authenticate: async () => ({ userId: '7' }),
      authorize: async (_url, actor) => ({ userId: actor.userId, workspaceId: 'ws-a', role: 'member' }),
      startBackend,
    });
    const address = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address())));
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/terminal?workspaceId=ws-a&sessionId=w1&cli=claudecode&cwd=${encodeURIComponent(dir)}`);
    const seen = [];
    let meta = null;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out: ${seen.join('')}`)), 8000);
      ws.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'meta') meta = message;
        if (message.type === 'output') seen.push(message.data);
        const text = seen.join('');
        if (text.includes('stand-in ready') && !text.includes('got')) ws.send(JSON.stringify({ type: 'input', data: 'hello\r' }));
        if (message.type === 'exit') { clearTimeout(timer); resolve(); }
      });
      ws.on('error', reject);
    });
    const text = seen.join('');
    expect(meta).toMatchObject({ cli: 'claudecode', backend: 'Claude Code' });
    expect(text).toContain('TERM=xterm-256color');
    expect(text).toContain('SECRET=none');
    expect(text).toContain('got hello');
    expect(startBackend).not.toHaveBeenCalled();
  });
});
