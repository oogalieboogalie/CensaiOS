import { runnerClient } from '../../../runner/client.js';

const MAX_BUFFER = 10 * 1024 * 1024;
const MAX_OUTPUT = 6000;
const USE_SHELL = process.platform === 'win32';

export function truncate(value, max = MAX_OUTPUT) {
  const text = String(value || '');
  return text.length <= max ? text : `${text.slice(0, max)}\n... [truncated at ${max} chars]`;
}

export async function runGit(cwd, args, opts = {}) {
  try {
    const { stdout, stderr, code } = await runnerClient.exec('git', args, {
      cwd,
      shell: USE_SHELL,
      windowsHide: true,
      timeout: opts.timeout || 60000,
      maxBuffer: MAX_BUFFER,
    });
    return { ok: code === 0, stdout: stdout || '', stderr: stderr || '', exitCode: code ?? 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: err.message || '',
      exitCode: 1,
    };
  }
}

export function formatCommandResult(label, result) {
  return [
    `${label} — ${result.ok ? 'OK' : `FAILED (${result.exitCode})`}`,
    result.stdout.trim() ? `STDOUT:\n${truncate(result.stdout.trim())}` : null,
    result.stderr.trim() ? `STDERR:\n${truncate(result.stderr.trim())}` : null,
  ].filter(Boolean).join('\n');
}

export async function runNpm(cwd, args, timeout = 120000) {
  try {
    const { stdout, stderr, code } = await runnerClient.exec('npm', args, {
      cwd,
      shell: USE_SHELL,
      windowsHide: true,
      timeout,
      maxBuffer: MAX_BUFFER,
    });
    return { ok: code === 0, stdout: stdout || '', stderr: stderr || '', exitCode: code ?? 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: err.message || '',
      exitCode: 1,
    };
  }
}
