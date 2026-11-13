import fs from 'fs';
import path from 'path';
import { spawn as nodeSpawn } from 'child_process';
import { createLogger } from '../logger.js';
import { grok } from '../cli-agents/adapters/grok.js';
import { resolveCli, managedBinDir } from '../cli-agents/install.js';
import { buildAgentEnv } from '../cli-agents/env.js';
import { agentHome } from '../cli-agents/paths.js';
import { personalHomeDir, personalSignedIn } from '../cli-agents/personalHome.js';
import { forgetChatThreads } from './chatThreads.js';

/**
 * Signing in to your own Grok account from the Grok chat, with no terminal:
 * censaiOS runs xAI's own `grok login --device-auth` in your own GROK_HOME
 * and shows the link and code it prints. You open the link, approve on
 * x.ai, and Grok saves the sign-in in your folder. censaiOS never sees your
 * password or token; it only watches for Grok's own sign-in file.
 */

const log = createLogger('grok-signin');
const LOGIN_LIMIT_MS = 10 * 60 * 1000;
const logins = new Map(); // userId -> state

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
const URL_RE = /https:\/\/[^\s"'<>]+/;
const CODE_RE = /\b[A-Z0-9]{3,6}(?:-[A-Z0-9]{3,6})+\b/;

function key(userId) {
  return String(userId ?? 'anon');
}

function publicState(state) {
  if (!state) return null;
  const { child: _child, timer: _timer, ...rest } = state;
  return { ...rest, lines: rest.lines.slice(-8) };
}

export function grokLoginState(userId) {
  return publicState(logins.get(key(userId)));
}

/** Start (or return the running) sign-in. Resolves once the link shows, or after waitMs. */
export function startGrokLogin(userId, { env = process.env, spawn = nodeSpawn, waitMs = 15_000 } = {}) {
  const current = logins.get(key(userId));
  if (current?.running) return Promise.resolve(publicState(current));
  const launch = resolveCli(grok.id, env);
  if (!launch) throw Object.assign(new Error('Grok is not installed in censaiOS yet.'), { code: 'GROK_NOT_INSTALLED', status: 409 });

  const lasting = agentHome(env);
  if (lasting) fs.mkdirSync(lasting, { recursive: true });
  const runEnv = buildAgentEnv({ source: env, managedBin: managedBinDir(env), home: lasting, personal: { adapter: grok, userId }, serverKeys: false });
  delete runEnv.XAI_API_KEY;
  const cwd = path.join(personalHomeDir(grok, userId, env), 'chat');
  fs.mkdirSync(cwd, { recursive: true });

  const state = { running: true, ok: null, url: null, code: null, lines: [], error: null, startedAt: Date.now() };
  logins.set(key(userId), state);
  log.info('grok sign-in started', { userId });
  const child = spawn(launch.command, [...launch.prefixArgs, ...grok.loginArgs], { cwd, env: runEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  Object.defineProperty(state, 'child', { value: child, enumerable: false });
  state.timer = setTimeout(() => child.kill('SIGTERM'), LOGIN_LIMIT_MS);

  let waiter = null;
  const wake = () => { if (waiter) { waiter(publicState(state)); waiter = null; } };
  const readLines = (lines) => {
    for (const raw of lines) {
      const line = raw.replace(ANSI, '').trim();
      if (!line) continue;
      state.lines.push(line.slice(0, 300));
      if (state.lines.length > 40) state.lines.shift();
      if (!state.url && URL_RE.test(line)) state.url = line.match(URL_RE)[0].replace(/[).,]+$/, '');
      if (!state.code && CODE_RE.test(line)) state.code = line.match(CODE_RE)[0];
    }
  };
  // A line can come in pieces, so each stream is read a whole line at a time:
  // a link or code cut in two is never taken for the whole of it.
  const readers = [child.stdout, child.stderr].map((stream) => {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = `${rest}${chunk}`.split(/\r?\n/);
      rest = lines.pop().slice(-2000);
      readLines(lines);
      if (state.url) wake();
    });
    return () => { readLines([rest]); rest = ''; };
  });
  let settled = false;
  const finish = (code, err) => {
    if (settled) return;
    settled = true;
    readers.forEach((flush) => flush());
    clearTimeout(state.timer);
    state.running = false;
    state.ok = personalSignedIn(grok, userId, env);
    if (!state.ok) state.error = err?.message || state.lines.at(-1) || `Grok sign-in stopped (code ${code}).`;
    log.info('grok sign-in finished', { userId, ok: state.ok, exit: code });
    wake();
  };
  child.on('error', (err) => finish(null, err));
  child.on('close', (code) => finish(code));

  return new Promise((resolve) => {
    waiter = resolve;
    setTimeout(wake, waitMs).unref?.();
  });
}

export function cancelGrokLogin(userId) {
  const state = logins.get(key(userId));
  if (state?.running) state.child?.kill('SIGTERM');
}

/** Sign out: xAI's own `grok logout` in their folder, then make sure the file is gone. */
export async function grokLogout(userId, { env = process.env, spawn = nodeSpawn } = {}) {
  cancelGrokLogin(userId);
  logins.delete(key(userId));
  const home = personalHomeDir(grok, userId, env);
  const launch = resolveCli(grok.id, env);
  if (launch) {
    const runEnv = buildAgentEnv({ source: env, home: agentHome(env), personal: { adapter: grok, userId }, serverKeys: false });
    await new Promise((resolve) => {
      const child = spawn(launch.command, [...launch.prefixArgs, 'logout'], { env: runEnv, windowsHide: true, stdio: 'ignore' });
      child.on('error', resolve);
      child.on('close', resolve);
    });
  }
  fs.rmSync(path.join(home, grok.personalHome.loginFile), { force: true });
  // The next sign-in may be another Grok account, which has none of these conversations.
  forgetChatThreads(userId, env);
  log.info('grok signed out', { userId });
}
