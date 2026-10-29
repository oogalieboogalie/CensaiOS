import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { grok } from '../server/cli-agents/adapters/grok.js';
import { personalHomeDir, personalHomeEnv, personalSignedIn } from '../server/cli-agents/personalHome.js';
import { buildAgentEnv } from '../server/cli-agents/env.js';
import { grokChatArgs, grokPrompt, runGrokChat } from '../server/grokSignin/chatRun.js';
import { startGrokLogin, grokLogout } from '../server/grokSignin/login.js';

const STANDIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cli-agents', 'standin-grok.mjs');

describe('Grok chat on your own Grok sign-in', () => {
  let dir;
  let env;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-signin-'));
    env = {
      PATH: process.env.PATH,
      HOME: dir,
      CENSAI_CLI_AGENT_DATA: dir,
      CENSAI_CLI_GROK_BIN: STANDIN,
      STANDIN_GROK_LOGIN_MS: '200',
      STANDIN_DELAY_MS: '5',
      // A key in the server's environment must never reach the chat run.
      XAI_API_KEY: 'xai-server-key-should-not-pass',
      CENSAI_CLI_AGENT_ENV_PASS: 'XAI_API_KEY,STANDIN_GROK_LOGIN_MS,STANDIN_DELAY_MS',
    };
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a chat turn is Grok with web tools only, the message as one argument', () => {
    const prompt = 'hi; rm -rf / "$(whoami)"';
    expect(grokChatArgs({ prompt })).toEqual(['-p', prompt, '--output-format', 'streaming-json', '--tools', 'web_search,web_fetch', '--no-auto-update', '--max-turns', '12']);
    expect(grokChatArgs({ prompt: 'x', sessionId: 'abc-123' }).slice(-2)).toEqual(['-r', 'abc-123']);
    expect(grokChatArgs({ prompt: 'x', sessionId: 'bad id; rm' })).not.toContain('-r');
  });

  test('earlier messages ride along on the first sign-in turn only', () => {
    expect(grokPrompt('Now?', [{ from: 'me', text: 'Hi' }, { from: 'agent', text: 'Hello' }])).toBe('Earlier in this chat:\n\nMe: Hi\n\nYou: Hello\n\nNow:\nNow?');
    expect(grokPrompt('Only this')).toBe('Only this');
  });

  test('every person has their own Grok folder', () => {
    const one = personalHomeDir(grok, 1, env);
    const two = personalHomeDir(grok, 2, env);
    expect(one).not.toBe(two);
    expect(personalHomeEnv(grok, 1, env)).toEqual({ GROK_HOME: one, GROK_DISABLE_AUTOUPDATER: '1' });
    expect(buildAgentEnv({ source: env, personal: { adapter: grok, userId: 2 } }).GROK_HOME).toBe(two);
    expect(personalHomeDir({ id: 'codex' }, 1, env)).toBeNull();
  });

  test('sign in with the code, chat on the plan with no API key, and a teammate stays signed out', async () => {
    const events = [];
    expect(() => runGrokChat({ userId: 1, text: 'hi', emit: (e) => events.push(e), env })).toThrow(expect.objectContaining({ code: 'GROK_SIGNIN_REQUIRED' }));

    const login = await startGrokLogin(1, { env });
    expect(login).toMatchObject({ running: true, url: 'https://accounts.x.ai/oauth2/device?user_code=WXYZ-4821', code: 'WXYZ-4821' });
    for (let i = 0; i < 50 && !personalSignedIn(grok, 1, env); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(personalSignedIn(grok, 1, env)).toBe(true);
    expect(personalSignedIn(grok, 2, env)).toBe(false);

    const result = await runGrokChat({ userId: 1, text: 'What is the latest news?', emit: (e) => events.push(e), env });
    expect(result.ok).toBe(true);
    const text = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(text).toMatch(/Grok sign-in of standin/);
    expect(text).toMatch(/Tools allowed: `web_search,web_fetch`/);
    expect(text).toMatch(/API key in my environment: none/);
    expect(events.some((e) => e.type === 'status' && e.status === 'calling_tool')).toBe(true);
    const done = events.find((e) => e.type === 'result');
    expect(done.text).toBe(text);
    expect(done.grokSessionId).toMatch(/^[0-9a-f-]{36}$/);

    const more = [];
    await runGrokChat({ userId: 1, text: 'And then?', sessionId: done.grokSessionId, emit: (e) => more.push(e), env });
    expect(more.find((e) => e.type === 'result').text).toMatch(/Picking up our conversation/);

    expect(() => runGrokChat({ userId: 2, text: 'hi', emit: () => {}, env })).toThrow(expect.objectContaining({ code: 'GROK_SIGNIN_REQUIRED' }));

    await grokLogout(1, { env });
    expect(personalSignedIn(grok, 1, env)).toBe(false);
  });

  test('an expired sign-in comes back as "sign in again", not a crash', async () => {
    const home = personalHomeDir(grok, 3, env);
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'auth.json'), '{}');
    const events = [];
    const fake = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from('{"type":"error","message":"401 Unauthorized: token expired"}\n'));
        child.emit('close', 1);
      }, 5);
      return child;
    };
    const result = await runGrokChat({ userId: 3, text: 'hi', emit: (e) => events.push(e), env, spawn: fake });
    expect(result).toEqual({ ok: false, code: 'GROK_SIGNIN_REQUIRED' });
    expect(events.at(-1).error).toMatchObject({ code: 'GROK_SIGNIN_REQUIRED', message: expect.stringMatching(/Sign in to Grok again/) });
  });
});

describe('Grok in the Agent Console and Alt+X terminal', () => {
  test('the terminal opens xAI\'s code sign-in first, then Grok', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-term-'));
    const env = { PATH: process.env.PATH, HOME: dir, CENSAI_CLI_AGENT_DATA: dir, CENSAI_CLI_GROK_BIN: STANDIN };
    const { startCliBackend } = await import('../server/terminal/cliBackend.js');
    const calls = [];
    const spawn = (command, args, options) => { calls.push({ command, args, env: options.env }); return {}; };
    const first = await startCliBackend({ cli: 'grok', cwd: dir, size: { cols: 80, rows: 24 }, userId: 5, env, spawn });
    expect(calls[0].args.slice(-2)).toEqual(['login', '--device-auth']);
    expect(calls[0].env.GROK_HOME).toBe(personalHomeDir(grok, 5, env));
    expect(first.note).toMatch(/Sign in to your own Grok account/);
    fs.writeFileSync(path.join(personalHomeDir(grok, 5, env), 'auth.json'), '{}');
    const second = await startCliBackend({ cli: 'grok', cwd: dir, size: { cols: 80, rows: 24 }, userId: 5, env, spawn });
    expect(calls[1].args).not.toContain('login');
    expect(second.note).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
