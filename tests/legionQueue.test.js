import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Legion slice two, from the Orchestrator Engine diagram: a YAML spec,
// a Work Queue with a UID on every job, agents pulling from it side by side,
// and a Validation Engine that checks the result against the YAML.

jest.unstable_mockModule('../server/legion/modelCall.js', () => ({
  callModel: jest.fn(),
  cleanModelSpec: (spec) => (spec?.provider && spec?.model ? { provider: spec.provider, model: spec.model } : null),
}));

const { pathsOverlap, runQueue } = await import('../server/legion/queue.js');
const { parseSpecYaml, specToYaml, withBuildOrder } = await import('../server/legion/spec.js');
const { runChecks, failedJobs } = await import('../server/legion/validate.js');
const { runLegion } = await import('../server/legion/loop.js');
const { makeRunFolders } = await import('../server/legion/workspace.js');
const { parseStart } = await import('../server/legion/runs.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'legion-queue-'));
const model = { provider: 'ollama', model: 'standin' };
const job = (id, owner, dependsOn = []) => ({ id, owner, task: `do ${id}`, dependsOn, status: 'queued', attempt: 0 });
const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

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

  test('a contract job waits on nobody, and every job without depends_on waits on it', () => {
    const { spec } = parseSpecYaml([
      'goal: CRM', 'jobs:',
      '  - { id: J-001, owner: nexus, task: shapes, contract: true, depends_on: [J-003], files: [contract/, contract/] }',
      '  - { id: J-002, owner: atlas, task: api, files: [server] }',
      '  - { id: J-003, owner: genesis, task: page, depends_on: [J-002] }',
      '  - { id: J-004, owner: foundation, task: setup, contract: true }',
    ].join('\n'));
    const byId = (id) => spec.jobs.find((j) => j.id === id);
    expect(byId('J-001')).toMatchObject({ contract: true, dependsOn: [], files: ['contract'] });
    expect(byId('J-002')).toMatchObject({ dependsOn: ['J-001'], files: ['server'] });
    expect(byId('J-003').dependsOn).toEqual(['J-002']);
    expect(byId('J-004').dependsOn).toEqual(['J-001']);
    expect(byId('J-004').contract).toBeUndefined();
    // The build order leaves the contract job alone, and the YAML keeps files and the contract.
    expect(withBuildOrder(spec.jobs).find((j) => j.id === 'J-001').dependsOn).toEqual([]);
    expect(parseSpecYaml(specToYaml(spec)).spec).toEqual(spec);
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

  // The saved place (state.json) is written on every change. A job finishing
  // and the job it frees starting are one change, so no save shows the freed
  // job still waiting while nothing is running.
  test('a job finishing and the job it frees are reported as one change', async () => {
    const jobs = [job('J-1', 'foundation'), job('J-2', 'genesis', ['J-1'])];
    const seen = [];
    await runQueue({ jobs, runJob: async () => 'ok', onChange: (all) => seen.push(all.map((j) => j.status).join(',')) });
    expect(seen).toEqual(['working,queued', 'done,working', 'done,done']);
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

  test('two jobs that own the same file or folder never run at the same time', async () => {
    expect(pathsOverlap('src', 'src/app.js')).toBe(true);
    expect(pathsOverlap('src', 'src2/app.js')).toBe(false);
    const jobs = [
      { ...job('J-1', 'genesis'), files: ['src'] },
      { ...job('J-2', 'genesis'), files: ['src/app.js'] },
      { ...job('J-3', 'genesis'), files: ['README.md'] },
      job('J-4', 'genesis'),
    ];
    const live = new Set();
    const seen = [];
    await runQueue({ jobs, runJob: async (j) => { live.add(j.id); seen.push([...live]); await pause(10); live.delete(j.id); } });
    expect(seen.some((ids) => ids.includes('J-1') && ids.includes('J-2'))).toBe(false);
    expect(seen.some((ids) => ['J-1', 'J-3', 'J-4'].every((id) => ids.includes(id)))).toBe(true);
    expect(jobs.every((j) => j.status === 'done')).toBe(true);
  });

  test('in waves, the next wave waits for the last one, and the step between can change a waiting job', async () => {
    const jobs = [job('J-1', 'nexus'), job('J-2', 'genesis', ['J-1']), job('J-3', 'genesis', ['J-1']), job('J-4', 'genesis')];
    const waves = [];
    const ran = [];
    await runQueue({
      jobs, concurrency: 1,
      runJob: async (j) => { ran.push(j.task); await pause(5); },
      afterWave: async (ended) => { waves.push(ended.map((j) => j.id)); jobs[1].task = 'changed'; },
    });
    // J-1 and J-4 were ready together; there is no step after the last wave.
    expect(waves).toEqual([['J-1', 'J-4']]);
    expect(ran).toEqual(['do J-1', 'do J-4', 'changed', 'do J-3']);
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

describe('Legion with owned files', () => {
  test('a builder cannot write a file another job owns, and the job says so', async () => {
    const dir = tmp();
    await makeRunFolders(dir);
    const events = [];
    const ask = async ({ label, prompt }) => {
      const say = (text) => ({ text, model: 'standin', ms: 1 });
      if (label === 'nexus') return say('=== FILE: contract/shapes.json\n{"contact":["name"]}\n=== END');
      if (label === 'genesis' && prompt.includes('Job J-002')) {
        expect(prompt).toContain('Files this job owns: index.html');
        return say('=== FILE: index.html\n<p>hi</p>\n=== END\n=== FILE: contract/shapes.json\nbroken\n=== END\n=== FILE: notes.txt\nfree\n=== END');
      }
      if (label === 'genesis') return say('=== FILE: app.js\nx()\n=== END');
      if (label === 'echo') return say('{"verdict":"OK","summary":"Fine."}');
      return say('{}');
    };
    const { spec } = parseSpecYaml([
      'goal: CRM', 'jobs:',
      '  - { id: J-001, owner: nexus, task: shapes, contract: true, files: [contract] }',
      '  - { id: J-002, owner: genesis, task: page, files: [index.html] }',
      '  - { id: J-003, owner: genesis, task: script, files: [app.js] }',
    ].join('\n'));
    await runLegion({
      goal: spec.goal, spec, models: { architect: model }, account: {}, dir, emit: (e) => events.push(e), ask, replan: false, selfEducate: false,
      look: async () => ({ ok: false, reason: 'No browser' }), commit: async () => ({ committed: true, sha: 'a' }),
    });
    const project = path.join(dir, 'project');
    expect(fs.readFileSync(path.join(project, 'contract', 'shapes.json'), 'utf8')).toContain('contact');
    expect(fs.readFileSync(path.join(project, 'notes.txt'), 'utf8')).toBe('free\n'); // nobody owns it
    const last = events.filter((e) => e.type === 'queue').pop().jobs;
    expect(last.find((j) => j.id === 'J-002').note).toMatch(/Not saved: contract\/shapes\.json \(J-001 owns it\)/);
    expect(events.some((e) => e.type === 'note' && /J-002 also wrote contract\/shapes\.json/.test(e.text))).toBe(true);
  });
});
