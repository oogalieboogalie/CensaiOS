// Legion: the loop from Alex's diagrams, start to finish.
//
//   1. Spec: the person's YAML (server/legion/spec.js), or the Orchestrator
//      Engine (the Architect) plans one (server/legion/plan.js): questions,
//      advice in the team chat, a gameplan, jobs with UIDs, checks.
//   2. Work Queue (server/legion/queue.js): Foundation, Nexus, Atlas and
//      Genesis pull jobs by UID, up to three at once; a job waits only on
//      the jobs it depends on (by default, the builders before it).
//   2b. Front and back at the same time (diagram 04, server/legion/combine.js):
//      Atlas and Genesis build side by side, then Synthesis joins them.
//   3. Validation Engine (server/legion/validate.js): a browser opens the
//      page and takes a screenshot, the spec's checks run, then Echo judges.
//   4. Failures go back to the Orchestrator Engine by job UID; it writes
//      fixing instructions, those jobs go back on the queue, and "FIX
//      GENERATED" goes back to validation. Repeats until it passes or the
//      rounds run out.
//   5. Pass: the project is committed with git.
//   6. Reflection: two positives and one negative per agent, and what was
//      learned, which the next Legion's Architect reads.
import path from 'node:path';
import fs from 'node:fs/promises';
import { BUILD_ORDER, PROMPTS, ROLES, contextBlock } from './roles.js';
import { cleanVerdict, parseFileBlocks, parseJsonReply } from './parse.js';
import { commitProject, filesForPrompt, listFiles, writeFiles } from './workspace.js';
import { lookAtProject } from './browser.js';
import { callModel } from './modelCall.js';
import { planProject } from './plan.js';
import { specToYaml, withBuildOrder } from './spec.js';
import { runQueue, snapshot } from './queue.js';
import { failedJobs, runChecks } from './validate.js';
import { selfEducate } from './educate.js';
import { memoryInMemory } from './memory.js';
import { combineFrontAndBack, needsCombine } from './combine.js';

export const MAX_FIX_ROUNDS = 3;
const str = (value, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Run a Legion. `emit` gets every step as an event. Returns the run's
 * outcome: { status, verdict, commit, reflection }.
 */
export async function runLegion({
  goal, models, account, dir, emit, signal, lessons = [], maxFixRounds = MAX_FIX_ROUNDS, spec: personSpec = null,
  ask = callModel, look = lookAtProject, commit = commitProject,
  askPerson = async () => '', search = async () => [], concurrency, selfEducate: educateFirst = true, memory = memoryInMemory(),
}) {
  const projectDir = path.join(dir, 'project');
  const modelFor = (role) => models[role] || models.architect;
  let plan = { summary: '', specs: {} };
  const chat = [];
  const say = (role, text) => {
    chat.push({ role, text: str(text, 1500) });
    emit({ type: 'say', role, text });
  };
  const stopIfAsked = () => { if (signal?.aborted) throw Object.assign(new Error('Stopped.'), { stopped: true }); };

  // Several jobs of one builder can run at once; its card says done only when the last one ends.
  const busy = {};
  async function turn(role, task, { images = [] } = {}) {
    stopIfAsked();
    busy[role] = (busy[role] || 0) + 1;
    emit({ type: 'role', role, status: 'working' });
    try {
      const reply = await ask({ spec: modelFor(role), account, system: contextBlock({ goal, role, plan, chat }), prompt: task, images, signal, label: role });
      busy[role] -= 1;
      if (!busy[role]) emit({ type: 'role', role, status: 'done', model: reply.model, ms: reply.ms });
      return reply.text;
    } catch (error) {
      busy[role] -= 1;
      emit({ type: 'role', role, status: 'error', note: error.message });
      throw error;
    }
  }

  // Jobs running side by side write one at a time, and an overwrite of another
  // job's file goes in the chat so the Validation Engine and Echo look at it.
  let writing = Promise.resolve();
  const lastWriter = new Map();

  // One job from the Work Queue: the builder writes its files and reports back.
  async function runJob(job) {
    const label = job.fix ? 'fix' : 'build';
    const instructions = job.fix
      ? `Job ${job.id} came back from the Validation Engine.\nYour job: ${job.task}\nFixing instructions from the Orchestrator Engine:\n${job.fix}`
      : `Job ${job.id} (only yours): ${job.task}\nOnly touch the files this job needs; other agents are working on other jobs at the same time.`;
    // Alex's self-educate loop: know enough? If not, memory and Research first.
    let educated = { learned: '', remember: '' };
    if (educateFirst) {
      try {
        educated = await selfEducate({ job, turn, emit, memory, search });
      } catch (error) {
        if (error.stopped) throw error;
        emit({ type: 'note', text: `${job.id}: self-educate did not work (${String(error.message).slice(0, 160)}), so it builds with what it knows.` });
      }
    }
    const task = [instructions, educated.learned, await filesForPrompt(projectDir), PROMPTS.build].filter(Boolean).join('\n\n');
    const { files, notes, remember } = parseFileBlocks(await turn(job.owner, task));
    const write = writing.then(() => writeFiles(projectDir, files));
    writing = write.catch(() => {});
    const written = await write;
    const clashes = written.filter((f) => lastWriter.get(f) && lastWriter.get(f) !== job.id);
    if (clashes.length) emit({ type: 'note', text: `${job.id} rewrote ${clashes.join(', ')}, which ${[...new Set(clashes.map((f) => lastWriter.get(f)))].join(', ')} wrote. The Validation Engine will check both jobs.` });
    for (const f of written) lastWriter.set(f, job.id);
    emit({ type: 'files', role: job.owner, job: job.id, files: written, notes, label });
    const keep = [{ text: educated.remember, from: 'research', job: job.id }, { text: remember, from: job.owner, job: job.id }].filter((k) => k.text);
    if (keep.length) {
      const added = await memory.store(keep, goal);
      if (added.length) emit({ type: 'remembered', job: job.id, notes: added });
    }
    // Work-done callback: the builder reports back to the team chat.
    chat.push({ role: job.owner, text: `${job.id} done (${label}): ${written.join(', ') || 'no files'}${notes ? `. ${notes}` : ''}` });
    return written.length ? `Wrote ${written.join(', ')}` : 'Wrote no files';
  }

  // 1. Spec.
  emit({ type: 'phase', phase: 'plan' });
  let spec = personSpec;
  if (spec) {
    plan = { summary: spec.goal, answers: '', gameplan: {}, specs: {} };
    say('architect', `Working from your YAML spec: ${spec.jobs.length} job${spec.jobs.length === 1 ? '' : 's'} and ${spec.checks.length} check${spec.checks.length === 1 ? '' : 's'}.`);
  } else {
    const team = { turn, say, emit, setPlan: (next) => { plan = next; } };
    ({ plan, spec } = await planProject({ goal, team, lessons, askPerson: (q) => { stopIfAsked(); return askPerson(q, signal); }, search }));
  }
  const yamlText = specToYaml(spec);
  await fs.writeFile(path.join(projectDir, 'legion.yaml'), yamlText, 'utf8');
  emit({ type: 'spec', yaml: yamlText, from: personSpec ? 'person' : 'orchestrator' });
  const jobs = withBuildOrder(spec.jobs).map((job) => ({ ...job, status: 'queued', attempt: 0 }));
  for (const role of BUILD_ORDER) {
    if (!jobs.some((j) => j.owner === role)) emit({ type: 'role', role, status: 'skipped', note: 'No jobs for this builder.' });
  }
  const queueChanged = () => emit({ type: 'queue', jobs: snapshot(jobs) });

  // 2. Work Queue.
  emit({ type: 'phase', phase: 'build' });
  queueChanged();
  await runQueue({ jobs, runJob, onChange: queueChanged, concurrency, stopIfAsked });
  if (needsCombine(jobs)) {
    const joined = await combineFrontAndBack({ projectDir, turn, emit, buildPrompt: PROMPTS.build });
    chat.push({ role: 'architect', text: `Synthesis joined front and back: ${joined.files.join(', ') || 'they already fit'}${joined.notes ? `. ${joined.notes}` : ''}` });
  }

  // 3 + 4. Validation Engine, and fixes by job UID until it passes.
  let verdict = null;
  for (let round = 0; round <= maxFixRounds; round += 1) {
    stopIfAsked();
    emit({ type: 'phase', phase: 'check', round });
    const files = await listFiles(projectDir);
    const shotName = `round-${round}.png`;
    const seen = await look({ projectDir, files, shotPath: path.join(dir, 'shots', shotName), signal });
    stopIfAsked();
    emit({ type: 'shot', round, shot: seen.ok ? shotName : null, page: seen.page || null, reason: seen.reason || '', errors: seen.errors || [] });
    const results = await runChecks({ checks: spec.checks, projectDir, seen });
    emit({ type: 'checks', round, results });
    const evidence = [
      seen.ok
        ? `The browser opened ${seen.page}. Screenshot attached. Page text: ${seen.text || '(none)'}\nScript errors: ${seen.errors.length ? seen.errors.join(' | ') : 'none'}`
        : `No screenshot: ${seen.reason}`,
      results.length ? `The Validation Engine's checks from the YAML:\n${results.map((r) => `- ${r.id} (${r.job}) ${r.ok ? 'PASS' : 'FAIL'}: ${r.detail}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');
    const jobList = jobs.map((j) => `${j.id} (${ROLES[j.owner].name}): ${j.task}`).join('\n');
    const judged = await turn('echo', [PROMPTS.judge, `Jobs:\n${jobList}`, evidence, await filesForPrompt(projectDir)].join('\n\n'),
      { images: seen.ok ? [seen.png] : [] });
    const echo = cleanVerdict(judged, BUILD_ORDER);
    const failedChecks = results.filter((r) => !r.ok);
    const pass = echo.verdict === 'OK' && !failedChecks.length;
    verdict = { ...echo, verdict: pass ? 'OK' : 'NOK', summary: !pass && echo.verdict === 'OK' ? `Echo was happy, but ${failedChecks.length} check${failedChecks.length === 1 ? '' : 's'} from the YAML failed.` : echo.summary };
    emit({ type: 'verdict', round, ...verdict, echo: echo.verdict, failedChecks: failedChecks.map((r) => r.id) });
    chat.push({ role: 'echo', text: `${verdict.verdict}: ${verdict.summary}` });
    if (pass || round === maxFixRounds) break;

    emit({ type: 'phase', phase: 'fix', round: round + 1 });
    const back = failedJobs({ results, verdict: echo.verdict === 'OK' ? null : echo, jobs });
    if (!back.size) for (const job of jobs.slice(-1)) back.set(job.id, [verdict.summary]);
    const todo = [...back].map(([id, problems]) => `- ${id} (${ROLES[jobs.find((j) => j.id === id).owner].name}): ${problems.join(' / ')}`).join('\n');
    const fixes = parseJsonReply(await turn('architect', `${PROMPTS.fix}\n\nFailed jobs:\n${todo}`))?.fixes || {};
    for (const [id, problems] of back) {
      const job = jobs.find((j) => j.id === id);
      job.fix = `${str(fixes[id]) || 'Fix what failed.'}\nWhat failed: ${problems.join(' / ')}`;
      job.status = 'queued';
    }
    emit({ type: 'fixes', round: round + 1, fixes: Object.fromEntries([...back.keys()].map((id) => [id, str(fixes[id]) || 'Fix what failed.'])) });
    await runQueue({ jobs, runJob, onChange: queueChanged, concurrency, stopIfAsked });
    say('architect', `FIX GENERATED for ${[...back.keys()].join(', ')}. Back to the Validation Engine.`);
  }

  // 5. Commit when Echo said OK.
  let committed = null;
  if (verdict?.verdict === 'OK') {
    emit({ type: 'phase', phase: 'commit' });
    await fs.writeFile(path.join(projectDir, 'legion.yaml'), yamlText, 'utf8'); // the spec as agreed, even if a builder touched it
    committed = await commit(projectDir, `Legion: ${plan.summary || goal}`);
    emit({ type: 'commit', ...committed });
  }

  // 6. Reflection.
  emit({ type: 'phase', phase: 'reflect' });
  let reflection = null;
  try {
    const story = `Outcome: Echo said ${verdict?.verdict || 'nothing'}${verdict?.summary ? ` (${verdict.summary})` : ''}. Agents: ${Object.values(ROLES).map((r) => r.name).join(', ')}.`;
    const json = parseJsonReply(await turn('architect', `${PROMPTS.reflect}\n\n${story}`)) || {};
    reflection = {
      agents: (Array.isArray(json.agents) ? json.agents : []).slice(0, 8).map((a) => ({
        role: str(a?.role, 40), positives: (Array.isArray(a?.positives) ? a.positives : []).slice(0, 2).map((p) => str(p, 300)), negative: str(a?.negative, 300),
      })),
      learned: str(json.learned, 1200),
    };
    emit({ type: 'reflection', ...reflection });
  } catch (error) {
    if (error.stopped) throw error;
    say('architect', `The reflection could not be written: ${error.message}`);
  }
  return { status: verdict?.verdict === 'OK' ? 'done' : 'unfinished', verdict, commit: committed, reflection };
}
