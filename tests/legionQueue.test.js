import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Legion slice two, from Alex's Orchestrator Engine diagram: a YAML spec,
// a Work Queue with a UID on every job, agents pulling from it side by side,
// and a Validation Engine that checks the result against the YAML.

jest.unstable_mockModule('../server/legion/modelCall.js', () => ({
  callModel: jest.fn(),
  cleanModelSpec: (spec) => (spec?.provider && spec?.model ? { provider: spec.provider, model: spec.model } : null),
}));

const { runQueue } = await import('../server/legion/queue.js');
const { parseSpecYaml, withBuildOrder } = await import('../server/legion/spec.js');
const { runChecks, failedJobs } = await import('../server/legion/validate.js');
const { runLegion } = await import('../server/legion/loop.js');
const { makeRunFolders } = await import('../server/legion/workspace.js');
const { parseStart } = await import('../server/legion/runs.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'legion-queue-'));
const model = { provider: 'ollama', model: 'standin' };
const job = (id, owner, dependsOn = []) => ({ id, owner, task: `do ${id}`, dependsOn, status: 'queued', attempt: 0 });

describe('YAML spec', () => {
  test('reads jobs and checks, and refuses a spec without jobs', () => {
    const { spec } = parseSpecYaml('goal: G\njobs:\n  - id: J-001\n    owner: genesis\n    task: page\nchecks:\n  - job: J-001\n    page_contains: Total\n  - job: J-001\n    nonsense: 1\n');
    expect(spec.jobs).toEqual([{ id: 'J-001', owner: 'genesis', task: 'page', dependsOn: [] }]);
    expect(spec.checks).toEqual([{ id: 'C-001', job: 'J-001', kind: 'page_contains', text: 'Total' }]);
    expect(parseSpecYaml('goal: G\njobs: []').error).toMatch(/at least one job/);
    expect(parseSpecYaml('goal: [unclosed').error).toMatch(/could not be read/);
    expect(parseSpecYaml('').spec).toBeNull();
  });

  test('jobs wait for the builders before them unless they say otherwise', () => {
    const jobs = withBuildOrder([job('J-1', 'genesis'), job('J-2', 'foundation'), job('J-3', 'genesis')]);
    expect(jobs.find((j) => j.id === 'J-1').dependsOn).toEqual(['J-2']);
    expect(jobs.find((j) => j.id === 'J-2').dependsOn).toEqual([]);
  });

  test('a start with only a YAML spec takes its goal from the spec', () => {
    const start = parseStart({ model, specYaml: 'goal: From YAML\njobs:\n  - owner: genesis\n    task: page\n' });
    expect(start.goal).toBe('From YAML');
    expect(start.spec.jobs[0].id).toBe('J-001');
    expect(parseStart({ model, goal: 'x', specYaml: 'jobs: nope' }).error).toMatch(/at least one job/);
  });
});

describe('Work Queue', () => {
  test('runs up to the limit at once and keeps dependencies in order', async () => {
    const jobs = [job('J-1', 'foundation'), job('J-2', 'genesis', ['J-1']), job('J-3', 'genesis', ['J-1']), job('J-4', 'genesis', ['J-1'])];
    let now = 0;
    let most = 0;
    const order = [];
    await runQueue({
      jobs, concurrency: 2,
      runJob: async (j) => { now += 1; most = Math.max(most, now); order.push(j.id); await new Promise((r) => setTimeout(r, 10)); now -= 1; },
    });
    expect(order[0]).toBe('J-1');
    expect(most).toBe(2);
    expect(jobs.every((j) => j.status === 'done')).toBe(true);
  });

  test('a job whose agent cannot answer ends the queue and blocks the jobs waiting on it', async () => {
    const jobs = [job('J-1', 'nexus'), job('J-2', 'genesis', ['J-1'])];
    await expect(runQueue({ jobs, runJob: async () => { throw new Error('no key'); } })).rejects.toThrow('no key');
    expect(jobs.map((j) => j.status)).toEqual(['failed', 'blocked']);
  });

  test('jobs that wait on each other are refused in the YAML and never hang the queue', async () => {
    const yaml = 'goal: G\njobs:\n  - id: J-1\n    owner: genesis\n    task: a\n    depends_on: [J-2]\n  - id: J-2\n    owner: genesis\n    task: b\n    depends_on: [J-1]\n';
    expect(parseSpecYaml(yaml).error).toMatch(/wait on each other/);
    const jobs = [job('J-1', 'genesis', ['J-2']), job('J-2', 'genesis', ['J-1'])];
    await runQueue({ jobs, runJob: async () => 'ok' });
    expect(jobs.map((j) => j.status)).toEqual(['blocked', 'blocked']);
  });

  test('ids in depends_on and checks are cleaned the same way as job ids', () => {
    const { spec } = parseSpecYaml('goal: G\njobs:\n  - id: J 1\n    owner: nexus\n    task: a\n  - id: J-2\n    owner: genesis\n    task: b\n    depends_on: ["J 1"]\nchecks:\n  - job: J 1\n    file_exists: a.js\n');
    expect(spec.jobs[1].dependsOn).toEqual(['J1']);
    expect(spec.checks[0].job).toBe('J1');
  });
});

describe('Validation Engine', () => {
  test('checks files and the page, and names the job UID that failed', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'index.html'), '<p>Tip</p>');
    const checks = [
      { id: 'C-1', job: 'J-2', kind: 'file_exists', file: 'index.html' },
      { id: 'C-2', job: 'J-2', kind: 'file_contains', file: 'index.html', text: 'Total' },
      { id: 'C-3', job: 'J-2', kind: 'page_contains', text: 'tip' },
      { id: 'C-4', job: 'J-2', kind: 'no_script_errors' },
    ];
    const results = await runChecks({ checks, projectDir: dir, seen: { ok: true, text: 'Tip', errors: ['Uncaught x'] } });
    expect(results.map((r) => r.ok)).toEqual([true, false, true, false]);
    const back = failedJobs({ results, verdict: null, jobs: [job('J-1', 'foundation'), job('J-2', 'genesis')] });
    expect([...back.keys()]).toEqual(['J-2']);
    expect(back.get('J-2')).toHaveLength(2);
  });
});

describe('Legion with a YAML spec', () => {
  test('skips planning, runs the jobs side by side, and a failed check overrides Echo\'s OK', async () => {
    const dir = tmp();
    await makeRunFolders(dir);
    const events = [];
    const turns = [];
    let genesisFixed = false;
    const ask = async ({ label, prompt }) => {
      turns.push(label);
      const say = (text) => ({ text, model: 'standin', ms: 1 });
      if (label === 'genesis' && prompt.includes('J-002') && prompt.includes('came back')) { genesisFixed = true; return say('=== FILE: b.txt\nTotal\n=== END'); }
      if (label === 'genesis' && prompt.includes('Job J-001')) return say('=== FILE: index.html\n<p>hi</p>\n=== END');
      if (label === 'genesis' && prompt.includes('Job J-002')) return say('=== FILE: b.txt\nnothing\n=== END');
      if (label === 'echo') return say('{"verdict":"OK","summary":"Looks fine."}');
      if (prompt.startsWith('The Validation Engine sent jobs back')) return say('{"fixes":{"J-002":"Write Total into b.txt."}}');
      return say('{}');
    };
    const { spec } = parseSpecYaml([
      'goal: Two pages', 'jobs:', '  - id: J-001', '    owner: genesis', '    task: index page', '  - id: J-002', '    owner: genesis', '    task: b file',
      'checks:', '  - id: C-001', '    job: J-002', '    file_contains: { file: b.txt, text: Total }',
    ].join('\n'));
    const outcome = await runLegion({
      goal: spec.goal, spec, models: { architect: model }, account: {}, dir, emit: (e) => events.push(e), ask,
      look: async () => ({ ok: false, reason: 'No browser' }), commit: async () => ({ committed: true, sha: 'a' }),
    });
    expect(turns).not.toContain('research');
    expect(genesisFixed).toBe(true);
    expect(events.filter((e) => e.type === 'verdict').map((e) => e.verdict)).toEqual(['NOK', 'OK']);
    expect(events.find((e) => e.type === 'verdict').summary).toMatch(/check from the YAML failed/);
    expect(outcome.status).toBe('done');
    // Both Genesis jobs were working at the same moment.
    const both = events.filter((e) => e.type === 'queue').some((e) => e.jobs.filter((j) => j.status === 'working').length === 2);
    expect(both).toBe(true);
  });
});
