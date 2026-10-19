// Censai the orchestrator: checking a family agent's work against its job's
// checklist before the person hears about it. Each item is checked off only
// after Censai checked it itself: a file item by finding the file in the
// project (projectFiles.js), a tests item by running the project's own tests
// (projectTests.js), every other item by reading the reply against it. What
// the agent really did comes from its tool calls, not its words: files it
// changed, tests it ran, calls that failed.

import { DOC_FILE, agentName, clip } from './shape.js';
import { addTestsItem, checklistOf, checklistVerdict, reopenChecklist, setItem, tickCount, tickWords } from './checklist.js';
import { parseItemReview, reviewMessages } from './prompts.js';

// Tools that change files on this computer, where the project's tests can see it.
const LOCAL_WRITES = new Set(['project_write', 'project_edit', 'project_multi_edit', 'local_write_file', 'generate_tests']);
const SHELL = new Set(['sandbox_exec', 'terminal_run']);

function testRunPassed(result) {
  const text = String(result || '');
  if (/TEST RUN\s*\W*\s*SUCCESS/.test(text)) return true;
  if (/TEST RUN\s*\W*\s*FAILED|timed out/.test(text)) return false;
  return null;
}

const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The project a file tool really wrote to, from its own result ("Wrote src/a.js in date-badge. → ..."),
// so an unnamed or misnamed project in the call is not taken on its word.
function writtenProject(action, file) {
  const text = String(action.result_preview ?? action.result ?? '');
  const wrote = file ? new RegExp(`^(?:Wrote|Edited) ${escape(file)} in (.+?)(?: on \`[^\`]*\`)?\\. → `).exec(text) : null;
  const multi = /^Multi-edit: \d+\/\d+ files edited in (.+?)\.(?:\s|$)/.exec(text);
  return (wrote || multi)?.[1] || (action.args?.project ? String(action.args.project) : null);
}

// Why a step did not go through, from its result ("Error: CODE: words" -> the words).
function failureWhy(action) {
  const text = String(action.result_preview ?? action.result ?? '').trim();
  if (text.startsWith('APPROVAL_REQUIRED:')) return 'is waiting for an OK in Action Approvals';
  const why = text.replace(/^Error:\s*/, '').replace(/^[A-Z][A-Z_]{2,}:\s*/, '').replace(/[.\s]+$/, '');
  return why ? `did not go through: ${clip(why, 160)}` : 'did not go through';
}

/** What the agent's tool calls show: { files, projects, shell, failedTools, failures, agentTests }. */
export function readEvidence(toolActions = []) {
  const files = new Set();
  const projects = new Set();
  const failed = new Map();
  const agentTests = [];
  let shell = false;
  for (const action of Array.isArray(toolActions) ? toolActions : []) {
    const tool = action?.tool;
    if (!tool) continue;
    if (action.ok === false) {
      if (!failed.has(tool)) failed.set(tool, failureWhy(action));
      continue;
    }
    const args = action.args || {};
    if (LOCAL_WRITES.has(tool)) {
      const file = action.summary?.path || args.path || args.file_path;
      if (file) files.add(String(file));
      for (const edit of Array.isArray(args.edits) ? args.edits : []) if (edit?.path) files.add(String(edit.path));
      const project = writtenProject(action, file);
      if (project) projects.add(project);
    }
    if (SHELL.has(tool)) shell = true;
    if (tool === 'run_tests') agentTests.push(testRunPassed(action.result));
  }
  const failures = [...failed].map(([tool, why]) => ({ tool, why }));
  return { files: [...files], projects: [...projects], shell, failedTools: [...failed.keys()], failures, agentTests };
}

/** Plain lines about the agent's own work, for the read-over and the "What I checked" fold. */
export function workLines(evidence, job) {
  const name = agentName(job.agentId);
  const lines = [];
  if (evidence.files.length) {
    const shown = evidence.files.slice(0, 4).join(', ');
    lines.push(`${name} changed ${evidence.files.length === 1 ? '1 file' : `${evidence.files.length} files`}: ${shown}${evidence.files.length > 4 ? ' and more' : ''}.`);
  } else if (evidence.shell) {
    lines.push(`${name} ran commands in the project.`);
  } else if (job.kind === 'code') {
    lines.push(`${name} did not change any files.`);
  }
  if (evidence.agentTests.includes(false)) lines.push(`${name} ran the tests and they failed.`);
  else if (evidence.agentTests.includes(true)) lines.push(`${name} ran the tests and they passed.`);
  for (const { tool, why } of (evidence.failures || []).slice(0, 3)) lines.push(`${name}'s ${tool} ${why}.`);
  if (evidence.failedTools.length > 3) lines.push(`${evidence.failedTools.length - 3} more of ${name}'s steps did not go through.`);
  return lines;
}

/** A change any test could see: a command run, or a file that is not only words or pictures. */
export function needsTests(evidence) {
  return evidence.shell || evidence.files.some((file) => !DOC_FILE.test(file));
}

const merged = (before, now, max = 50) => [...new Set([...(Array.isArray(before) ? before : []), ...now])].slice(-max);

function stateOf(ok) {
  if (ok === true) return 'ticked';
  return ok === false ? 'failed' : 'unknown';
}

/**
 * Check one answer against the job's checklist, every item every round, so
 * a send-back carries everything that is not true yet. The test run covers
 * every file the job changed on any try, so a second try cannot pass by
 * leaving the first try's broken tests out. deps: { change(mutate) saves a
 * change, step(text, state, { settle }), findFile(item), runTests({ files,
 * projects, shell }), review(messages) -> text }. Returns { seen, verdict }
 * (checklist.js checklistVerdict).
 */
export async function checkAnswer({ job, answer, toolActions, deps }) {
  const name = agentName(job.agentId);
  const evidence = readEvidence(toolActions);
  const seen = workLines(evidence, job);
  await deps.change(() => {
    job.changed = merged(job.changed, evidence.files);
    job.wrote = merged(job.wrote, evidence.projects, 10);
    job.usedShell = Boolean(job.usedShell || evidence.shell);
    if (needsTests(evidence)) addTestsItem(job);
    reopenChecklist(job);
  });
  const items = checklistOf(job);
  await deps.step(items.length === 1 ? 'Checking the one item on the list' : `Checking all ${items.length} items on the list`, 'now');

  for (const item of items.filter((entry) => entry.how === 'file')) {
    await deps.change(() => setItem(item, 'checking', `Looking for ${item.path}`));
    const found = await deps.findFile(item);
    await deps.change(() => setItem(item, stateOf(found.exists), found.line));
  }

  const tested = items.filter((entry) => entry.how === 'tests');
  if (tested.length) {
    await deps.change(() => tested.forEach((item) => setItem(item, 'checking', 'Running the project\'s tests')));
    const tests = await deps.runTests({ files: job.changed, projects: job.wrote, shell: job.usedShell });
    // Not run but refused (changes made elsewhere): not true yet, so it goes back to be fixed.
    const state = tests.ran || tests.ok === false ? stateOf(tests.ok) : 'unknown';
    await deps.change(() => tested.forEach((item) => setItem(item, state, tests.line, tests.ok ? '' : tests.detail)));
    seen.push(tests.line);
  }

  const read = items.filter((entry) => entry.how === 'answer');
  if (read.length) {
    await deps.change(() => read.forEach((item) => setItem(item, 'checking', `Reading ${name}'s answer`)));
    let verdicts = new Map();
    let why = 'My read-over did not say whether this is true.';
    try {
      const reply = await deps.review(reviewMessages({ job, answer, items: read, seen }));
      verdicts = parseItemReview(reply, read.length);
    } catch (error) {
      why = `I could not read it over: ${clip(error?.message || 'the model did not answer', 160)}`;
    }
    await deps.change(() => read.forEach((item, index) => {
      const verdict = verdicts.get(index + 1);
      setItem(item, verdict ? stateOf(verdict.ok) : 'unknown', verdict ? verdict.sentence : why);
    }));
  }

  const { ticked, total } = tickCount(job);
  await deps.step(tickWords(job), ticked === total ? 'done' : 'bad', { settle: true });
  return { seen, verdict: checklistVerdict(job) };
}
