// Censai the orchestrator: run the project's own tests for a checklist's
// tests item, the same way an agent's run_tests does (through the runner,
// owner only), so a result is checked instead of taken on its word. The tests
// run in the plan's project, and only vouch for changes made there. Jest
// projects run the tests related to every file the job changed, on any try
// (all of them when none is related); anything else runs its whole test
// script. The child gets a plain environment, never this app's keys.

import path from 'node:path';
import pool from '../db.js';
import { assertHostToolAllowed } from '../tools/rbac/hostOwnerOnly.js';
import { ownerNamesSentence } from '../security/ownerNames.js';
import { readPackageJson, resolveRunnerContext, runCommand } from '../tools/handlers/runnerUtils.js';
import { scrubText } from '../selfFix/scrubText.js';
import { agentName } from './shape.js';

export const TEST_TIMEOUT_MS = Math.max(30_000, Number(process.env.CENSAI_TEST_TIMEOUT_MS) || 10 * 60 * 1000);
const CODE_FILE = /\.(c|m)?[jt]sx?$/;
// Only plain file names go on the command line (it runs through a shell on Windows).
const PLAIN_PATH = /^[\w@./+-]+$/;
const KEEP_ENV = ['PATH', 'Path', 'PATHEXT', 'HOME', 'USERPROFILE', 'SystemRoot', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'];

export function plainEnv(env = process.env) {
  const out = { NODE_ENV: 'test', CI: '1' };
  for (const key of KEEP_ENV) if (env[key]) out[key] = env[key];
  return out;
}

function tail(text, max = 1500) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  const out = value.slice(-max);
  return /^[\udc00-\udfff]/.test(out) ? out.slice(1) : out;
}

/** Test counts from Jest, Vitest or TAP (node --test) output: { total, failed } (0 when unknown). */
export function testCounts(output) {
  const text = String(output || '');
  const jest = /Tests:\s+([^\n]*?)(\d+) total/.exec(text);
  if (jest) return { total: Number(jest[2]), failed: Number((/(\d+) failed/.exec(jest[1]) || [])[1]) || 0 };
  const vitest = /Tests\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed/.exec(text);
  if (vitest) return { total: Number(vitest[2]) + (Number(vitest[1]) || 0), failed: Number(vitest[1]) || 0 };
  const tap = /^# tests (\d+)\s*$/m.exec(text);
  if (tap) return { total: Number(tap[1]), failed: Number((/^# fail (\d+)\s*$/m.exec(text) || [])[1]) || 0 };
  return { total: 0, failed: 0 };
}

const tests = (count) => `${count} test${count === 1 ? '' : 's'}`;

function blocked(line) {
  return { ran: false, ok: null, blocked: true, line };
}

/** Why this person cannot run tests on this computer (only its owner can), or null when they can. */
export async function whyTestsCannotRun(db, context = {}) {
  try {
    await assertHostToolAllowed(db, { name: 'run_tests', args: {}, context });
    return null;
  } catch (error) {
    return error?.code === 'COMPUTER_OWNER_ONLY'
      ? ['I could not run the tests: only this computer\'s owner can run them.', ownerNamesSentence(error.names)].filter(Boolean).join(' ')
      : `I could not run the tests: ${error?.message || 'the check failed'}`;
  }
}

/** Changed files as paths inside the project, code files only. */
export function codeFilesIn(cwd, files = []) {
  return files
    .filter((file) => CODE_FILE.test(file))
    .map((file) => (path.isAbsolute(file) ? path.relative(cwd, file) : file).replace(/\\/g, '/'))
    .filter((file) => file && !file.startsWith('..'));
}

async function runOnce({ args, cwd, run, now, signal }) {
  const startedAt = now();
  let result;
  try {
    result = await run('npm', args, { cwd, timeout: TEST_TIMEOUT_MS, env: plainEnv(), ...(signal ? { signal } : {}) });
  } catch (error) {
    if (/Dangerous execution is disabled/.test(error?.message || '')) return blocked('I could not run the tests: running commands is turned off on this computer.');
    return blocked(`I could not run the tests: ${String(error?.message || 'the runner did not answer').slice(0, 160)}`);
  }
  if (result?.code === 'ABORT_ERR') return blocked('The test run was stopped.');
  if (result?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return blocked('The tests wrote more output than I can read, so I could not tell how they went.');
  // A word instead of an exit number (ENOENT and the like): npm itself did not start.
  if (typeof result?.code === 'string' && !/^\d+$/.test(result.code)) {
    return blocked(`I could not run the tests: npm did not start on this computer (${result.code.slice(0, 40)}).`);
  }
  const output = `${result?.stdout || ''}\n${result?.stderr || ''}`;
  const counts = testCounts(output);
  const detail = scrubText(tail(output));
  if ((result?.code ?? 0) === 0) {
    return { ran: true, ok: true, blocked: false, ...counts, detail: '', line: counts.total ? `The project's tests passed (${tests(counts.total)}).` : 'The project\'s tests passed.' };
  }
  if (now() - startedAt >= TEST_TIMEOUT_MS - 1000) {
    return { ran: true, ok: false, blocked: false, ...counts, detail, line: `The tests took longer than ${Math.round(TEST_TIMEOUT_MS / 60000)} minutes, so I stopped them.` };
  }
  const which = counts.failed ? ` (${counts.failed} of ${counts.total} failed)` : '';
  return { ran: true, ok: false, blocked: false, ...counts, detail, line: `The project's tests failed${which}.` };
}

/** The project's folder on this computer: { cwd }, or { why } in plain words when its tests cannot run here. */
async function folderFor({ agentId, project, context, resolve }) {
  try {
    return { cwd: (await resolve(agentId, { project }, context)).cwd };
  } catch (error) {
    const message = String(error?.message || '');
    if (/GitHub-backed/.test(message)) return { why: `The project "${project}" lives on GitHub, so I can't run its tests on this computer.` };
    if (/local path/.test(message)) return { why: `The project "${project}" has no folder on this computer, so I can't run its tests here.` };
    return { why: `I could not find the project "${project}" to run its tests.` };
  }
}

/** Why the agent's project cannot run its tests on this computer, or null when it can. */
export async function whyNoTestsHere({ agentId, project, context = {}, resolve = resolveRunnerContext }) {
  return (await folderFor({ agentId, project, context, resolve })).why || null;
}

/** The project's test script before the job starts ('' when it has none), or null when it cannot be read. */
export async function readTestScript({ agentId, project, context = {}, resolve = resolveRunnerContext, readPkg = readPackageJson }) {
  const folder = await folderFor({ agentId, project, context, resolve });
  if (folder.why) return null;
  const pkg = await readPkg(folder.cwd);
  return String(pkg?.scripts?.test || '');
}

const notHere = (line) => ({ ran: false, ok: false, blocked: false, line });

/**
 * { ran, ok, blocked, line, detail, total, failed }. ran: false means the
 * tests did not run: blocked here, by this computer; ok: null, nothing could
 * be checked; ok: false, they could not vouch for the change (files changed
 * in another project, or the test script itself changed since the job began).
 * projects: where the agent's file tools wrote. expectScript: the test script
 * before the job (readTestScript).
 */
export async function runProjectTests({
  agentId, project = null, files = [], projects = [], shell = false, expectScript = null, signal = null,
  context = {}, db = pool, run = runCommand, now = Date.now, resolve = resolveRunnerContext, readPkg = readPackageJson,
}) {
  const owner = await whyTestsCannotRun(db, context);
  if (owner) return blocked(owner);
  const name = agentName(agentId);
  const wrote = [...new Set(projects.filter(Boolean))];
  const target = project || (wrote.length === 1 ? wrote[0] : null);
  if (!target) {
    return blocked(wrote.length ? `${name} changed files in more than one project (${wrote.join(', ')}), so I could not test them in one go.` : 'I could not tell which project to run the tests in.');
  }
  const folder = await folderFor({ agentId, project: target, context, resolve });
  if (folder.why) return blocked(folder.why);
  const { cwd } = folder;
  const elsewhere = [];
  for (const other of wrote) {
    if (other !== target && (await folderFor({ agentId, project: other, context, resolve })).cwd !== cwd) elsewhere.push(other);
  }
  const outside = files.filter((file) => {
    const inside = path.relative(cwd, file);
    return path.isAbsolute(file) && (inside.startsWith('..') || path.isAbsolute(inside));
  });
  if (elsewhere.length || outside.length) {
    return notHere(`${name} changed files outside ${target} (${[...elsewhere, ...outside].slice(0, 3).join(', ')}), so its tests can't vouch for them. Keep the changes in ${target}.`);
  }
  const pkg = await readPkg(cwd);
  const script = String(pkg?.scripts?.test || '');
  if (expectScript && script !== expectScript) {
    return notHere(`${name} changed how the project's tests run (the test script in package.json), so a pass would not prove anything. Put it back the way it was.`);
  }
  if (!script || /no test specified/.test(script)) return { ran: false, ok: null, blocked: false, line: 'This project has no tests set up, so I could not run any.' };
  const code = codeFilesIn(cwd, files);
  const jest = /\bjest\b/.test(script) || Boolean(pkg?.devDependencies?.jest || pkg?.dependencies?.jest);
  const related = jest && code.length > 0 && code.every((file) => PLAIN_PATH.test(file)) && !shell;
  const first = await runOnce({ args: related ? ['test', '--', '--findRelatedTests', ...code, '--passWithNoTests'] : ['test'], cwd, run, now, signal });
  // No test covers the changed files: run them all, so a pass means something.
  if (related && first.ran && first.ok && !first.total && !signal?.aborted) return runOnce({ args: ['test'], cwd, run, now, signal });
  return first;
}
