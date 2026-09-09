import { spawn } from 'child_process';
import { runnerClient } from '../runner/client.js';
import { createLogger } from '../logger.js';
import { ensureSandbox } from './lifecycle.js';
import { containerWorkdir, WORKDIR } from './naming.js';

const log = createLogger('sandbox-execution');
const DEFAULT_EXEC_TIMEOUT = 120_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

export async function execInSandbox(hostPath, command, options = {}) {
  const { name } = await ensureSandbox(hostPath, options);
  const workdir = containerWorkdir(options.cwd);
  const args = ['exec', '-w', workdir, name, 'bash', '-lc', command];
  const cmdPreview = command.length > 120 ? `${command.slice(0, 120)}…` : command;
  const done = log.startTimer();
  log.debug('exec', { name, workdir, command: cmdPreview });
  try {
    const { stdout, stderr, code } = await runnerClient.exec('docker', args, {
      windowsHide: true,
      timeout: options.timeoutMs || DEFAULT_EXEC_TIMEOUT,
      maxBuffer: options.maxBuffer || DEFAULT_MAX_BUFFER,
    });
    if (code === 0) {
      log.info('exec ok', { name, command: cmdPreview, code: 0, ms: done() });
      return { stdout, stderr, code: 0 };
    }
    log.info('exec non-zero exit', { name, command: cmdPreview, code: code ?? 1, ms: done() });
    return {
      stdout: stdout || '',
      stderr: stderr || '',
      code: code ?? 1,
    };
  } catch (err) {
    if (err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      log.warn('exec timed out', { name, command: cmdPreview, ms: done() });
      const e = new Error(`Command timed out after ${options.timeoutMs || DEFAULT_EXEC_TIMEOUT}ms`);
      e.timedOut = true;
      throw e;
    }
    log.info('exec non-zero exit', { name, command: cmdPreview, code: typeof err.code === 'number' ? err.code : 1, ms: done() });
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      code: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

export function spawnSandboxShell(name, options = {}) {
  const workdir = options.cwd ? containerWorkdir(options.cwd) : WORKDIR;
  return spawn('docker', ['exec', '-i', '-w', workdir, name, 'bash', '-li'], {
    windowsHide: true,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });
}

export function sandboxShellArgv(name, options = {}) {
  const workdir = options.cwd ? containerWorkdir(options.cwd) : WORKDIR;
  return ['exec', '-it', '-w', workdir, name, 'bash', '-li'];
}

export const OPENCODE_RUN_MAX_PROMPT_CHARS = 4000;
export const OPENCODE_DEFAULT_MODEL = 'opencode/muse-spark-1.3-contributor-free';

/**
 * argv for a headless OpenCode run inside the sandbox. The prompt travels
 * as a single argv element (no shell quoting). The model flag keeps the
 * default explicit so container config drift can never silently switch
 * models. Auth comes from the container environment (toolchain keys
 * injected at create time).
 */
export function sandboxAgentArgv(name, prompt, options = {}) {
  const task = String(prompt || '').trim();
  if (!task) throw new Error('Agent run requires a non-empty prompt');
  if (task.length > OPENCODE_RUN_MAX_PROMPT_CHARS) {
    throw new Error(`Agent prompt exceeds ${OPENCODE_RUN_MAX_PROMPT_CHARS} characters`);
  }
  const model = String(options.model || process.env.OPENCODE_DEFAULT_MODEL || OPENCODE_DEFAULT_MODEL).trim();
  const workdir = options.cwd ? containerWorkdir(options.cwd) : WORKDIR;
  return ['exec', '-it', '-w', workdir, name, 'opencode', 'run', '--model', model, task];
}
