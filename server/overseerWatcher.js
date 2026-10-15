import { spawn } from 'child_process';
import { getSecret } from './secrets.js';
import { resolveOverseerRunner } from './overseer/runner.js';

// Overseer Watcher Singleton State
const state = {
  isRunning: false,
  isAuditing: false,
  countdown: 3600, // 1 hour default (in seconds)
  intervalSeconds: 3600, // 1 hour
  repo: process.env.OVERSEER_DEFAULT_REPO || '',
  lastRunTime: null,
  lastRunStatus: 'idle', // 'idle' | 'running' | 'success' | 'failed'
  logs: '',
  // Off until the user turns it on: when on, each run merges ready PRs.
  autoMerge: false,
  timerId: null
};

// Start the daemon timer loop
export function startWatcher(repo = state.repo, interval = state.intervalSeconds, { autoMerge = false } = {}) {
  if (state.timerId) {
    clearInterval(state.timerId);
  }

  state.isRunning = true;
  state.repo = repo;
  state.intervalSeconds = interval;
  state.autoMerge = autoMerge === true;
  state.countdown = interval;

  state.timerId = setInterval(() => {
    if (!state.isRunning) return;

    // If already running an audit, pause countdown
    if (state.isAuditing) return;

    state.countdown--;
    if (state.countdown <= 0) {
      runAuditNow();
    }
  }, 1000);
}

// Stop the daemon timer loop
export function stopWatcher() {
  state.isRunning = false;
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  state.countdown = state.intervalSeconds;
}

// Run the configured overseer script silently.
export function runAuditNow({ autoMerge } = {}) {
  if (state.isAuditing) return;
  if (typeof autoMerge === 'boolean') state.autoMerge = autoMerge;

  if (!state.repo) {
    state.lastRunStatus = 'failed';
    state.logs += `[${new Date().toLocaleString()}] Overseer needs a target repository.\n`;
    return;
  }

  state.isAuditing = true;
  state.lastRunStatus = 'running';
  state.lastRunTime = new Date().toISOString();

  const formattedTime = new Date().toLocaleString();
  state.logs = `[${formattedTime}] Starting Overseer run for ${state.repo} (${state.autoMerge ? 'merges ready pull requests' : 'checks only, merges nothing'})...\n`;

  const token = getSecret('GITHUB_TOKEN') || process.env.GITHUB_TOKEN;

  const runner = resolveOverseerRunner({
    scriptPath: process.env.OVERSEER_SCRIPT_PATH,
    cwd: process.env.OVERSEER_SCRIPT_CWD,
    repo: state.repo,
    autoMerge: state.autoMerge,
  });
  const child = spawn(runner.executable, runner.args, {
    cwd: runner.cwd,
    env: {
      ...process.env,
      GITHUB_TOKEN: token
    },
    windowsHide: true,
  });

  child.stdout.on('data', (data) => {
    state.logs += data.toString();
    // Keep logs size reasonable in memory (max 100KB)
    if (state.logs.length > 100_000) {
      state.logs = state.logs.slice(state.logs.length - 50_000);
    }
  });

  child.stderr.on('data', (data) => {
    state.logs += data.toString();
    if (state.logs.length > 100_000) {
      state.logs = state.logs.slice(state.logs.length - 50_000);
    }
  });

  child.on('close', (code) => {
    state.isAuditing = false;
    state.lastRunStatus = code === 0 ? 'success' : 'failed';
    const completionTime = new Date().toLocaleString();
    state.logs += `\n[${completionTime}] Overseer run finished with code: ${code}.\n`;
    
    // Reset countdown to the interval so it counts down again
    if (state.isRunning) {
      state.countdown = state.intervalSeconds;
    }
  });

  child.on('error', (err) => {
    state.isAuditing = false;
    state.lastRunStatus = 'failed';
    const errorTime = new Date().toLocaleString();
    state.logs += `\n[${errorTime}] Failed to launch Overseer script: ${err.message}\n`;
    
    // Reset countdown
    if (state.isRunning) {
      state.countdown = state.intervalSeconds;
    }
  });
}

// Get the current status
export function getStatus() {
  return {
    isRunning: state.isRunning,
    isAuditing: state.isAuditing,
    countdown: state.countdown,
    intervalSeconds: state.intervalSeconds,
    repo: state.repo,
    autoMerge: state.autoMerge,
    lastRunTime: state.lastRunTime,
    lastRunStatus: state.lastRunStatus,
    logs: state.logs
  };
}
