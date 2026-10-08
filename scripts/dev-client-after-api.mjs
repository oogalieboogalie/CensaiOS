import { execSync } from 'node:child_process';

const healthUrl = process.env.API_HEALTH_URL || 'http://127.0.0.1:3001/api/health';
const timeoutMs = Number(process.env.API_WAIT_TIMEOUT_MS || 120_000);
const startedAt = Date.now();

// Who (if anyone) holds the API port? Printed verbatim on failure so a dead
// launch names the culprit instead of dying cryptically.
function portHolder(port) {
  try {
    if (process.platform !== 'win32') return null;
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const line = out.split('\n').map(l => l.trim()).filter(Boolean)
      .find(l => l.includes(`127.0.0.1:${port}`) || l.includes(`0.0.0.0:${port}`));
    if (!line) return null;
    const pid = line.split(/\s+/).pop();
    let name = '';
    try {
      name = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }).split('","')[0].replace(/"/g, '');
    } catch { /* name is best-effort */ }
    return { pid, name };
  } catch {
    return null;
  }
}

async function apiHealthy() {
  try {
    const response = await fetch(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApi() {
  for (;;) {
    if (await apiHealthy()) return true;
    if (Date.now() - startedAt > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// Refuse a double-boot, but ONLY when another instance is fully healthy.
// (A held-but-unhealthy port at this point is usually our own sibling server
// still booting — the wait below tells the two cases apart.)
if (await apiHealthy()) {
  const holder = portHolder(3001);
  console.error(
    `[dev] Port 3001 already serves a healthy API` +
    (holder ? ` (PID ${holder.pid}${holder.name ? `, ${holder.name}` : ''})` : '') +
    `. Another dev server is running — refusing to boot a second one. ` +
    `Run \`npm run kill\` (it waits for ports to free) and try again.`
  );
  process.exit(1);
}

if (!await waitForApi()) {
  const holder = portHolder(3001);
  if (holder) {
    console.error(
      `[dev] API never became healthy at ${healthUrl} after ${Math.round(timeoutMs / 1000)}s. ` +
      `Port 3001 is held by PID ${holder.pid}${holder.name ? ` (${holder.name})` : ''} — ` +
      `likely a stale process from a previous session. Run \`npm run kill\`, wait for ` +
      `"ports free", then relaunch. Giving up (not starting vite against a dead backend).`
    );
  } else {
    console.error(
      `[dev] API never became healthy at ${healthUrl} after ${Math.round(timeoutMs / 1000)}s ` +
      `and nothing holds port 3001 — the server ([0]) died during boot. ` +
      `Read its output above for the real error (EADDRINUSE, DB, or MCP spawn failure), fix, and relaunch.`
    );
  }
  process.exit(1);
}

const { spawn } = await import('child_process');

const vite = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

vite.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
