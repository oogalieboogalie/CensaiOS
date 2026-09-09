/**
 * Sandbox image rebuild state machine.
 *
 * Owns the in-memory rebuild job state (so the UI can poll progress) and the
 * docker image rebuild flow. Routes in server/routes/sandbox.js are the only
 * consumer.
 */

import { runnerClient } from '../runner/client.js';
import { createLogger } from '../logger.js';
import { SANDBOX_IMAGE } from './images.js';

const log = createLogger('sandbox-rebuild');

let rebuildState = {
  status: 'idle',      // 'idle' | 'running' | 'done' | 'error'
  startedAt: null,
  finishedAt: null,
  log: [],             // array of { ts, line } log messages
  error: null,
};

export function getRebuildState() {
  return rebuildState;
}

export function resetRebuildState() {
  rebuildState = { status: 'idle', startedAt: null, finishedAt: null, log: [], error: null };
}

function pushLog(line) {
  rebuildState.log.push({ ts: Date.now(), line });
  // Cap log at 500 lines to avoid memory blow-up
  if (rebuildState.log.length > 500) rebuildState.log.shift();
}

export async function removeSandboxImage() {
  try {
    await runnerClient.exec('docker', ['rmi', '-f', SANDBOX_IMAGE], { windowsHide: true });
  } catch {
    // Image may not exist — that's fine
  }
}

async function killExistingSandboxes() {
  try {
    const { stdout } = await runnerClient.exec(
      'docker',
      ['ps', '-a', '-q', '--filter', 'label=homebase.sandbox=1'],
      { windowsHide: true }
    );
    const ids = stdout.trim().split('\n').filter(Boolean);
    if (ids.length) {
      await runnerClient.exec('docker', ['rm', '-f', ...ids], { windowsHide: true });
      pushLog(`Stopped ${ids.length} existing sandbox container(s).`);
    }
  } catch {
    // Non-fatal
  }
}

/** Resolve Dockerfile paths the same way images.js does (lazy, no top-level circular dep) */
async function resolvePaths() {
  const { fileURLToPath } = await import('url');
  const path = await import('path');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const SANDBOX_DOCKERFILE = path.resolve(__dirname, '..', '..', 'docker', 'sandbox.Dockerfile');
  const SANDBOX_DOCKERFILE_DIR = path.resolve(__dirname, '..', '..');
  return { SANDBOX_DOCKERFILE, SANDBOX_DOCKERFILE_DIR };
}

export async function triggerRebuild() {
  if (rebuildState.status === 'running') {
    log.warn('rebuild already in progress, skipping');
    return;
  }

  rebuildState = {
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    log: [],
    error: null,
  };

  // Run async — intentionally not awaited so the POST returns immediately
  (async () => {
    try {
      pushLog('Stopping existing sandbox containers...');
      await killExistingSandboxes();

      pushLog('Removing old sandbox image...');
      await removeSandboxImage();

      pushLog('Starting image build — this may take a few minutes...');

      // Import here to get the freshly-read config baked into the build
      const { toolchainBuildArgs } = await import('./toolchains.js');
      const { readToolchainConfig: readCfg } = await import('./toolchainConfig.js');
      const { SANDBOX_DOCKERFILE, SANDBOX_DOCKERFILE_DIR } = await resolvePaths();
      const { enabled: enabledTools } = readCfg();

      if (enabledTools.length === 0) {
        pushLog('No CLIs selected — building lean base image.');
      } else {
        pushLog(`Installing: ${enabledTools.join(', ')}`);
      }

      const buildArgs = toolchainBuildArgs(enabledTools);

      const { code, stdout, stderr } = await runnerClient.exec(
        'docker',
        ['build', '-f', SANDBOX_DOCKERFILE, ...buildArgs, '-t', SANDBOX_IMAGE, SANDBOX_DOCKERFILE_DIR],
        { windowsHide: true, timeout: 900_000, maxBuffer: 50 * 1024 * 1024 }
      );

      // Surface docker build output as log lines
      const lines = `${stdout}\n${stderr}`.split('\n').filter(Boolean);
      lines.forEach((l) => pushLog(l));

      if (code !== 0) {
        throw new Error(`docker build exited with code ${code}`);
      }

      pushLog('✓ Sandbox image built successfully.');
      rebuildState.status = 'done';
      rebuildState.finishedAt = Date.now();
    } catch (err) {
      log.error('sandbox rebuild failed', { error: err.message });
      pushLog(`✗ Build failed: ${err.message}`);
      rebuildState.status = 'error';
      rebuildState.error = err.message;
      rebuildState.finishedAt = Date.now();
    }
  })();
}
