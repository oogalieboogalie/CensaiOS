import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Legion slice three, from Alex's self-educate diagram (var = 'self_educate'):
// is what I know enough? NO -> long-term memory + Research; YES but "if I
// knew more" -> Research -> a better solution; then store what matters.

jest.unstable_mockModule('../server/legion/modelCall.js', () => ({
  callModel: jest.fn(),
  cleanModelSpec: (spec) => (spec?.provider && spec?.model ? { provider: spec.provider, model: spec.model } : null),
}));

const { cleanSelfCheck, selfEducate } = await import('../server/legion/educate.js');
const { openMemory, searchNotes, memoryInMemory } = await import('../server/legion/memory.js');
const { parseFileBlocks } = await import('../server/legion/parse.js');
const { parseStart } = await import('../server/legion/runs.js');
const { runLegion } = await import('../server/legion/loop.js');
const { parseSpecYaml } = await import('../server/legion/spec.js');
const { makeRunFolders } = await import('../server/legion/workspace.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'legion-educate-'));
const job = { id: 'J-001', owner: 'genesis', task: 'Tip calculator page with rounding' };

describe('self-check', () => {
  test('reads YES now, YES if I knew more, and NO', () => {
    expect(cleanSelfCheck('{"enough":"yes","when":"now"}').when).toBe('now');
    expect(cleanSelfCheck('{"enough":"yes","when":"if_i_knew_more","question":"q"}').when).toBe('more');
    const no = cleanSelfCheck('```json\n{"problem":"p","know":"k","enough":"no","question":"how to round money"}\n```');
    expect(no).toMatchObject({ enough: false, when: 'learn', question: 'how to round money' });
    expect(cleanSelfCheck('not json').when).toBe('now');
  });

  test('the builder can leave a REMEMBER line', () => {
    expect(parseFileBlocks('=== FILE: a.txt\nx\n=== END\nNOTES: n\nREMEMBER: Round money with toFixed(2).').remember)
      .toBe('Round money with toFixed(2).');
  });

  test('Self-educate is on unless the person turns it off', () => {
    const model = { provider: 'ollama', model: 'm' };
    expect(parseStart({ goal: 'x', model }).selfEducate).toBe(true);
    expect(parseStart({ goal: 'x', model, selfEducate: false }).selfEducate).toBe(false);
  });
});

describe('long-term memory', () => {
  test('finds notes by shared words and keeps one copy of each', async () => {
    const dir = tmp();
    const memory = openMemory(dir);
    await memory.store([{ text: 'Round money with toFixed(2) before showing it.' }, { text: 'Postgres needs a port.' }], 'Tips');
    await memory.store([{ text: 'round money with toFixed(2) before showing it.' }]);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'memory.json'), 'utf8')).notes;
    expect(saved).toHaveLength(2);
    expect((await memory.search('how do I round money'))[0].text).toMatch(/toFixed/);
    expect(searchNotes(saved, 'nothing alike here')).toEqual([]);
    // A damaged file is never replaced by a shorter one.
    fs.writeFileSync(path.join(dir, 'memory.json'), '{"notes": [');
    expect(await openMemory(dir).store([{ text: 'New note' }])).toEqual([]);
    expect(fs.readFileSync(path.join(dir, 'memory.json'), 'utf8')).toBe('{"notes": [');
  });

  test('a self-educate failure does not end the job', async () => {
    const turn = async (role) => { if (role === 'research') throw new Error('rate limit'); return '{"enough":"No."}'; };
    await expect(selfEducate({ job, turn, emit: () => {}, memory: memoryInMemory(), search: async () => [] })).rejects.toThrow('rate limit');
    expect(cleanSelfCheck('{"enough":"No."}').enough).toBe(false);
  });
});

describe('the self-educate loop', () => {
  const run = async (check) => {
    const events = [];
    const turns = [];
    const turn = async (role, prompt) => {
      turns.push(role);
      if (role === 'research') return '{"answer":"Use Math.round(x*100)/100.","remember":"Round money to cents."}';
      return check;
    };
    const memory = memoryInMemory([{ text: 'Tip pages: round money to cents.' }]);
    const out = await selfEducate({ job, turn, emit: (e) => events.push(e), memory, search: async () => [{ title: 'MDN', content: 'Math.round' }] });
    return { out, events, turns };
  };

  test('YES, now: straight to the solution', async () => {
    const { out, turns } = await run('{"enough":"yes","when":"now"}');
    expect(out.path).toBe('now');
    expect(turns).toEqual(['genesis']);
  });

  test('YES, if I knew more: Research, then a better solution', async () => {
    const { out, events } = await run('{"enough":"yes","when":"if_i_knew_more","question":"rounding money in JS"}');
    expect(out.path).toBe('more');
    expect(events.map((e) => e.step)).toEqual(['check', 'research']);
    expect(out.learned).toMatch(/Math.round/);
  });

  test('NO: long-term memory first, then Research', async () => {
    const { out, events } = await run('{"enough":"no","question":"how to round money for a tip page"}');
    expect(events.map((e) => e.step)).toEqual(['check', 'memory', 'research']);
    expect(events[1].found[0]).toMatch(/cents/);
    expect(events[2].web).toBe(1);
    expect(out.learned).toMatch(/long-term memory/);
    expect(out.remember).toBe('Round money to cents.');
  });
});

test('a Legion educates its builder, feeds what it learned into the build, and stores it', async () => {
  const dir = tmp();
  await makeRunFolders(dir);
  const memory = memoryInMemory();
  let buildPrompt = '';
  const ask = async ({ label, prompt }) => {
    const say = (text) => ({ text, model: 'standin', ms: 1 });
    if (label === 'genesis' && prompt.includes('educate yourself')) return say('{"enough":"no","question":"tip math"}');
    if (label === 'research') return say('{"answer":"tip = bill * pct / 100","remember":"Tip is bill times percent over 100."}');
    if (label === 'genesis') { buildPrompt = prompt; return say('=== FILE: index.html\n<p>Total</p>\n=== END\nREMEMBER: Keep index.html at the root.'); }
    if (label === 'echo') return say('{"verdict":"OK","summary":"Fine."}');
    return say('{}');
  };
  const { spec } = parseSpecYaml('goal: Tips\njobs:\n  - id: J-001\n    owner: genesis\n    task: page\n');
  const events = [];
  const outcome = await runLegion({
    goal: 'Tips', spec, models: { architect: { provider: 'ollama', model: 'm' } }, account: {}, dir, emit: (e) => events.push(e), ask, memory,
    look: async () => ({ ok: false, reason: 'No browser' }), commit: async () => ({ committed: true, sha: 'a' }),
  });
  expect(outcome.status).toBe('done');
  expect(buildPrompt).toMatch(/Research found: tip = bill/);
  expect(memory.notes.map((n) => n.text)).toEqual(['Tip is bill times percent over 100.', 'Keep index.html at the root.']);
  expect(events.some((e) => e.type === 'remembered')).toBe(true);
});
