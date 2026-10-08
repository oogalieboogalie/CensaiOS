import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createLogger } from '../logger.js';
import { CLI_ADAPTERS, getAdapter } from './adapters/index.js';

/**
 * Finding, versioning and installing coding CLIs.
 *
 * Installs go into a Censai-managed npm prefix (~/.censai/cli-agents by
 * default) instead of `npm -g`, so first-use install never needs admin
 * rights and never touches the user's global packages. Binaries already on
 * PATH are used as-is. `CENSAI_CLI_<ID>_BIN` overrides the binary (tests
 * and demos point it at a stand-in agent).
 */

const log = createLogger('cli-agents-install');
const VERSION_TIMEOUT_MS = 8000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

export function managedPrefix(env = process.env) {
  return env.CENSAI_CLI_AGENT_PREFIX ? path.resolve(env.CENSAI_CLI_AGENT_PREFIX) : path.join(os.homedir(), '.censai', 'cli-agents');
}

export function managedBinDir(env = process.env) {
  const prefix = managedPrefix(env);
  return path.join(prefix, 'node_modules', '.bin');
}

function overrideFor(id, env = process.env) {
  const value = env[`CENSAI_CLI_${id.toUpperCase()}_BIN`];
  return value ? path.resolve(value) : null;
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function findOnPath(binary, env = process.env) {
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, binary + ext.toLowerCase());
      if (isFile(candidate)) return candidate;
      if (ext && isFile(path.join(dir, binary + ext))) return path.join(dir, binary + ext);
    }
  }
  return null;
}

/**
 * For a managed npm install, run the package's JS entry with node directly.
 * That sidesteps Windows .cmd shims, which would need a shell and quoting.
 */
function managedEntry(adapter, env = process.env) {
  const pkgDir = path.join(managedPrefix(env), 'node_modules', ...adapter.npmPackage.split('/'));
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[adapter.binary] || Object.values(pkg.bin || {})[0];
    if (!rel) return null;
    const entry = path.join(pkgDir, rel);
    return isFile(entry) ? entry : null;
  } catch {
    return null;
  }
}

/**
 * How to launch a CLI: { command, prefixArgs, source } or null when missing.
 * `.js`/`.mjs` entries run under the current node binary.
 */
export function resolveCli(id, env = process.env) {
  const adapter = getAdapter(id);
  if (!adapter) return null;
  const override = overrideFor(adapter.id, env);
  const asLaunch = (file, source) => (/\.(c|m)?js$/i.test(file)
    ? { command: process.execPath, prefixArgs: [file], source, file }
    : { command: file, prefixArgs: [], source, file, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(file) });
  if (override) return isFile(override) ? asLaunch(override, 'override') : null;
  const entry = managedEntry(adapter, env);
  if (entry) return asLaunch(entry, 'managed');
  const onPath = findOnPath(adapter.binary, env);
  return onPath ? asLaunch(onPath, 'path') : null;
}

function run(command, args, { timeoutMs, env, onLine, shell = false } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    let child;
    try {
      child = spawn(command, args, { env, shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: 1, out: err.message });
      return;
    }
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    const onData = (chunk) => {
      const text = chunk.toString();
      out += text;
      if (out.length > 200_000) out = out.slice(-100_000);
      if (onLine) text.split(/\r?\n/).filter(Boolean).forEach(onLine);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out });
    };
    child.on('error', (err) => { out += err.message; finish(1); });
    child.on('close', (code) => finish(code ?? 1));
  });
}

export async function detectVersion(id, env = process.env) {
  const launch = resolveCli(id, env);
  if (!launch) return { installed: false, version: null, source: null };
  const { code, out } = await run(launch.command, [...launch.prefixArgs, '--version'], { timeoutMs: VERSION_TIMEOUT_MS, env, shell: launch.shell });
  const line = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  const version = (line.match(/\d+\.\d+\.\d+[\w.-]*/) || [])[0] || null;
  return { installed: code === 0 || Boolean(version), version, source: launch.source };
}

/** Logged-in-to-the-CLI check: the CLI's own credential file exists. */
export function hasCliLogin(id, home = os.homedir()) {
  const adapter = getAdapter(id);
  return Boolean(adapter?.loginFiles?.some((rel) => isFile(path.join(home, rel))));
}

// ── First-use install with progress ─────────────────────────────────────
const installs = new Map(); // id → { status, progress, phase, log[], error, promise }

export function installState(id) {
  const s = installs.get(id);
  if (!s) return null;
  const { promise: _promise, ...rest } = s;
  return { ...rest, log: s.log.slice(-12) };
}

/**
 * npm prints no percentage, so progress follows its phases: resolving
 * (to 15%), fetching (each fetch line moves toward 85%), linking (90%),
 * verifying with --version (100%).
 */
export function installCli(id, env = process.env) {
  const adapter = getAdapter(id);
  if (!adapter) return Promise.reject(new Error('Unknown CLI.'));
  const existing = installs.get(id);
  if (existing?.status === 'installing') return existing.promise;

  const state = { status: 'installing', progress: 0.05, phase: 'Resolving packages', log: [], error: null, startedAt: Date.now() };
  const prefix = managedPrefix(env);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--loglevel', 'http', adapter.npmPackage];
  let fetches = 0;
  state.promise = (async () => {
    fs.mkdirSync(prefix, { recursive: true });
    log.info('installing cli', { id, prefix });
    const { code, out } = await run(npm, args, {
      timeoutMs: INSTALL_TIMEOUT_MS,
      env: { ...env, npm_config_update_notifier: 'false' },
      shell: process.platform === 'win32',
      onLine: (line) => {
        state.log.push(line.slice(0, 200));
        if (state.log.length > 60) state.log.shift();
        if (/http fetch/i.test(line)) {
          fetches += 1;
          state.phase = `Downloading (${fetches} packages)`;
          state.progress = Math.min(0.85, 0.15 + 0.7 * (1 - Math.exp(-fetches / 40)));
        } else if (/reify|build|link/i.test(line)) {
          state.phase = 'Linking';
          state.progress = Math.max(state.progress, 0.9);
        }
      },
    });
    if (code !== 0) {
      state.status = 'error';
      state.error = out.split(/\r?\n/).filter(Boolean).slice(-4).join(' ') || `npm exited with ${code}`;
      throw new Error(`Could not install ${adapter.label}: ${state.error}`);
    }
    state.phase = 'Checking version';
    state.progress = 0.95;
    const detected = await detectVersion(id, env);
    if (!detected.installed) {
      state.status = 'error';
      state.error = `${adapter.label} installed but does not start.`;
      throw new Error(state.error);
    }
    state.status = 'done';
    state.progress = 1;
    state.phase = `Installed ${detected.version || ''}`.trim();
    return detected;
  })();
  state.promise.catch(() => {});
  installs.set(id, state);
  return state.promise;
}

export function listAdapters() {
  return Object.values(CLI_ADAPTERS);
}
