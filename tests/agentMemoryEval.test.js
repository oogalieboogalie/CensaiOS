// Agent memory eval: a fixed set of questions asked with and without memory
// (stand-in model that answers only from its instructions). Memory must get
// every case right and never do worse than no memory on any case.
import { EVAL_CASES, evalTable, runMemoryEval, standInModel } from '../server/agentMemory/eval.js';

test('memory answers every case and is never worse than no memory', async () => {
  const result = await runMemoryEval();
  expect(result.cases).toBe(EVAL_CASES.length);
  expect(result.withMemory).toBe(result.cases);
  for (const row of result.rows) {
    if (row.withoutMemory.pass) expect(row.withMemory.pass).toBe(true);
  }
  expect(result.withoutMemory).toBeLessThan(result.withMemory);
  expect(evalTable(result)).toContain(`**${result.cases} of ${result.cases}**`);
});

test('the stand-in model knows nothing without memory', () => {
  expect(standInModel('You are a helpful assistant.', 'What is my favorite color?')).toBe("I don't know.");
});
