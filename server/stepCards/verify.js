// Step cards: checking one step's checks for real, so a dot turns green only
// when the thing is true now. A "file" check looks in the project folder (or
// in the coding agent's own worktree when the step went to one), a "run"
// check runs the project's own npm test or script (owner only, a plain
// environment with none of this app's keys), and an "ask" check has Censai
// read the helper's report against the sentence, PASS or FAIL in capitals.
// Results: [{ id, ok: true | false | null, line }]. ok null means it could
// not be checked, with the reason; it never turns a dot green.

import fs from 'node:fs/promises';
import path from 'node:path';
import { isAllowedCommand } from '../../src/lib/stepCards/todoFile.js';
import { parseItemReview } from '../censaiOrchestrator/prompts.js';
import { plainEnv, testCounts } from '../censaiOrchestrator/projectTests.js';
import { runCommand } from '../tools/handlers/runnerUtils.js';
import { scrubText } from '../selfFix/scrubText.js';

export const RUN_TIMEOUT_MS = Math.max(30_000, Number(process.env.STEP_CARDS_RUN_TIMEOUT_MS) || 10 * 60 * 1000);
const MAX_READ = 2 * 1024 * 1024;
const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The file inside the folder, or null when the path would leave it. */
export function insideFolder(cwd, rel) {
  const target = path.resolve(cwd, String(rel || ''));
  const inside = path.relative(cwd, target);
  return inside && !inside.startsWith('..') && !path.isAbsolute(inside) ? target : null;
}

export async function checkFile(cwd, check, { stat = fs.stat, readFile = fs.readFile, realpath = fs.realpath } = {}) {
  const outside = { ok: null, line: `I only look inside the project, and ${check.path} is outside it.` };
  const target = insideFolder(cwd, check.path);
  if (!target) return outside;
  let info;
  try {
    // A link that points out of the project is outside it, wherever it sits.
    if (!insideFolder(await realpath(cwd), await realpath(target))) return outside;
    info = await stat(target);
  } catch {
    return { ok: false, line: `${check.path} is not in the project yet.` };
  }
  if (!check.says) return { ok: true, line: `Found ${check.path}${info.isDirectory() ? ' (a folder)' : ''}.` };
  if (info.isDirectory()) return { ok: false, line: `${check.path} is a folder, so it cannot say anything.` };
  if (!info.isFile()) return { ok: null, line: `${check.path} is not a plain file, so I did not read it.` };
  if (info.size > MAX_READ) return { ok: null, line: `${check.path} is too big for me to read through.` };
  const text = String(await readFile(target, 'utf8'));
  return text.includes(check.says)
    ? { ok: true, line: `${check.path} says "${clip(check.says, 80)}".` }
    : { ok: false, line: `${check.path} does not say "${clip(check.says, 80)}" yet.` };
}

/** The npm scripts in a folder's package.json, as text to compare ('' when there are none). */
export async function scriptsOf(folder, { readFile = fs.readFile } = {}) {
  try {
    return JSON.stringify(JSON.parse(String(await readFile(path.join(folder, 'package.json'), 'utf8'))).scripts || {});
  } catch {
    return '';
  }
}

/**
 * Run one allowed npm command. trustFrom: the project folder a coding agent's worktree
 * came from; its scripts must match the worktree's, so an agent cannot change what
 * "npm test" runs and have the owner's check run it.
 */
export async function checkRun(cwd, check, { run = runCommand, now = Date.now, trustFrom = null, readFile = fs.readFile } = {}) {
  if (!isAllowedCommand(check.command)) return { ok: null, line: 'I only run the project\'s own npm test or npm run scripts.' };
  if (trustFrom && (await scriptsOf(cwd, { readFile })) !== (await scriptsOf(trustFrom, { readFile }))) {
    return { ok: null, line: 'The helper changed the project\'s npm scripts, so I will not run them. Put them back, then check again.' };
  }
  const args = check.command.split(' ').slice(1);
  const startedAt = now();
  let result;
  try {
    result = await run('npm', args, { cwd, timeout: RUN_TIMEOUT_MS, env: plainEnv() });
  } catch (error) {
    if (/Dangerous execution is disabled/.test(error?.message || '')) return { ok: null, line: 'Running commands is turned off on this computer, so I could not run it.' };
    if (/RUNNER_SECRET|Runner error/.test(error?.message || '')) return { ok: null, line: 'The command runner on this computer is not set up, so I could not run it.' };
    return { ok: null, line: `I could not run it: ${clip(error?.message || 'the runner did not answer', 160)}` };
  }
  if (typeof result?.code === 'string' && !/^\d+$/.test(result.code)) {
    return { ok: null, line: `npm did not start on this computer (${result.code.slice(0, 40)}).` };
  }
  const counts = testCounts(`${result?.stdout || ''}\n${result?.stderr || ''}`);
  const tests = counts.total ? ` (${counts.total} test${counts.total === 1 ? '' : 's'})` : '';
  if (result?.code === 0 || result?.code === '0') return { ok: true, line: `${check.command} passed${tests}.` };
  if (now() - startedAt >= RUN_TIMEOUT_MS - 1000) return { ok: false, line: `${check.command} took longer than ${Math.round(RUN_TIMEOUT_MS / 60000)} minutes, so I stopped it.` };
  const detail = scrubText(String(result?.stderr || result?.stdout || '').trim().split('\n').slice(-3).join(' '));
  return { ok: false, line: `${check.command} failed${counts.failed ? ` (${counts.failed} of ${counts.total} tests)` : ''}: ${clip(detail, 160) || 'no output'}` };
}

const REVIEW_RULES = [
  'You are Censai, checking a step of work before the person hears it is done.',
  'Judge each numbered sentence on its own against the helper\'s report and what censaiOS saw while checking.',
  'Be strict: a sentence passes only if the report shows it is true now. "Will do", "should work", a guess or a missing piece is a FAIL.',
  'Reply with one line per sentence and nothing else: its number, PASS or FAIL, then one short plain sentence for the person, no jargon.',
].join(' ');

export function askMessages({ step, asks, report, seen = [] }) {
  const body = [
    `Step: ${clip(step.title, 160)}`,
    step.text ? clip(step.text, 1200) : null,
    '',
    'Sentences to judge:',
    ...asks.map((check, index) => `${index + 1}. ${clip(check.statement, 300)}`),
    '',
    'The helper\'s report:',
    clip(report, 6000) || '(nothing)',
    seen.length ? `\nWhat censaiOS saw while checking:\n${seen.map((line) => `- ${line}`).join('\n')}` : null,
  ].filter((line) => line != null).join('\n');
  return [{ role: 'system', content: REVIEW_RULES }, { role: 'user', content: body }];
}

/**
 * Check every check on one step. ctx: { cwd, report, isOwner() -> bool, complete(messages) -> text,
 * trustFrom (the project a worktree came from), skipRuns (an automatic check never runs commands) }.
 * Files and runs go first, so Censai's read-over sees what they found.
 */
export async function verifyStep({ step, checks, ctx, deps = {} }) {
  const results = new Map();
  const seen = [];
  for (const check of checks.filter((c) => c.kind === 'file')) {
    const r = ctx.cwd ? await checkFile(ctx.cwd, check, deps) : { ok: null, line: ctx.noFolder };
    results.set(check.id, r);
    seen.push(r.line);
  }
  const runs = checks.filter((c) => c.kind === 'run');
  const owner = runs.length ? await ctx.isOwner() : false;
  for (const check of runs) {
    let r;
    if (!ctx.cwd) r = { ok: null, line: ctx.noFolder };
    else if (!owner) r = { ok: null, line: 'Only this computer\'s owner can run checks that run commands.' };
    else if (ctx.skipRuns) r = { ok: null, line: 'Commands only run when you press Check this step.' };
    else r = await checkRun(ctx.cwd, check, { ...deps, trustFrom: ctx.trustFrom || null });
    results.set(check.id, r);
    seen.push(r.line);
  }
  const asks = checks.filter((c) => c.kind === 'ask');
  if (asks.length) {
    const report = clip(ctx.report, 6000);
    let verdicts = new Map();
    let why = 'Nothing to read yet. Send this step to a helper, or paste what was done, then check again.';
    if (report) {
      why = 'My read-over did not say whether this is true.';
      try {
        verdicts = parseItemReview(await ctx.complete(askMessages({ step, asks, report, seen })), asks.length);
      } catch (error) {
        why = `I could not read it over: ${clip(error?.message || 'the model did not answer', 160)}`;
      }
    }
    asks.forEach((check, index) => {
      const v = verdicts.get(index + 1);
      results.set(check.id, v ? { ok: v.ok, line: v.sentence } : { ok: null, line: why });
    });
  }
  return checks.map((check) => ({ id: check.id, ...(results.get(check.id) || { ok: null, line: 'I do not know how to check this.' }) }));
}
