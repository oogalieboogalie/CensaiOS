import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Self-fix: check a fix ourselves instead of taking the agent's word for it.
 * The fix's worktree borrows node_modules from the real copy (a link, never a
 * second install), then Jest runs every test related to the changed files.
 */

const VERIFY_TIMEOUT_MS = 6 * 60 * 1000;

function hasJest(dir) {
  return fs.existsSync(path.join(dir, 'node_modules', 'jest', 'bin', 'jest.js'));
}

/** Link node_modules into a worktree so the agent and the check can run tests there. */
export function linkNodeModules(worktreeDir, candidates) {
  const target = path.join(worktreeDir, 'node_modules');
  if (fs.existsSync(target)) return true;
  const source = candidates.filter(Boolean).find(hasJest);
  if (!source) return false;
  try {
    fs.symlinkSync(path.join(source, 'node_modules'), target, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}

/**
 * Take the link out again before anything else touches the worktree, so no
 * later cleanup can follow it into the real node_modules.
 */
export function unlinkNodeModules(worktreeDir) {
  const target = path.join(worktreeDir, 'node_modules');
  try {
    if (!fs.lstatSync(target).isSymbolicLink()) return;
  } catch {
    return;
  }
  try { fs.unlinkSync(target); } catch { try { fs.rmdirSync(target); } catch { /* leave it */ } }
}

function run(command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = (chunk) => { output = (output + chunk.toString()).slice(-6000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { child.kill('SIGKILL'); output += '\n[stopped: took too long]'; }, timeoutMs);
    timer.unref?.();
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, output: `${output}\n${err.message}` }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
}

/**
 * Returns { ran, ok, tests, output }. `ran: false` means there was nothing to
 * run the tests with (no node_modules with Jest), not that the fix is bad.
 */
export async function verifyFix({ worktreeDir, files, env = process.env, timeoutMs = VERIFY_TIMEOUT_MS }) {
  const changed = files.filter((f) => f.change !== 'deleted' && /\.(c|m)?jsx?$/.test(f.path)).map((f) => f.path);
  if (!changed.length) return { ran: false, ok: false, tests: 0, output: 'The fix changed no code files.' };
  if (!hasJest(worktreeDir)) return { ran: false, ok: true, tests: 0, output: 'No test runner here; the agent\'s own test run is all we have.' };

  const childEnv = { PATH: env.PATH, HOME: env.HOME, USERPROFILE: env.USERPROFILE, SystemRoot: env.SystemRoot, NODE_ENV: 'test', CI: '1' };
  for (const file of changed.filter((f) => /^server\/.*\.m?js$/.test(f))) {
    const check = await run(process.execPath, ['--check', file], { cwd: worktreeDir, env: childEnv, timeoutMs: 30_000 });
    if (check.code !== 0) return { ran: true, ok: false, tests: 0, output: check.output };
  }
  const jest = path.join('node_modules', 'jest', 'bin', 'jest.js');
  const result = await run(process.execPath, [
    '--experimental-vm-modules', jest, '--findRelatedTests', ...changed, '--passWithNoTests', '--forceExit', '--ci',
  ], { cwd: worktreeDir, env: childEnv, timeoutMs });
  const tests = Number((result.output.match(/Tests:\s+(?:\d+ \w+, )*(\d+) total/) || [])[1]) || 0;
  return { ran: true, ok: result.code === 0, tests, output: result.output.slice(-3000) };
}
