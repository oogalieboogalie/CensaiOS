import path from 'path';
import fs from 'fs';
import * as pty from 'node-pty';
import { isDockerAvailable, ensureSandbox, sandboxShellArgv, sandboxAgentArgv, OPENCODE_RUN_MAX_PROMPT_CHARS } from '../sandbox/index.js';
import { log, ptyOptions } from './shared.js';
import { folderKind, safeReason } from './logSafe.js';

export { folderKind, safeReason };

async function spawnSandboxBackend(cwd, size) {
  const { name } = await ensureSandbox(cwd);
  const proc = pty.spawn('docker', sandboxShellArgv(name), ptyOptions(size));
  return { proc, label: `Docker sandbox (${name})`, isSandbox: true, shell: 'bash' };
}

function spawnWslShell(cwd, size) {
  const proc = pty.spawn('wsl.exe', ['--cd', cwd], ptyOptions(size, cwd));
  return { proc, label: 'WSL shell', isSandbox: false, shell: 'bash' };
}

export function resolveHostShell({
  platform = process.platform,
  env = process.env,
  exists = fs.existsSync,
} = {}) {
  if (platform === 'win32') return env.ComSpec || 'powershell.exe';
  return [env.SHELL, '/bin/bash', '/bin/sh'].filter(Boolean).find(candidate => exists(candidate)) || '/bin/sh';
}

function spawnHostShell(cwd, size) {
  const shell = resolveHostShell();
  const proc = pty.spawn(shell, [], ptyOptions(size, cwd));
  const base = path.basename(shell).toLowerCase();
  const shellFamily = base.includes('powershell') || base.includes('pwsh')
    ? 'powershell'
    : base.includes('cmd')
      ? 'cmd'
      : 'bash';
  return { proc, label: `Host shell (${path.basename(shell)})`, isSandbox: false, shell: shellFamily, note: hostShellNote() };
}

// Said once when a shell opens outside the sandbox, so nobody mistakes it
// for one. In Docker, "root" is the app container's own root.
export function hostShellNote(env = process.env) {
  if (env.CENSAI_IN_CONTAINER === '1') {
    return 'Not the sandbox: this shell runs inside the censaiOS app container (its own Linux, root there only). '
      + 'It sees the CensaiHub folder and your projects folder, not the rest of your PC. It has internet.';
  }
  return 'Not the sandbox: this is a shell on this computer, with your own account\'s access.';
}

// A shell outside the sandbox can read the app's files, so only the board's
// owner or an admin may open one; teammates get the sandbox or nothing.
const HOST_SHELL_ROLES = new Set(['owner', 'admin']);

export async function startBackend(cwd, hasProject, size, owner = null) {
  if (hasProject && await isDockerAvailable()) {
    try {
      return await spawnSandboxBackend(cwd, size);
    } catch (err) {
      log.warn('sandbox backend failed, falling back', { folder: folderKind(cwd, hasProject), error: safeReason(err) });
    }
  }
  if (owner?.role && !HOST_SHELL_ROLES.has(owner.role)) {
    throw new Error('The sandbox is not available, and only the board\'s owner can open a shell outside it. Mount this terminal to a project, or ask the owner.');
  }
  if (process.platform === 'win32') {
    try {
      return spawnWslShell(cwd, size);
    } catch (err) {
      log.warn('WSL backend failed, falling back to host shell', { error: safeReason(err) });
    }
  }
  return spawnHostShell(cwd, size);
}

/**
 * Headless OpenCode run inside the project sandbox. Sandbox-only by design:
 * the CLI, its toolchain keys, and the project mount all live there. Throws
 * a plain-English error (shown in the terminal) when unavailable.
 */
export async function startAgentBackend(cwd, prompt, size) {
  if (!cwd) {
    throw new Error('Agent run needs a project folder. Mount this terminal to a project first.');
  }
  const task = String(prompt || '').trim();
  if (!task) throw new Error('Agent run requires a non-empty prompt');
  if (task.length > OPENCODE_RUN_MAX_PROMPT_CHARS) {
    throw new Error(`Agent prompt exceeds ${OPENCODE_RUN_MAX_PROMPT_CHARS} characters`);
  }
  if (!await isDockerAvailable()) {
    throw new Error('Agent run needs Docker (project sandbox). Start Docker Desktop and retry.');
  }
  const { name } = await ensureSandbox(cwd);
  const proc = pty.spawn('docker', sandboxAgentArgv(name, prompt), ptyOptions(size));
  return { proc, label: `OpenCode agent (${name})`, isSandbox: true, shell: 'bash', agent: 'opencode' };
}
