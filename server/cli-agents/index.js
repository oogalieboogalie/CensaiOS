import path from 'path';
import os from 'os';
import { CliTaskManager } from './taskManager.js';
import { CLI_ADAPTERS } from './adapters/index.js';
import { detectVersion, hasCliLogin, installState } from './install.js';
import { agentHome } from './paths.js';
import { readToolchainConfig } from '../sandbox/toolchainConfig.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { LOCAL_STATE_DIR } from '../routes/files/pathUtils.js';
import { claimCliLogin } from './loginOwner.js';
import { personalSignedIn } from './personalHome.js';

export { CliTaskManager, buildHandoffPrompt } from './taskManager.js';
export { CLI_ADAPTERS, getAdapter } from './adapters/index.js';

/**
 * Where a CLI's key comes from, in order: the user's key vault (Settings →
 * keys), the Toolchains config, the server environment. Returning null is
 * fine: the CLI then uses its own login (claude login, codex login…), but only
 * for the person who owns that login (loginOwner.js).
 * The key goes into the CLI's environment only; it is never stored on the
 * task and the transcript redacts it.
 */
export async function resolveCliKey({ adapter, userId }) {
  if (userId && adapter.vaultProvider) {
    try {
      const vault = await getUserApiKeyConfig(userId, adapter.vaultProvider);
      if (vault?.apiKey) return { key: vault.apiKey, source: 'vault' };
    } catch { /* vault unavailable (no DB): fall through */ }
  }
  const config = readToolchainConfig();
  if (config.apiKeys?.[adapter.keyEnv]) return { key: config.apiKeys[adapter.keyEnv], source: 'toolchains' };
  if (process.env[adapter.keyEnv]) return { key: process.env[adapter.keyEnv], source: 'env' };
  // A per-person sign-in folder (Grok) is never shared: nothing to claim.
  if (adapter.personalHome) return null;
  // No key: the CLI falls back to its own sign-in, which belongs to one person.
  const blocked = claimCliLogin({
    file: LOGIN_OWNERS_FILE, adapter, userId, signedIn: hasCliLogin(adapter.id, agentHome() || os.homedir()),
  });
  return blocked ? { key: null, source: 'cli-login', blocked } : null;
}

export const LOGIN_OWNERS_FILE = path.join(LOCAL_STATE_DIR, 'cli-agents', 'login-owners.json');

const SWEEP_EVERY_MS = 5 * 60 * 1000;
let manager = null;
export function getCliTaskManager() {
  if (!manager) {
    manager = new CliTaskManager({
      stateFile: path.join(LOCAL_STATE_DIR, 'cli-agents', 'tasks.json'),
      resolveKey: resolveCliKey,
    });
    // Tidy up on a timer (cleanup.js), and never leave an agent running
    // after the app itself has gone.
    const first = setTimeout(() => manager.sweep(), 30_000);
    first.unref?.();
    const timer = setInterval(() => manager.sweep(), SWEEP_EVERY_MS);
    timer.unref?.();
    process.once('exit', () => manager.stopAll());
  }
  return manager;
}

/** Shutdown hook: end every running agent and what it started. */
export function stopAllCliAgents() {
  if (manager) manager.stopAll();
}

// Version probes spawn a process per CLI, so cache them briefly.
const versionCache = new Map();
const VERSION_TTL_MS = 60_000;

async function cachedVersion(id, force) {
  const hit = versionCache.get(id);
  if (!force && hit && Date.now() - hit.at < VERSION_TTL_MS) return hit.value;
  const value = await detectVersion(id).catch(() => ({ installed: false, version: null, source: null }));
  versionCache.set(id, { at: Date.now(), value });
  return value;
}

export function forgetVersions() {
  versionCache.clear();
}

/**
 * One status row per CLI for the console's status chips and the board's
 * presence: version, signed in (and how), running / needs approval / idle.
 */
export async function cliRoster({ userId, force = false, tasks = getCliTaskManager() } = {}) {
  const all = tasks.list();
  return Promise.all(Object.values(CLI_ADAPTERS).map(async (adapter) => {
    const detected = await cachedVersion(adapter.id, force);
    const key = await resolveCliKey({ adapter, userId }).catch(() => null);
    const login = adapter.personalHome ? personalSignedIn(adapter, userId) : hasCliLogin(adapter.id, agentHome() || os.homedir());
    const mine = all.filter((t) => t.cli === adapter.id);
    const running = mine.filter((t) => t.running);
    const needsApproval = mine.filter((t) => t.status === 'needs_approval');
    const install = installState(adapter.id);
    const state = install?.status === 'installing'
      ? 'installing'
      : needsApproval.length ? 'needs_approval' : running.length ? 'running' : detected.installed ? 'idle' : 'not_installed';
    return {
      id: adapter.id,
      label: adapter.label,
      vendor: adapter.vendor,
      homepage: adapter.homepage,
      npmPackage: adapter.npmPackage,
      keyEnv: adapter.keyEnv,
      gate: adapter.gate,
      gateNote: adapter.gateNote,
      installed: detected.installed,
      version: detected.version,
      source: detected.source,
      signedIn: Boolean(key) || login,
      signedInVia: key ? key.source : login ? 'cli-login' : null,
      state,
      running: running.length,
      needsApproval: needsApproval.length,
      activeTasks: running.map((t) => ({ id: t.id, title: t.title, status: t.status, by: t.createdBy?.name })),
      install,
    };
  }));
}
