import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Legion: the Architect plans, builders work in order, Echo judges with a
// screenshot, NOK goes round the fix loop, OK commits, and a reflection is
// written. Models are stood in for by a scripted function (no keys in CI).

jest.unstable_mockModule('../server/legion/modelCall.js', () => ({
  callModel: jest.fn(),
  cleanModelSpec: (spec) => (spec?.provider && spec?.model ? { provider: spec.provider, model: spec.model } : null),
}));

const { runLegion } = await import('../server/legion/loop.js');
const { cleanVerdict, parseFileBlocks, parseJsonReply, safeRelativePath } = await import('../server/legion/parse.js');
const { commitProject, makeRunFolders } = await import('../server/legion/workspace.js');
const { parseStart, readRun, startRun, viewFilePath } = await import('../server/legion/runs.js');
const { baseArgs, entryPage, findBrowser, serveProject } = await import('../server/legion/browser.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'legion-test-'));
const model = { provider: 'ollama', model: 'standin' };

function scriptedTeam() {
  let echoTurns = 0;
  const calls = [];
  const ask = async ({ label, prompt, images }) => {
    calls.push({ label, images: images.length });
    const say = (text) => ({ text, model: 'standin', ms: 1 });
    if (label === 'architect' && prompt.startsWith('Write a first plan')) return say('{"summary":"A tip calculator page."}');
    if (['research', 'foresight', 'echo'].includes(label) && prompt.includes('give your advice')) return say('```json\n{"notes":["Keep it one page"]}\n```');
    if (label === 'architect' && prompt.startsWith('You are the Orchestrator Engine')) {
      return say(JSON.stringify({
        summary: 'One-page tip calculator.',
        jobs: [{ id: 'J-001', owner: 'foundation', task: 'README with how to open it' }, { id: 'J-002', owner: 'genesis', task: 'index.html with a bill box and a tip result' }],
        checks: [{ id: 'C-001', job: 'J-002', file_exists: 'index.html' }, { id: 'C-002', job: 'J-002', page_contains: 'Tip:' }],
      }));
    }
    if (label === 'foundation') return say('=== FILE: README.md\nOpen index.html.\n=== END\nNOTES: nothing to install');
    if (label === 'genesis' && prompt.includes('came back from the Validation Engine')) {
      return say('=== FILE: index.html\n<h1>Tip calculator</h1><p id="tip">Tip: $3.00</p>\n=== END\nNOTES: fixed');
    }
    if (label === 'genesis') return say('=== FILE: index.html\n<h1>Tip calculator</h1>\n=== END\nNOTES: page made');
    if (label === 'echo') {
      echoTurns += 1;
      return say(echoTurns === 1
        ? '{"verdict":"NOK","summary":"No tip result shown.","todo":[{"job":"J-002","owner":"genesis","problem":"Show the tip","file":"index.html","line":1}]}'
        : '{"verdict":"OK","summary":"Works."}');
    }
    if (label === 'architect' && prompt.startsWith('The Validation Engine sent jobs back')) return say('{"fixes":{"J-002":"Add the tip result under the title."}}');
    if (label === 'architect' && prompt.startsWith('Global post-project')) {
      return say('{"agents":[{"role":"genesis","positives":["fast","clean"],"negative":"forgot the result"}],"learned":"Check the result is on screen."}');
    }
    throw new Error(`unexpected turn for ${label}`);
  };
  return { ask, calls };
}

describe('Legion loop', () => {
  test('plans, builds in order, fixes after NOK, commits after OK, and reflects', async () => {
    const dir = tmp();
    await makeRunFolders(dir);
    const events = [];
    const { ask, calls } = scriptedTeam();
    const look = jest.fn(async ({ files, shotPath, projectDir }) => {
      fs.writeFileSync(shotPath, 'png');
      const html = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8').replace(/<[^>]+>/g, ' ');
      return { ok: true, page: entryPage(files), png: Buffer.from('png'), text: html, errors: [] };
    });
    const commit = jest.fn(async () => ({ committed: true, sha: 'abc1234' }));
    const models = Object.fromEntries(['architect', 'research', 'foresight', 'echo', 'foundation', 'nexus', 'atlas', 'genesis'].map((r) => [r, model]));
    const outcome = await runLegion({ goal: 'a tip calculator', models, account: {}, dir, emit: (e) => events.push(e), ask, look, commit });

    expect(outcome.status).toBe('done');
    expect(outcome.verdict.verdict).toBe('OK');
    expect(fs.readFileSync(path.join(dir, 'project', 'index.html'), 'utf8')).toContain('Tip: $3.00');
    expect(commit).toHaveBeenCalledTimes(1);
    const order = calls.map((c) => c.label);
    expect(order.indexOf('foundation')).toBeLessThan(order.indexOf('genesis'));
    expect(events.filter((e) => e.type === 'role' && e.status === 'skipped').map((e) => e.role)).toEqual(['nexus', 'atlas']);
    expect(events.filter((e) => e.type === 'verdict').map((e) => e.verdict)).toEqual(['NOK', 'OK']);
    expect(events.some((e) => e.type === 'say' && /FIX GENERATED for J-002/.test(e.text))).toBe(true);
    // The spec was saved as YAML with the project, and the checks ran.
    expect(fs.readFileSync(path.join(dir, 'project', 'legion.yaml'), 'utf8')).toMatch(/page_contains: .?Tip:/);
    const checks = events.filter((e) => e.type === 'checks');
    expect(checks[0].results.find((r) => r.id === 'C-002').ok).toBe(false);
    expect(checks[1].results.every((r) => r.ok)).toBe(true);
    // J-002 went back on the queue by its UID and ran a second time.
    const lastQueue = events.filter((e) => e.type === 'queue').pop().jobs;
    expect(lastQueue.find((j) => j.id === 'J-002')).toMatchObject({ status: 'done', attempt: 2 });
    // Echo saw the screenshot both times.
    expect(calls.filter((c) => c.label === 'echo' && c.images === 1)).toHaveLength(2);
    expect(events.find((e) => e.type === 'reflection').learned).toBe('Check the result is on screen.');
  });

  test('stops after the last fix round without committing when Echo never says OK', async () => {
    const dir = tmp();
    await makeRunFolders(dir);
    const ask = async ({ label, prompt }) => ({
      text: label === 'echo' && !prompt.includes('advice') ? '{"verdict":"NOK","todo":[{"owner":"genesis","problem":"Still broken"}]}'
        : label === 'genesis' ? '=== FILE: index.html\n<p>x</p>\n=== END' : '{}',
      model: 'standin', ms: 1,
    });
    const commit = jest.fn();
    const outcome = await runLegion({
      goal: 'x', models: { architect: model }, account: {}, dir, emit: () => {}, ask, commit, maxFixRounds: 1,
      look: async () => ({ ok: false, reason: 'No browser' }),
    });
    expect(outcome.status).toBe('unfinished');
    expect(commit).not.toHaveBeenCalled();
  });

  test('asks clarifying questions; with no answer Research searches the web and answers them', async () => {
    const dir = tmp();
    await makeRunFolders(dir);
    const events = [];
    const systems = [];
    const ask = async ({ label, prompt, system }) => {
      systems.push({ label, system });
      const say = (text) => ({ text, model: 'standin', ms: 1 });
      if (prompt.startsWith('Write a first plan')) return say('{"summary":"A site.","questions":["Which colors?"]}');
      if (label === 'research' && prompt.startsWith('Nobody answered')) return say('{"answers":["Black and gold, per the search."]}');
      if (label === 'research') return say('{"notes":["Use plain HTML"]}');
      if (label === 'foresight') return say('{"notes":["Leave room for a blog"]}');
      if (prompt.startsWith('You are the Orchestrator Engine')) return say('{"summary":"S","gameplan":{"skills":"HTML","checkups":"Echo after each build"},"specs":{"genesis":"page"}}');
      if (label === 'genesis') return say('=== FILE: index.html\n<p>x</p>\n=== END');
      return say('{"verdict":"OK","summary":"fine","notes":[]}');
    };
    const askPerson = jest.fn(async () => '');
    const search = jest.fn(async () => [{ title: 'Brand colors', content: 'black and gold' }]);
    await runLegion({
      goal: 'a site', models: { architect: model }, account: {}, dir, emit: (e) => events.push(e), ask, askPerson, search,
      look: async () => ({ ok: false, reason: 'No browser' }), commit: async () => ({ committed: true, sha: 'a' }),
    });
    expect(askPerson).toHaveBeenCalledWith(['Which colors?'], undefined);
    expect(search).toHaveBeenCalledWith('Which colors?');
    expect(events.find((e) => e.type === 'answered')).toMatchObject({ by: 'research' });
    expect(events.find((e) => e.type === 'plan').gameplan).toMatchObject({ skills: 'HTML', checkups: 'Echo after each build' });
    // Everyone sees everyone: Foresight's prompt carries Research's advice.
    expect(systems.find((c) => c.label === 'foresight').system).toContain('Research: Use plain HTML');
  });
});

describe('Legion parsing', () => {
  test('reads JSON wrapped in prose or fences', () => {
    expect(parseJsonReply('Sure! {"a":1} done')).toEqual({ a: 1 });
    expect(parseJsonReply('```json\n{"b":2}\n```')).toEqual({ b: 2 });
    expect(parseJsonReply('no json')).toBeNull();
  });

  test('reads file blocks and refuses paths that climb out', () => {
    const { files, notes, skipped } = parseFileBlocks('=== FILE: src/a.js\n```js\nx()\n```\n=== END\n=== FILE: ../etc/passwd\nbad\n=== END\nNOTES: hi');
    expect(files).toEqual([{ path: 'src/a.js', content: 'x()\n' }]);
    expect(skipped).toEqual(['../etc/passwd']);
    expect(notes).toBe('hi');
    expect(safeRelativePath('.git/config')).toBeNull();
    expect(safeRelativePath('C:\\x\\..\\y')).toBeNull();
  });

  test('an unreadable verdict counts as NOK with a to-do', () => {
    const v = cleanVerdict('garbage', ['foundation', 'genesis']);
    expect(v.verdict).toBe('NOK');
    expect(v.todo[0].owner).toBe('genesis');
  });

  test('finds the page to open', () => {
    expect(entryPage(['a.js', 'index.html'])).toBe('index.html');
    expect(entryPage(['public/index.html'])).toBe('public/index.html');
    expect(entryPage(['a.js'])).toBeNull();
    expect(findBrowser({ CENSAI_LEGION_BROWSER: '/nope' })).toBeNull();
  });
});

describe('Legion runs', () => {
  test('one model for every role, or a missing pick is refused', () => {
    expect(parseStart({ goal: 'x', model })).toMatchObject({ models: { echo: model, genesis: model } });
    expect(parseStart({ goal: 'x' }).error).toMatch(/Pick a model/);
    expect(parseStart({ model }).error).toMatch(/build/);
  });

  test('a run is saved with its events when it ends', async () => {
    const root = tmp();
    const runner = async ({ emit }) => { emit({ type: 'say', role: 'architect', text: 'hi' }); return { status: 'done', verdict: { verdict: 'OK' } }; };
    const run = await startRun({ userId: 'u1', account: {}, goal: 'x', models: {}, root, runner });
    await new Promise((r) => setTimeout(r, 50));
    const read = await readRun({ userId: 'u1', id: run.id, root });
    expect(read.status).toBe('done');
    expect(read.events.map((e) => e.type)).toEqual(['say', 'end']);
    expect(await readRun({ userId: 'someone-else', id: run.id, root })).toBeNull();
  });

  test('what a finished run learned is handed to the next run', async () => {
    const root = tmp();
    const first = async () => ({ status: 'done', verdict: { verdict: 'OK' }, reflection: { learned: 'Check the result is on screen.' } });
    await startRun({ userId: 'u1', account: {}, goal: 'x', models: {}, root, runner: first });
    await new Promise((r) => setTimeout(r, 50));
    let given = null;
    const second = async ({ lessons }) => { given = lessons; return { status: 'done', verdict: { verdict: 'OK' } }; };
    await startRun({ userId: 'u1', account: {}, goal: 'y', models: {}, root, runner: second });
    await new Promise((r) => setTimeout(r, 50));
    expect(given).toEqual(['Check the result is on screen.']);
    let otherGiven = null;
    await startRun({ userId: 'u2', account: {}, goal: 'z', models: {}, root, runner: async ({ lessons }) => { otherGiven = lessons; return { status: 'done' }; } });
    await new Promise((r) => setTimeout(r, 50));
    expect(otherGiven).toEqual([]);
  });

  test('commits the project with git', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    const result = await commitProject(dir, 'Legion: test');
    expect(result.committed).toBe(true);
    expect(result.sha).toMatch(/^[0-9a-f]{7,}$/);
  });

  test('the secret view link opens only that run\'s project files', async () => {
    const root = tmp();
    const runner = async ({ dir }) => { fs.writeFileSync(path.join(dir, 'project', 'index.html'), 'hi'); return { status: 'done' }; };
    const run = await startRun({ userId: 'u2', account: {}, goal: 'x', models: {}, root, runner });
    await new Promise((r) => setTimeout(r, 50));
    expect(await viewFilePath({ id: run.id, token: run.viewToken, rel: 'index.html', root })).toMatch(/project[\\/]index\.html$/);
    expect(await viewFilePath({ id: run.id, token: 'f'.repeat(32), rel: 'index.html', root })).toBeNull();
    expect(await viewFilePath({ id: run.id, token: run.viewToken, rel: '../run.json', root })).toBeNull();
  });

  test('a run the app restarted in the middle of reads as stopped, with its log kept', async () => {
    const root = tmp();
    const dir = path.join(root, 'u3', '1-abc');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ id: '1-abc', status: 'running', events: [{ type: 'phase', phase: 'build' }] }));
    const read = await readRun({ userId: 'u3', id: '1-abc', root });
    expect(read.status).toBe('error');
    expect(read.events.map((e) => e.type)).toEqual(['phase', 'end']);
  });
});

describe('Legion browser', () => {
  test('serves only the project, and the browser can reach nothing else', async () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'p'));
    fs.writeFileSync(path.join(dir, 'p', 'index.html'), 'page');
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'secret');
    const site = await serveProject(path.join(dir, 'p'));
    try {
      const ok = await fetch(`http://127.0.0.1:${site.port}/index.html`);
      expect(await ok.text()).toBe('page');
      expect((await fetch(`http://127.0.0.1:${site.port}/%2e%2e/secret.txt`)).status).toBe(404);
    } finally { site.close(); }
    const args = baseArgs('/tmp/x', 4321);
    expect(args).toContain('--proxy-server=http://127.0.0.1:4321');
    expect(args).toContain('--proxy-bypass-list=<-loopback>');
  });
});

