import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Front and back at the same time (Alex's diagram 04): Atlas (back end) and
// Genesis (front end) build side by side, then Synthesis joins them before
// the Validation Engine looks. Models are stood in for by a scripted function.

jest.unstable_mockModule('../server/legion/modelCall.js', () => ({
  callModel: jest.fn(),
  cleanModelSpec: (spec) => (spec?.provider && spec?.model ? { provider: spec.provider, model: spec.model } : null),
}));

const { withBuildOrder } = await import('../server/legion/spec.js');
const { needsCombine } = await import('../server/legion/combine.js');
const { runLegion } = await import('../server/legion/loop.js');
const { makeRunFolders } = await import('../server/legion/workspace.js');
const { LEGION_PHASES, applyLegionEvents, emptyLegion } = await import('../src/lib/legion/legionState.js');

const model = { provider: 'ollama', model: 'standin' };
const job = (id, owner, dependsOn = []) => ({ id, owner, task: `do ${id}`, dependsOn, status: 'queued', attempt: 0 });

describe('front and back at the same time', () => {
  test('Genesis does not wait for Atlas, but both still wait for Foundation and Nexus', () => {
    const jobs = withBuildOrder([job('J-1', 'foundation'), job('J-2', 'nexus'), job('J-3', 'atlas'), job('J-4', 'genesis')]);
    expect(jobs.find((j) => j.id === 'J-3').dependsOn).toEqual(['J-1', 'J-2']);
    expect(jobs.find((j) => j.id === 'J-4').dependsOn).toEqual(['J-1', 'J-2']);
  });

  test('only a queue with both front and back jobs needs Synthesis', () => {
    expect(needsCombine([job('J-1', 'atlas'), job('J-2', 'genesis')])).toBe(true);
    expect(needsCombine([job('J-1', 'foundation'), job('J-2', 'genesis')])).toBe(false);
  });

  test('both builders run at once, then Synthesis joins them before Echo checks', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legion-frontback-'));
    await makeRunFolders(dir);
    const order = [];
    let running = 0;
    let most = 0;
    const say = (text) => ({ text, model: 'standin', ms: 1 });
    const ask = async ({ label, prompt }) => {
      order.push(label === 'architect' ? prompt.split('\n')[0].slice(0, 20) : label);
      if (label === 'architect' && prompt.startsWith('You are the Orchestrator Engine')) {
        return say(JSON.stringify({
          summary: 'A to-do list with a server.',
          jobs: [{ id: 'J-001', owner: 'atlas', task: 'server.js with GET /api/todos' }, { id: 'J-002', owner: 'genesis', task: 'index.html that lists to-dos' }],
          checks: [{ id: 'C-001', job: 'J-002', file_contains: { file: 'index.html', text: '/api/todos' } }],
        }));
      }
      if (label === 'architect' && prompt.startsWith('Write a first plan')) return say('{"summary":"To-dos."}');
      if (label === 'architect' && prompt.startsWith('You are Synthesis')) {
        expect(prompt).toContain('server.js');
        expect(prompt).toContain('index.html');
        return say('=== FILE: index.html\n<script>fetch("/api/todos")</script><p>To-dos</p>\n=== END\nNOTES: pointed the page at /api/todos');
      }
      if (label === 'architect' && prompt.startsWith('Global post-project')) return say('{"agents":[],"learned":"Join early."}');
      if (prompt.includes('give your advice')) return say('{"notes":[]}');
      if (label === 'atlas' || label === 'genesis') {
        running += 1;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 20));
        running -= 1;
        return say(label === 'atlas'
          ? '=== FILE: server.js\napp.get("/api/todos")\n=== END\nNOTES: route made'
          : '=== FILE: index.html\n<p>To-dos</p>\n=== END\nNOTES: page made');
      }
      if (label === 'echo') return say('{"verdict":"OK","summary":"Works."}');
      throw new Error(`unexpected turn for ${label}`);
    };
    const events = [];
    const look = async ({ shotPath }) => { fs.writeFileSync(shotPath, 'png'); return { ok: true, page: 'index.html', png: Buffer.from('png'), text: 'To-dos', errors: [] }; };
    const models = Object.fromEntries(['architect', 'research', 'foresight', 'echo', 'foundation', 'nexus', 'atlas', 'genesis'].map((r) => [r, model]));
    const outcome = await runLegion({
      goal: 'a to-do list with a server', models, account: {}, dir, emit: (e) => events.push(e), ask, look,
      commit: async () => ({ committed: true, sha: 'abc1234' }), selfEducate: false,
    });

    expect(outcome.status).toBe('done');
    expect(most).toBe(2);
    expect(order.indexOf('You are Synthesis. A')).toBeGreaterThan(order.lastIndexOf('genesis'));
    expect(order.indexOf('You are Synthesis. A')).toBeLessThan(order.indexOf('echo', order.indexOf('You are Synthesis. A')));
    expect(fs.readFileSync(path.join(dir, 'project', 'index.html'), 'utf8')).toContain('/api/todos');
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases.slice(0, 4)).toEqual(['plan', 'build', 'combine', 'check']);
    const state = applyLegionEvents(emptyLegion(), events.filter((e) => e.type !== 'phase' || e.phase === 'combine'));
    expect(state.phase).toBe('combine');
    expect(LEGION_PHASES.map((p) => p.label)).toContain('Synthesis');
  });
});
