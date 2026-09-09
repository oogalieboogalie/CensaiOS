import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import pathModule from 'path';
import { getSecret } from '../secrets.js';
import { getRuntimeMode } from '../middleware/runtimeMode.js';
import { requireRunnerSecret, runnerSecretStatus } from './auth.js';

const execFileAsync = promisify(execFile);

/**
 * Runner Client
 *
 * Centralized interface for executing dangerous commands.
 * Delegated to an external runner service if enabled, or falls back to local execution.
 */
export class RunnerClient {
  isEnabled() {
    const enabled = process.env.RUNNER_ENABLED;
    const mode = getRuntimeMode();

    // Explicitly disabled
    if (enabled === 'false') return false;

    // Explicitly enabled
    if (enabled === 'true') return true;

    // Default: enabled only in local desktop mode as a fallback.
    // In production (cloud_saas, private_server), it must be explicitly enabled.
    return mode === 'local_desktop';
  }

  isRemote() {
    return this.isEnabled() && !!process.env.RUNNER_URL;
  }

  getRunnerUrl() {
    return process.env.RUNNER_URL || 'http://localhost:3003';
  }

  getSecret() {
    return getSecret('RUNNER_SECRET') || process.env.RUNNER_SECRET;
  }

  requireRemoteSecret() {
    return requireRunnerSecret(this.getSecret());
  }

  async exec(command, args, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('Dangerous execution is disabled. Enable RUNNER_ENABLED or configure a runner service.');
    }

    if (this.isRemote()) {
      return this.execRemote(command, args, options);
    }

    return this.execLocal(command, args, options);
  }

  async fsRead(path, options = {}) {
    if (!this.isEnabled()) throw new Error('Dangerous execution is disabled.');
    if (this.isRemote()) {
      const secret = this.requireRemoteSecret();
      const url = `${this.getRunnerUrl()}/fs/read`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-runner-secret': secret },
        body: JSON.stringify({ path, ...options }),
      });
      if (!res.ok) throw new Error(`Runner error: ${await res.text()}`);
      return (await res.json()).content;
    }
    return fs.promises.readFile(path, options.encoding || 'utf8');
  }

  async fsWrite(path, content, options = {}) {
    if (!this.isEnabled()) throw new Error('Dangerous execution is disabled.');
    if (this.isRemote()) {
      const secret = this.requireRemoteSecret();
      const url = `${this.getRunnerUrl()}/fs/write`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-runner-secret': secret },
        body: JSON.stringify({ path, content, ...options }),
      });
      if (!res.ok) throw new Error(`Runner error: ${await res.text()}`);
      return (await res.json()).ok;
    }
    const dir = pathModule.dirname(path);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path, content, options.encoding || 'utf8');
    return true;
  }

  async fsList(path) {
    if (!this.isEnabled()) throw new Error('Dangerous execution is disabled.');
    if (this.isRemote()) {
      const secret = this.requireRemoteSecret();
      const url = `${this.getRunnerUrl()}/fs/list`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-runner-secret': secret },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error(`Runner error: ${await res.text()}`);
      return (await res.json()).entries;
    }
    const entries = await fs.promises.readdir(path, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile()
    }));
  }

  async execLocal(command, args, options = {}) {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        maxBuffer: 50 * 1024 * 1024,
        ...options,
        shell: process.platform === 'win32' || options.shell,
      });
      return { stdout, stderr, code: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message || '',
        code: err.code ?? err.status ?? 1,
      };
    }
  }

  async execRemote(command, args, options = {}) {
    const url = `${this.getRunnerUrl()}/exec`;
    const secret = this.requireRemoteSecret();

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runner-secret': secret,
      },
      body: JSON.stringify({ command, args, options }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Runner service error (${res.status}): ${errorText}`);
    }

    return res.json();
  }

  async getHealth() {
    if (!this.isEnabled()) return { enabled: false };
    if (!this.isRemote()) return { enabled: true, remote: false };

    const secretStatus = runnerSecretStatus(this.getSecret());
    if (!secretStatus.valid) {
      return {
        enabled: true,
        remote: true,
        ok: false,
        configurationError: secretStatus.code,
      };
    }

    try {
      const url = `${this.getRunnerUrl()}/health`;
      const secret = secretStatus.secret;
      const res = await fetch(url, {
        headers: { 'x-runner-secret': secret },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return { enabled: true, remote: true, ok: false, status: res.status };
      const data = await res.json();
      return { enabled: true, remote: true, ok: true, ...data };
    } catch (err) {
      return { enabled: true, remote: true, ok: false, error: err.message };
    }
  }
}

export const runnerClient = new RunnerClient();
