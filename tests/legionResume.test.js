import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Legion picks a run up after a restart: it saves where it is as it works
// (state.json), and at start-up a run still marked running carries on with
// its done jobs kept. Models are stood in for by a scripted function.

jest.unstable_mockModule('../server/legion/modelCall.js', () => ({
  callModel: jest.fn(),
  cleanModelSpec: (spec) => (spec?.provider && spec?.model ? { provider: spec.provider, model: spec.model } : null),
}));

const { runLegion } = await import('../server/legion/loop.js');
const { readRun, runningLegions, startRun, stopRun } = await import('../server/legion/runs.js');
const { MAX_RESUMES, RESTARTED, TOO_MANY, resumeLegions } = await import('../server/legion/resume.js');
const { STATE_FILE, checkpointOf, resumePoint } = await import('../server/legion/checkpoint.js');
const { parseSpecYaml } = await import('../server/legion/spec.js');
const { runFolder, saveJson } = await import('../server/legion/workspace.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'legion-resume-'));
const model = { provider: 'ollama', model: 'standin' };
const models = Object.fromEntries(['architect', 'research', 'foresight', 'echo', 'foundation', 'nexus', 'atlas', 'genesis'].map((r) => [r, model]));
const { spec } = parseSpecYaml([
  'goal: A tip calculator',
  'jobs:',
  '  - { id: J-001, owner: foundation, task: README }',
  '  - { id: J-002, owner: genesis, task: index.html with the tip }',
  'checks:',
  '  - { id: C-001, job: J-002, file_exists: index.html }',
].join('\n'));
const wait = async (ok, ms = 3000) => {
  const until = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > until) throw new Error('waited too long');
    await new Promise((r) => { setTimeout(r, 10); });
  }
};
const onDisk = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8')); } catch { return null; } };
const readState = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')); } catch { return null; } };

/** A scripted team. `hold` makes Genesis wait until released (or Stop). */
function team({ hold = false } = {}) {
  const calls = [];
  let release = () => {};
  const held = new Promise((r) => { release = r; });
  const ask = async ({ label, prompt, signal }) => {
    calls.push(label);
    const say = (text) => ({ text, model: 'standin', ms: 1 });
    if (label === 'foundation') return say('=== FILE: README.md\nOpen index.html.\n=== END\nNOTES: done');
    if (label === 'genesis') {
      if (hold) {
        await Promise.race([held, new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('Stopped.'), { stopped: true })), { once: true });
        })]);
      }
      return say('=== FILE: index.html\n<p>Tip: $3</p>\n=== END\nNOTES: page made');
    }
    if (label === 'echo') return say('{"verdict":"OK","summary":"Works."}');
    if (label === 'architect' && prompt.startsWith('Global post-project')) return say('{"agents":[],"learned":"Keep it simple."}');
    throw new Error(`unexpected turn for ${label}`);
  };
  const look = async () => ({ ok: true, page: 'index.html', png: Buffer.from('png'), text: 'Tip: $3', errors: [] });
  const commit = jest.fn(async () => ({ committed: true, sha: 'abc1234' }));
  const runner = (args) => runLegion({ ...args, ask, look, commit });
  return { calls, runner, commit, release: () => release() };
}

/** A run folder as a restart leaves it: run.json says running, state.json says where. */
async function savedRun(root, userId, point, { startedAt = new Date().toISOString(), resumes = 0 } = {}) {
  const id = `${Date.now()}-abc123`;
  const dir = runFolder(userId, id, root);
  fs.mkdirSync(path.join(dir, 'project'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project', 'README.md'), 'Open index.html.');
  await saveJson(path.join(dir, 'run.json'), { id, goal: 'A tip calculator', models, status: 'running', viewToken: 'a'.repeat(32), startedAt, events: [{ at: 1, type: 'phase', phase: 'build' }] });
  if (point !== undefined) {
    await saveJson(path.join(dir, STATE_FILE), typeof point === 'string' ? point : {
      ...point, userId, goal: 'A tip calculator', models, askFirst: true, selfEducate: false, resumes,
    });
  }
  return { id, dir };
}

const midBuild = () => {
  const jobs = spec.jobs.map((j) => ({ ...j, status: j.id === 'J-001' ? 'done' : 'working', attempt: 1 }));
  return checkpointOf({ phase: 'build', plan: { summary: 'Tip page' }, spec, jobs, chat: [{ role: 'foundation', text: 'J-001 done' }] });
};

describe('Legion picks up after a restart', () => {
  test('saves where it is after a job finishes', async () => {
    const root = tmp();
    const { runner, release } = team({ hold: true });
    const run = await startRun({ userId: 'r1', account: {}, goal: 'A tip calculator', models, spec, selfEducate: false, root, runner });
    const dir = runFolder('r1', run.id, root);
    // The save after J-001 can land before J-002 starts, so wait for the save that shows both.
    await wait(() => {
      const jobs = readState(dir)?.jobs;
      return jobs?.find((j) => j.id === 'J-001')?.status === 'done' && jobs?.find((j) => j.id === 'J-002')?.status === 'working';
    });
    const state = readState(dir);
    expect(state).toMatchObject({ phase: 'build', userId: 'r1', goal: 'A tip calculator', resumes: 0, selfEducate: false });
    expect(state.jobs.find((j) => j.id === 'J-002').status).toBe('working');
    expect(state.specYaml).toContain('J-002');
    release();
    // Writes go one at a time, so the last checkpoint lands even if run.json says done first.
    await wait(() => onDisk(dir)?.status === 'done' && readState(dir)?.phase === 'reflect');
    // run.json is filled in when each queued write runs, so an earlier write can
    // already say done while the last one is in flight. Every write still ends:
    // a temp file left behind would never go away and this wait would fail.
    await wait(() => !fs.readdirSync(dir).some((f) => f.endsWith('.tmp')));
  });

  test('a run saved mid-build carries on: done jobs are not run again, cut-off jobs are', async () => {
    const root = tmp();
    const { id, dir } = await savedRun(root, 'r2', midBuild());
    const { calls, runner, commit, release } = team({ hold: true });
    const done = await resumeLegions({ root, accountFor: async (userId) => ({ userId }), runner });
    expect(done).toEqual([{ id, resumed: true, why: '' }]);
    expect(runningLegions().map((r) => r.id)).toContain(id);
    release();
    await wait(async () => (await readRun({ userId: 'r2', id, root })).status !== 'running');
    const read = await readRun({ userId: 'r2', id, root });
    expect(read.status).toBe('done');
    expect(read.viewToken).toBe('a'.repeat(32));
    expect(calls).not.toContain('foundation');
    expect(calls.filter((c) => c === 'genesis')).toHaveLength(1);
    expect(calls[0]).toBe('genesis'); // no planning, no questions
    expect(commit).toHaveBeenCalledTimes(1);
    expect(read.events[0]).toMatchObject({ type: 'phase', phase: 'build' }); // the old log is kept
    expect(read.events.some((e) => e.type === 'note' && /Picked up where it left off after a restart/.test(e.text))).toBe(true);
    // The status above is the live run's; its saves land one at a time after it.
    await wait(() => readState(dir)?.resumes === 1);
  });

  test('Stop works on a picked-up run', async () => {
    const root = tmp();
    const { id } = await savedRun(root, 'r3', midBuild());
    const { runner } = team({ hold: true });
    await resumeLegions({ root, accountFor: async (userId) => ({ userId }), runner });
    await wait(() => runningLegions().some((r) => r.id === id));
    expect(stopRun({ userId: 'r3', id })).toBe(true);
    await wait(async () => (await readRun({ userId: 'r3', id, root })).status !== 'running');
    expect((await readRun({ userId: 'r3', id, root })).status).toBe('stopped');
  });

  test(`a run cut off ${MAX_RESUMES} times already is ended instead of picked up again`, async () => {
    const root = tmp();
    const { id } = await savedRun(root, 'r4', midBuild(), { resumes: MAX_RESUMES });
    const runner = jest.fn();
    expect(await resumeLegions({ root, runner, accountFor: async () => ({}) })).toEqual([{ id, resumed: false, why: TOO_MANY }]);
    expect(runner).not.toHaveBeenCalled();
    const read = await readRun({ userId: 'r4', id, root });
    expect(read).toMatchObject({ status: 'error', error: TOO_MANY });
    expect(read.events.at(-1)).toMatchObject({ type: 'end', status: 'error' });
    // Ended for good: the next start leaves it alone.
    expect(await resumeLegions({ root, runner, accountFor: async () => ({}) })).toEqual([]);
  });

  test('a run older than a day is not picked up', async () => {
    const root = tmp();
    const { id } = await savedRun(root, 'r5', midBuild(), { startedAt: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString() });
    const runner = jest.fn();
    expect(await resumeLegions({ root, runner, accountFor: async () => ({}) })).toEqual([{ id, resumed: false, why: RESTARTED }]);
    expect(runner).not.toHaveBeenCalled();
    expect((await readRun({ userId: 'r5', id, root })).status).toBe('error');
  });

  test('a damaged or missing state file ends that run without stopping the start-up', async () => {
    const root = tmp();
    const half = await savedRun(root, 'r6', '{"phase":"bu');
    const none = await savedRun(path.join(root), 'r7', undefined);
    fs.mkdirSync(path.join(root, 'r8', '9-bad'), { recursive: true });
    fs.writeFileSync(path.join(root, 'r8', '9-bad', 'run.json'), '{"status":"runn');
    fs.writeFileSync(path.join(root, 'stray.txt'), 'x');
    const runner = jest.fn();
    const done = await resumeLegions({ root, runner, accountFor: async () => ({}) });
    expect(done.map((d) => d.id).sort()).toEqual([half.id, none.id].sort());
    expect(done.every((d) => !d.resumed && d.why === RESTARTED)).toBe(true);
    expect(runner).not.toHaveBeenCalled();
    expect(await resumeLegions({ root: path.join(root, 'nothing-here'), runner })).toEqual([]);
  });

  test('where a saved run carries on', () => {
    const at = (point) => resumePoint(JSON.parse(JSON.stringify(point)), 3);
    const jobs = spec.jobs.map((j) => ({ ...j, status: 'done', attempt: 1 }));
    expect(at(checkpointOf({ phase: 'plan', spec, jobs: [] }))).toBeNull();
    expect(at(checkpointOf({ phase: 'build', spec: null, jobs: [] }))).toBeNull();
    expect(at(midBuild())).toMatchObject({ step: 'build', round: 0 });
    expect(at(midBuild()).jobs.map((j) => j.status)).toEqual(['done', 'queued']);
    expect(at(checkpointOf({ phase: 'check', round: 2, spec, jobs }))).toMatchObject({ step: 'check', round: 2 });
    // A fix round cut off before its fixes were handed out checks the round before again.
    expect(at(checkpointOf({ phase: 'fix', round: 2, spec, jobs }))).toMatchObject({ step: 'check', round: 1 });
    const sentBack = jobs.map((j) => (j.id === 'J-002' ? { ...j, status: 'queued', fix: 'Show the tip.' } : j));
    const fixRound = at(checkpointOf({ phase: 'fix', round: 2, spec, jobs: sentBack }));
    expect(fixRound).toMatchObject({ step: 'check', round: 2 });
    expect(fixRound.jobs.find((j) => j.id === 'J-002')).toMatchObject({ status: 'queued', fix: 'Show the tip.' });
    expect(at(checkpointOf({ phase: 'reflect', round: 1, spec, jobs, verdict: { verdict: 'OK', summary: 'Works.' } })))
      .toMatchObject({ step: 'end', verdict: { verdict: 'OK' } });
    expect(at(checkpointOf({ phase: 'check', round: 99, spec, jobs })).round).toBe(3);
  });
});
