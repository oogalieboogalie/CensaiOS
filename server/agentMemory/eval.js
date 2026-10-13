// server/agentMemory/eval.js
//
// Does memory make answers better, not worse? A small fixed set of
// questions, each asked twice: once with the agent's memory block in its
// instructions and once without. A case passes when the answer contains
// what it should and nothing it must not (an old value after a correction,
// another person's fact, memory leaking into an unrelated question).
//
// The model is passed in. scripts/memory-eval.mjs runs it with the stand-in
// model below (no key, same result every time) or with a real model through
// any OpenAI-compatible address and key you bring.

import { normalizeFactInput, planFactWrite } from './facts.js';
import { buildMemoryBlock, summarizeEpisode } from './recall.js';

const ME = 1;
const SOMEONE_ELSE = 2;

export const EVAL_CASES = Object.freeze([
  {
    id: 'told-fact', about: 'A fact told in an earlier chat',
    setup: [{ fact: { attribute: 'favorite color', value: 'green' } }],
    question: 'What is my favorite color?', expect: ['green'],
  },
  {
    id: 'second-fact', about: 'A name told in an earlier chat',
    setup: [{ fact: { attribute: 'dog name', value: 'Biscuit' } }],
    question: "What is my dog's name?", expect: ['Biscuit'],
  },
  {
    id: 'corrected', about: 'A fact that was corrected uses the new value only',
    setup: [
      { fact: { attribute: 'favorite color', value: 'green' } },
      { fact: { attribute: 'favorite color', value: 'blue', kind: 'correction' } },
    ],
    question: 'What is my favorite color?', expect: ['blue'], forbid: ['green'],
  },
  {
    id: 'changed', about: 'A fact that changed over time uses the current value',
    setup: [
      { fact: { attribute: 'lives in', value: 'Austin', validFrom: '2024-03-01' } },
      { fact: { attribute: 'lives in', value: 'Denver', validFrom: '2026-09-01' } },
    ],
    question: 'Where do I live now?', expect: ['Denver'], forbid: ['Austin'],
  },
  {
    id: 'since-when', about: 'It knows since when a fact is true',
    setup: [
      { fact: { attribute: 'lives in', value: 'Austin', validFrom: '2024-03-01' } },
      { fact: { attribute: 'lives in', value: 'Denver', validFrom: '2026-09-01' } },
    ],
    question: 'Since when do I live in Denver?', expect: ['2026-09-01'],
  },
  {
    id: 'episode', about: 'A decision from an earlier conversation',
    setup: [{ episode: { question: 'Which brand color should censaiOS use?', answer: 'We picked Ultem yellow, #E5A83A, as the brand color.' } }],
    question: 'Which brand color did we pick?', expect: ['E5A83A'],
  },
  {
    id: 'identity', about: 'Who it is survives a model change',
    setup: [{ identity: 'I am Atlas, the planner of the censaiOS crew. I keep plans short and honest.' }],
    question: 'Who are you?', expect: ['Atlas'],
  },
  {
    id: 'unrelated', about: 'An unrelated question is not disturbed by memory',
    setup: [{ fact: { attribute: 'favorite color', value: 'green' } }],
    question: 'What is 12 plus 30?', expect: ['42'], forbid: ['green'],
  },
  {
    id: 'private', about: "Another person's facts never show up",
    setup: [{ fact: { attribute: 'favorite color', value: 'red' }, userId: SOMEONE_ELSE }],
    question: 'What is my favorite color?', forbid: ['red'],
  },
]);

/** Memory kept in a plain object, using the same rules as the database. */
export function createInMemoryMemory() {
  const facts = [];
  const episodes = [];
  const identities = new Map();
  let id = 0;
  let clock = Date.parse('2026-10-01T00:00:00Z');
  const tick = () => new Date((clock += 60_000));
  return {
    async tell(userId, raw) {
      const now = tick();
      const input = normalizeFactInput(raw, now);
      const current = facts.find((f) => f.user_id === userId && f.fact_key === input.key && !f.superseded_at && !f.valid_to);
      const plan = planFactWrite(current, input, now);
      if (plan.action === 'same') return;
      if (current) current.superseded_at = now;
      for (const row of plan.rows) facts.push({ ...row, id: (id += 1), user_id: userId, recorded_at: now, valid_to: row.valid_to || null, superseded_at: null });
    },
    async addEpisode(userId, { question, answer }) {
      episodes.push({ id: (id += 1), user_id: userId, created_at: tick(), summary: summarizeEpisode({ question, answer }) });
    },
    async setIdentity(userId, core) { identities.set(userId, { core }); },
    async block(userId, question) {
      const wanted = new Set(words(question));
      return buildMemoryBlock({
        identity: identities.get(userId) || null,
        facts: facts.filter((f) => f.user_id === userId && !f.superseded_at && !f.valid_to).reverse(),
        episodes: episodes.filter((e) => e.user_id === userId && words(e.summary).some((w) => wanted.has(w))),
      });
    },
  };
}

function words(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).map((w) => w.replace(/s$/, ''));
}

const STOP = new Set(['what', 'which', 'the', 'did', 'does', 'and', 'you', 'your', 'now', 'when', 'since', 'who', 'are', 'how', 'pick', 'use', 'should']);

/**
 * The stand-in model: answers only from the lines in its instructions, so it
 * shows exactly what memory puts in front of a model. No key, no network.
 */
export function standInModel(system, question) {
  const sum = /(\d+)\s*(?:plus|\+)\s*(\d+)/i.exec(question);
  if (sum) return String(Number(sum[1]) + Number(sum[2]));
  if (/who are you/i.test(question)) {
    const core = /## Who you are[^\n]*\n([^\n]+)/.exec(system)?.[1];
    return core ? core.split('. ')[0] : 'I am an AI assistant.';
  }
  const wanted = words(question).filter((w) => !STOP.has(w));
  let best = null;
  let bestScore = 0;
  for (const line of system.split('\n').filter((l) => l.startsWith('- '))) {
    const have = new Set(words(line));
    const score = wanted.filter((w) => have.has(w)).length;
    if (score > bestScore) { best = line; bestScore = score; }
  }
  if (!best) return "I don't know.";
  if (/since when/i.test(question)) return /true since (\S+?)[,)]/.exec(best)?.[1] || best.slice(2);
  const said = /Answered: (.+?)(?: \| Used:|$)/.exec(best);
  if (said) return said[1];
  const fact = /^- [^:]+: (.+?) \(true /.exec(best);
  return fact ? fact[1] : best.slice(2);
}

function score(c, answer) {
  const text = String(answer || '').toLowerCase();
  const hasAll = (c.expect || []).every((e) => text.includes(e.toLowerCase()));
  const hasNone = (c.forbid || []).every((f) => !text.includes(f.toLowerCase()));
  return hasAll && hasNone;
}

/**
 * Run every case with and without memory. `model(system, question)` returns
 * the answer text. `makeMemory()` returns a fresh memory per case.
 */
export async function runMemoryEval({ model = standInModel, makeMemory = createInMemoryMemory, baseSystem = 'You are a helpful assistant.' } = {}) {
  const rows = [];
  for (const c of EVAL_CASES) {
    const memory = await makeMemory();
    for (const step of c.setup) {
      const userId = step.userId || ME;
      if (step.fact) await memory.tell(userId, step.fact);
      if (step.episode) await memory.addEpisode(userId, step.episode);
      if (step.identity) await memory.setIdentity(userId, step.identity);
    }
    const block = await memory.block(ME, c.question);
    const withAnswer = await model(block ? `${baseSystem}\n\n${block}` : baseSystem, c.question);
    const withoutAnswer = await model(baseSystem, c.question);
    rows.push({
      id: c.id, about: c.about, question: c.question,
      withMemory: { answer: withAnswer, pass: score(c, withAnswer) },
      withoutMemory: { answer: withoutAnswer, pass: score(c, withoutAnswer) },
    });
    await memory.close?.();
  }
  const total = (key) => rows.filter((r) => r[key].pass).length;
  return { rows, withMemory: total('withMemory'), withoutMemory: total('withoutMemory'), cases: rows.length };
}

export function evalTable(result) {
  const cell = (x) => `${x.pass ? 'pass' : 'FAIL'}: ${String(x.answer).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 60)}`;
  return [
    '| Check | Question | With memory | Without memory |',
    '| --- | --- | --- | --- |',
    ...result.rows.map((r) => `| ${r.about} | ${r.question} | ${cell(r.withMemory)} | ${cell(r.withoutMemory)} |`),
    `| **Total** | | **${result.withMemory} of ${result.cases}** | **${result.withoutMemory} of ${result.cases}** |`,
  ].join('\n');
}
