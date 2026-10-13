import path from 'path';
import fs from 'fs';
import * as pty from 'node-pty';
import { isDockerAvailable, ensureSandbox, sandboxShellArgv, sandboxAgentArgv, OPENCODE_RUN_MAX_PROMPT_CHARS } from '../sandbox/index.js';
import { log, ptyOptions } from './shared.js';

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
  return { proc, label: `Host shell (${path.basename(shell)})`, isSandbox: false, shell: shellFamily };
}

export async function startBackend(cwd, hasProject, size) {
  if (hasProject && await isDockerAvailable()) {
    try {
      return await spawnSandboxBackend(cwd, size);
    } catch (err) {
      log.warn('sandbox backend failed, falling back', { cwd, error: err.message });
    }
  }
  if (process.platform === 'win32') {
    try {
      return spawnWslShell(cwd, size);
    } catch (err) {
      log.warn('WSL backend failed, falling back to host shell', { error: err.message });
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
