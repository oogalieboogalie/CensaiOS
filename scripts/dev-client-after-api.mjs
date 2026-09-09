const healthUrl = process.env.API_HEALTH_URL || 'http://127.0.0.1:3001/api/health';
const timeoutMs = Number(process.env.API_WAIT_TIMEOUT_MS || 45_000);
const startedAt = Date.now();

async function waitForApi() {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API did not become ready at ${healthUrl}`);
}

await waitForApi();
const { spawn } = await import('child_process');

const vite = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

vite.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
