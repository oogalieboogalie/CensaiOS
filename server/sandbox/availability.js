import { runnerClient } from '../runner/client.js';

let dockerAvailable = null;

export async function isDockerAvailable() {
  if (dockerAvailable !== null) return dockerAvailable;
  try {
    const { code, stdout } = await runnerClient.exec('docker', ['info', '--format', '{{.ServerVersion}}'], {
      windowsHide: true,
      timeout: 8000,
    });
    dockerAvailable = code === 0 && Boolean(stdout && stdout.trim());
  } catch {
    dockerAvailable = false;
  }
  return dockerAvailable;
}
