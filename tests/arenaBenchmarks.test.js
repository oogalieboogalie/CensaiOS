// Arena benchmarks: recorded races, marks, the per-model table and the
// optional judge. Pure data and math; the windows are tested in
// tests/ArenaBenchmarksWindow.test.jsx.
import {
  addRecord, cleanMarks, isRanked, leaders, makeRecord, MAX_RUNS, modelTable, removeRecord, SAVED_REPLY_LIMIT, updateRecordMarks,
} from '../src/lib/modelArena/benchmarks.js';
import { judgeRequest, parseJudgeReply } from '../src/lib/modelArena/arenaJudge.js';
import { BENCHMARK_TASKS, benchmarkTaskFor, estimateLaneCost, taskById } from '../src/lib/modelArena/benchmarkTasks.js';

const lanes = [
  { provider: 'google', model: 'gemini-3.8-flash' },
  { provider: 'anthropic', model: 'claude-haiku-5-5' },
];
const done = (text, firstTokenMs, totalMs, output) => ({ status: 'done', text, firstTokenMs, totalMs, usage: { input: 100, output } });

function race(marks, results = [done('a', 300, 2000, 100), done('b', 500, 1500, 80)]) {
  return makeRecord({ prompt: 'Find the line', system: '', lanes, results, marks, task: 'pinpoint' });
}

test('a record keeps the numbers, cost, marks and a shortened answer', () => {
  const record = race({ best: 1, lanes: { 0: 'wrong', 1: 'right', 5: 'right' } }, [
    done('x'.repeat(SAVED_REPLY_LIMIT + 50), 300, 2000, 100),
    { status: 'error', text: '', error: { message: 'No key' }, totalMs: 10 },
  ]);
  expect(record.id).toMatch(/^run-/);
  expect(record.lanes[0]).toMatchObject({ model: 'gemini-3.8-flash', firstTokenMs: 300, totalMs: 2000, tokensPerSecond: 59 });
  expect(record.lanes[0].text).toHaveLength(SAVED_REPLY_LIMIT);
  expect(record.lanes[0].cost).toBeCloseTo((100 * 0.75 + 100 * 3.75) / 1e6);
  expect(record.lanes[1]).toMatchObject({ status: 'error', totalMs: null, error: 'No key' });
  // Lane 5 does not exist, so its mark is dropped.
  expect(record.marks).toEqual({ best: 1, lanes: { 0: 'wrong', 1: 'right' }, judge: null });
});

test('records are newest first, capped, and can be re-marked or deleted', () => {
  let runs = [];
  for (let i = 0; i < MAX_RUNS + 3; i += 1) runs = addRecord(runs, { ...race(), id: `r${i}` });
  expect(runs).toHaveLength(MAX_RUNS);
  expect(runs[0].id).toBe(`r${MAX_RUNS + 2}`);
  runs = updateRecordMarks(runs, runs[0].id, { best: 0, lanes: { 1: 'right' } });
  expect(runs[0].marks).toEqual({ best: 0, lanes: { 1: 'right' }, judge: null });
  expect(removeRecord(runs, runs[0].id)).toHaveLength(MAX_RUNS - 1);
});

test('the model table counts picks, right answers, typical speed and cost, and names leaders', () => {
  const runs = [
    race({ best: 1, lanes: { 0: 'wrong', 1: 'right' } }),
    race({ best: 1, lanes: { 1: 'right' }, judge: { model: 'openai:gpt-4.1-mini', best: 0, reason: 'shorter' } }),
    race({ best: 0, lanes: { 0: 'right' } }, [done('a', 200, 1000, 50), done('b', 700, 1700, 90)]),
  ];
  const table = modelTable(runs);
  const gemini = table.find((row) => row.provider === 'google');
  const haiku = table.find((row) => row.provider === 'anthropic');
  expect(haiku).toMatchObject({ id: 'anthropic:claude-haiku-5-5', runs: 3, picks: 2, right: 2, wrong: 0, accuracy: 1, medianFirstMs: 500, medianTotalMs: 1500, fastRightMs: 1500 });
  expect(gemini).toMatchObject({ id: 'google:gemini-3.8-flash', picks: 1, judgePicks: 1, right: 1, wrong: 1, accuracy: 0.5, medianFirstMs: 300, fastRightMs: 1000 });
  // Ranked by fast and right: Gemini's one right answer finished in 1 s.
  expect(table.map((row) => row.model)).toEqual(['gemini-3.8-flash', 'claude-haiku-5-5']);
  expect(leaders(table)).toEqual({
    fastRight: 'google:gemini-3.8-flash',
    firstWord: 'google:gemini-3.8-flash',
    finish: 'anthropic:claude-haiku-5-5',
    cheapest: 'anthropic:claude-haiku-5-5',
    picked: 'anthropic:claude-haiku-5-5',
    accurate: 'anthropic:claude-haiku-5-5',
  });
  expect(leaders(table.slice(0, 1))).toEqual({});
});

test('a fast model with wrong answers does not lead fast and right', () => {
  const runs = [1, 2].map(() => race({ best: 1, lanes: { 0: 'wrong' } }, [done('wrong', 100, 400, 50), done('right', 600, 3000, 90)]));
  const table = modelTable(runs);
  expect(table[0]).toMatchObject({ model: 'claude-haiku-5-5', fastRightMs: 3000, right: 2, accuracy: 1 });
  expect(table[1]).toMatchObject({ model: 'gemini-3.8-flash', fastRightMs: null, medianTotalMs: 400, accuracy: 0 });
  expect(leaders(table)).toMatchObject({ fastRight: 'anthropic:claude-haiku-5-5', finish: 'google:gemini-3.8-flash' });
});

test('only premade tasks are ranked, and the table can look at one task', () => {
  const typed = makeRecord({ prompt: 'my own thing', system: '', lanes, results: [done('a', 1, 100, 5), done('b', 1, 50, 5)], marks: { best: 0 } });
  const runs = [typed, race({ best: 1 }), { ...race({ best: 0 }), task: 'dates' }];
  expect(isRanked(typed)).toBe(false);
  expect(modelTable(runs).find((row) => row.provider === 'anthropic')).toMatchObject({ runs: 2, picks: 1 });
  expect(modelTable(runs, { task: 'dates' }).find((row) => row.provider === 'google')).toMatchObject({ runs: 1, picks: 1 });
  expect(modelTable([typed])).toEqual([]);
});

test('an answer cut off at its limit keeps no finish time and never counts as right', () => {
  const record = race({ best: 0, lanes: { 0: 'right' } }, [{ ...done('half', 100, 900, 8192), finishReason: 'length' }, done('b', 500, 1500, 80)]);
  expect(record.lanes[0]).toMatchObject({ cutOff: true, totalMs: null });
  const gemini = modelTable([record]).find((row) => row.provider === 'google');
  expect(gemini).toMatchObject({ right: 0, wrong: 1, fastRightMs: null });
  const request = judgeRequest({ prompt: 'p', results: [{ ...done('half', 1, 2, 3), finishReason: 'max_tokens' }, done('whole', 1, 2, 3), done('other', 1, 2, 3)] });
  expect(request.prompt).not.toContain('half');
});

test('every premade task has a way to mark it right, and costs are known before the race', () => {
  expect(BENCHMARK_TASKS.length).toBeGreaterThanOrEqual(10);
  expect(new Set(BENCHMARK_TASKS.map((t) => t.id)).size).toBe(BENCHMARK_TASKS.length);
  BENCHMARK_TASKS.forEach((task) => {
    expect(task.check).toEqual(expect.any(String));
    expect(task.expectOutput).toBeGreaterThan(0);
    expect(benchmarkTaskFor(task.prompt, task.system)).toBe(task);
  });
  expect(benchmarkTaskFor('typed by hand')).toBeNull();
  const task = taskById('dates');
  const cost = estimateLaneCost({ provider: 'anthropic', model: 'claude-haiku-5-5' }, task.prompt, task.system);
  expect(cost).toBeGreaterThan(0);
  expect(cost).toBeLessThan(0.001);
  expect(estimateLaneCost({ provider: 'ollama', model: 'qwen3' }, 'hi')).toBe(0);
  expect(judgeRequest({ prompt: 'p', check: task.check, results: [] }).prompt).toContain('What a right answer looks like:\n2026-11-27.');
});

test('bad marks from the board are cleaned', () => {
  expect(cleanMarks(null, 2)).toEqual({ best: null, lanes: {}, judge: null });
  expect(cleanMarks({ best: 4, lanes: { 0: 'maybe' }, judge: { model: 'x:y', best: 9 } }, 2)).toEqual({ best: null, lanes: {}, judge: null });
});

test('the judge sees only finished answers, with the model names hidden', () => {
  const request = judgeRequest({
    prompt: 'Which file?', system: 'Be brief.',
    results: [done('cart.js', 1, 2, 3), { status: 'error', text: '' }, done('tax.js line 2', 1, 2, 3)],
  });
  expect(request.answerCount).toBe(2);
  expect(request.prompt).toContain('### Answer 1\ncart.js');
  expect(request.prompt).toContain('### Answer 3\ntax.js line 2');
  expect(request.prompt).not.toContain('### Answer 2');
  expect(request.prompt).not.toMatch(/gemini|haiku/i);
});

test('the judge reply is read as JSON, or from its words, and checked', () => {
  expect(parseJudgeReply('```json\n{"best": 2, "reason": "Right line."}\n```', 3)).toEqual({ best: 1, reason: 'Right line.' });
  expect(parseJudgeReply('I think Answer #1 is best.', 2)).toEqual({ best: 0, reason: '' });
  expect(parseJudgeReply('{"best": 7}', 2)).toBeNull();
  expect(parseJudgeReply('no idea', 2)).toBeNull();
});
