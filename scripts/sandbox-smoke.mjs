// Live smoke test for the Docker sandbox manager.
// Usage: node scripts/sandbox-smoke.mjs
import { isDockerAvailable, ensureSandbox, execInSandbox, stopSandbox } from '../server/sandbox/index.js';

const hostPath = process.cwd();

console.log('Docker available:', isDockerAvailable());
if (!isDockerAvailable()) {
  console.error('Docker is not available — start Docker Desktop and retry.');
  process.exit(1);
}

console.log(`Ensuring sandbox for: ${hostPath}`);
const { name, created } = await ensureSandbox(hostPath);
console.log(`Container: ${name} (created: ${created})`);

const checks = [
  'uname -a',
  'pwd && ls -1 | head -5',
  'node --version && python3 --version && git --version',
  'echo "agent-can-write" > .sandbox-smoke.txt && cat .sandbox-smoke.txt && rm .sandbox-smoke.txt',
];

for (const cmd of checks) {
  const { stdout, stderr, code } = await execInSandbox(hostPath, cmd);
  console.log(`\n$ ${cmd}\n[exit ${code}]`);
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.log('STDERR:', stderr.trim());
}

if (process.argv.includes('--cleanup')) {
  console.log('\nRemoving sandbox container…');
  await stopSandbox(hostPath);
  console.log('Removed.');
} else {
  console.log('\n(Leaving container running. Re-run with --cleanup to remove it.)');
}
