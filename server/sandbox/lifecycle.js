import { runnerClient } from '../runner/client.js';
import { createLogger } from '../logger.js';
import { isDockerAvailable } from './availability.js';
import { sandboxNameForPath, bindMountSource, WORKDIR } from './naming.js';
import { ensureSandboxImage, SANDBOX_IMAGE } from './images.js';
import { TOOLCHAIN_REGISTRY } from './toolchains.js';
import { readToolchainConfig } from './toolchainConfig.js';

const log = createLogger('sandbox-lifecycle');
const KEEPALIVE = ['sleep', 'infinity'];

async function containerState(name) {
  try {
    const { stdout, code } = await runnerClient.exec(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', name],
      { windowsHide: true }
    );
    if (code !== 0) return 'absent';
    return stdout.trim() === 'true' ? 'running' : 'stopped';
  } catch {
    return 'absent';
  }
}

const ensureLocks = new Map();

export async function ensureSandbox(hostPath, options = {}) {
  if (!hostPath) throw new Error('ensureSandbox requires a host project path');
  if (!await isDockerAvailable()) throw new Error('Docker is not available on this host');

  const name = sandboxNameForPath(hostPath);
  if (ensureLocks.has(name)) {
    await ensureLocks.get(name);
    return { name, workdir: WORKDIR, created: false };
  }

  const lock = (async () => {
    const state = await containerState(name);
    if (state === 'running') {
      log.debug('reusing running sandbox', { name, hostPath });
      return false;
    }
    if (state === 'stopped') {
      log.info('starting stopped sandbox', { name, hostPath });
      const { code, stderr } = await runnerClient.exec('docker', ['start', name], { windowsHide: true });
      if (code !== 0) throw new Error(`Start failed: ${stderr}`);
      return false;
    }

    log.info('creating sandbox container', { name, hostPath });
    await ensureSandboxImage();
    const src = bindMountSource(hostPath);

    // Inject API keys for any enabled CLI toolchains.
    const { enabled: enabledTools, apiKeys: savedKeys } = readToolchainConfig();
    const toolchainEnvFlags = enabledTools.flatMap((id) => {
      const entry = TOOLCHAIN_REGISTRY[id];
      if (!entry) return [];
      const val = savedKeys[entry.envKey] || process.env[entry.envKey];
      return val ? ['--env', `${entry.envKey}=${val}`] : [];
    });

    const runArgs = [
      'run', '-d',
      '--name', name,
      '-w', WORKDIR,
      '-v', `${src}:${WORKDIR}`,
      '--label', 'homebase.sandbox=1',
      '--label', `homebase.hostPath=${src}`,
      ...toolchainEnvFlags,
    ];
    if (options.network === false) runArgs.push('--network', 'none');
    runArgs.push(SANDBOX_IMAGE, ...KEEPALIVE);

    const { code, stderr } = await runnerClient.exec('docker', runArgs, { windowsHide: true, timeout: 120_000 });
    if (code !== 0) throw new Error(`Create failed: ${stderr}`);
    return true;
  })();

  ensureLocks.set(name, lock);
  try {
    const created = await lock;
    return { name, workdir: WORKDIR, created };
  } finally {
    ensureLocks.delete(name);
  }
}

export async function stopSandbox(hostPath) {
  const name = sandboxNameForPath(hostPath);
  try {
    const { code } = await runnerClient.exec('docker', ['rm', '-f', name], { windowsHide: true });
    return code === 0;
  } catch {
    return false;
  }
}

export async function listSandboxes() {
  if (!await isDockerAvailable()) return [];
  try {
    const { stdout, code } = await runnerClient.exec(
      'docker',
      ['ps', '-a', '--filter', 'label=homebase.sandbox=1', '--format', '{{.Names}}\t{{.Status}}\t{{.Label "homebase.hostPath"}}'],
      { windowsHide: true }
    );
    if (code !== 0) return [];
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [name, status, hostPath] = line.split('\t');
      return { name, status, hostPath };
    });
  } catch {
    return [];
  }
}
