import path from 'path';
import { fileURLToPath } from 'url';
import { runnerClient } from '../runner/client.js';
import { createLogger } from '../logger.js';
import { toolchainBuildArgs } from './toolchains.js';
import { readToolchainConfig } from './toolchainConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('sandbox-images');

export const SANDBOX_IMAGE = process.env.HOMEBASE_SANDBOX_IMAGE || 'homebase-sandbox:latest';
const SANDBOX_DOCKERFILE = path.resolve(__dirname, '..', '..', 'docker', 'sandbox.Dockerfile');
const SANDBOX_DOCKERFILE_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

async function imageExists(image) {
  try {
    const { code } = await runnerClient.exec('docker', ['image', 'inspect', image], { windowsHide: true });
    return code === 0;
  } catch {
    return false;
  }
}

let imageEnsurePromise = null;

export async function ensureSandboxImage() {
  if (await imageExists(SANDBOX_IMAGE)) return SANDBOX_IMAGE;
  if (imageEnsurePromise) return imageEnsurePromise;

  imageEnsurePromise = (async () => {
    const done = log.startTimer();
    if (SANDBOX_IMAGE === 'homebase-sandbox:latest') {
      const { enabled: enabledTools } = readToolchainConfig();
      const buildArgs = toolchainBuildArgs(enabledTools);
      log.info('building sandbox image', { image: SANDBOX_IMAGE, toolchains: enabledTools });
      const { code, stderr } = await runnerClient.exec(
        'docker',
        ['build', '-f', SANDBOX_DOCKERFILE, ...buildArgs, '-t', SANDBOX_IMAGE, SANDBOX_DOCKERFILE_DIR],
        { windowsHide: true, maxBuffer: DEFAULT_MAX_BUFFER, timeout: 600_000 }
      );
      if (code !== 0) throw new Error(`Build failed: ${stderr}`);
    } else {
      log.info('pulling sandbox image', { image: SANDBOX_IMAGE });
      const { code, stderr } = await runnerClient.exec('docker', ['pull', SANDBOX_IMAGE], {
        windowsHide: true,
        maxBuffer: DEFAULT_MAX_BUFFER,
        timeout: 600_000,
      });
      if (code !== 0) throw new Error(`Pull failed: ${stderr}`);
    }
    log.info('sandbox image ready', { image: SANDBOX_IMAGE, ms: done() });
    return SANDBOX_IMAGE;
  })().finally(() => { imageEnsurePromise = null; });

  return imageEnsurePromise;
}
