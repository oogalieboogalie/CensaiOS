import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as pty from 'node-pty';
import { getAdapter } from '../cli-agents/adapters/index.js';
import { resolveCli, installCli, installState, hasCliLogin, managedBinDir } from '../cli-agents/install.js';
import { buildAgentEnv } from '../cli-agents/env.js';
import { agentHome, cliDataRoot } from '../cli-agents/paths.js';
import { resolveCliKey, LOGIN_OWNERS_FILE } from '../cli-agents/index.js';
import { claimCliLogin } from '../cli-agents/loginOwner.js';
import { personalSignedIn } from '../cli-agents/personalHome.js';
import { cliMayUseServerKeys } from '../cli-agents/serverKeyScope.js';
import { USE_CONPTY_DLL } from './shared.js';
import { githubGitEnv } from './githubLogin.js';

/**
 * A terminal that opens straight into a coding CLI (Claude Code, Codex,
 * Copilot CLI, Gemini CLI, OpenCode) in its normal interactive mode: the
 * Alt hotkeys open one. The CLI is the real, official binary the person
 * would run in their own terminal, found or installed the same way the
 * Agent Console does (cli-agents/install.js), with the same allowlisted
 * environment and the same lasting home in Docker, so a login made here is
 * the one the Agent Console uses too.
 *
 * Only the CLI id comes from the browser; the command is never built from
 * client text.
 */

export function terminalCliAdapter(id) {
  const raw = String(id || '').trim().toLowerCase();
  return raw ? getAdapter(raw) : null;
}

/** Interactive environment: the agent allowlist, plus a real color terminal. */
export function interactiveCliEnv({ adapter, key = null, env = process.env, home = agentHome(env), userId = null, serverKeys = true } = {}) {
  if (home) fs.mkdirSync(home, { recursive: true });
  const personal = adapter.personalHome ? { adapter, userId } : null;
  const out = buildAgentEnv({ source: env, key, keyEnv: adapter.keyEnv, managedBin: managedBinDir(env), home, personal, serverKeys });
  delete out.NO_COLOR;
  delete out.CI;
  out.TERM = 'xterm-256color';
  out.COLORTERM = 'truecolor';
  return out;
}

/**
 * Install on first use, writing progress into the terminal. Anyone who can
 * open a terminal can already run `npm install`, so this grants nothing new.
 */
export async function ensureCliInstalled(adapter, write, env = process.env) {
  if (resolveCli(adapter.id, env)) return;
  write(`\r\n${adapter.label} is not installed here yet. Installing it now, one time only…\r\n`);
  let lastPhase = '';
  const timer = setInterval(() => {
    const phase = installState(adapter.id)?.phase || '';
    if (phase && phase !== lastPhase) { lastPhase = phase; write(`  ${phase}\r\n`); }
  }, 1000);
  try {
    await installCli(adapter.id, env);
  } finally {
    clearInterval(timer);
  }
  write(`${adapter.label} installed.\r\n\r\n`);
}

/**
 * The CLI's own sign-in belongs to one person (cli-agents/loginOwner.js):
 * its owner uses it as is. Anyone else runs on their own API key from the
 * vault, or is refused with a plain reason, never on someone else's Claude,
 * ChatGPT or GitHub account. With no sign-in yet, the CLI shows its own
 * sign-in screen; censaiOS never sees or stores that login.
 *
 * The computer's own .env keys count only for someone allowed them
 * (serverKeyScope.js); resolveCliKey decides that.
 *
 * A person on their own key gets a private home folder, so the CLI cannot
 * fall back to the owner's sign-in file (Claude Code would, if they said
 * no to using the key).
 */
export async function cliCredentialFor(adapter, userId, env = process.env, resolveKey = resolveCliKey) {
  // Grok: each person has their own sign-in folder, so it is always their own.
  if (adapter.personalHome) return { key: null, home: agentHome(env) };
  const ownersFile = env.CENSAI_CLI_LOGIN_OWNERS_FILE || LOGIN_OWNERS_FILE;
  const signedIn = hasCliLogin(adapter.id, agentHome(env) || os.homedir());
  const blocked = claimCliLogin({ file: ownersFile, adapter, userId, signedIn });
  if (signedIn && !blocked) return { key: null, home: agentHome(env) };
  const found = await resolveKey({ adapter, userId }).catch(() => null);
  if (found?.key) return { key: found.key, home: privateHome(userId, env) };
  if (blocked) throw new Error(blocked);
  return { key: null, home: agentHome(env) };
}

/**
 * Claude Code in a terminal tab picks its conversation back up after
 * censaiOS restarts or the desktop app updates. Each tab and folder maps to
 * one fixed conversation id: the first launch starts it with --session-id,
 * and once its transcript is saved, later launches --resume it.
 */
export function terminalConversationId(sessionKey, cwd) {
  const hex = crypto.createHash('sha256').update(`${sessionKey}\0${cwd}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function conversationArgs(adapter, { sessionKey, cwd, home }) {
  if (adapter.id !== 'claudecode' || !sessionKey) return [];
  const id = terminalConversationId(sessionKey, cwd);
  const projects = path.join(home, '.claude', 'projects');
  let saved = false;
  try {
    saved = fs.readdirSync(projects).some((dir) => fs.existsSync(path.join(projects, dir, `${id}.jsonl`)));
  } catch { /* no conversations saved yet */ }
  return saved ? ['--resume', id] : ['--session-id', id];
}

export function privateHome(userId, env = process.env) {
  const safe = String(userId ?? 'anon').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'anon';
  return path.join(cliDataRoot(env), 'user-homes', safe);
}

export async function startCliBackend({ cli, cwd, size, userId, sessionKey = null, write = () => {}, env = process.env, spawn = pty.spawn, mayUse = cliMayUseServerKeys, gitLogin = githubGitEnv }) {
  const adapter = terminalCliAdapter(cli);
  if (!adapter) throw new Error('Unknown coding CLI.');
  await ensureCliInstalled(adapter, write, env);
  const launch = resolveCli(adapter.id, env);
  if (!launch) throw new Error(`${adapter.label} installed but cannot be found.`);
  const { key, home } = await cliCredentialFor(adapter, userId, env);
  const options = {
    name: 'xterm-256color',
    cols: size.cols,
    rows: size.rows,
    cwd,
    env: { ...interactiveCliEnv({ adapter, key, env, home, userId, serverKeys: await mayUse(userId) }), ...await gitLogin(userId) },
    useConptyDll: USE_CONPTY_DLL,
  };
  // Not signed in to their own Grok yet: start with its code sign-in.
  const signIn = Boolean(adapter.personalHome && adapter.loginArgs && !personalSignedIn(adapter, userId, env));
  const args = signIn ? adapter.loginArgs : conversationArgs(adapter, { sessionKey, cwd, home: home || env.HOME || os.homedir() });
  // A Windows .cmd shim needs cmd.exe to run it.
  const proc = launch.shell
    ? spawn(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', launch.command, ...args], options)
    : spawn(launch.command, [...launch.prefixArgs, ...args], options);
  // xAI's link has the code in it already and its page only asks to confirm it.
  const note = signIn ? `Sign in to your own ${adapter.label} account: open the link below and check that the page shows the code below (enter it if the page asks for it). When it says you are signed in, press Enter to start ${adapter.label}.` : undefined;
  return { proc, label: adapter.label, isSandbox: false, shell: 'bash', cli: adapter.id, note };
}
