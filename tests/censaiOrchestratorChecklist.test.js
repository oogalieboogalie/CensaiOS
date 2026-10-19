// Censai the orchestrator: each job's checklist (server/censaiOrchestrator):
// what goes on it, how each item is checked off (check.js), how a file is
// looked for (projectFiles.js), and that nothing is done, or left open, while
// an item is not checked off (checklist.js, planState.js).
import { jest } from '@jest/globals';
import { PlanInputError, TESTS_ITEM, ANSWER_ITEM, normalizePlanInput } from '../server/censaiOrchestrator/shape.js';
import {
  addTestsItem, checklistVerdict, closeChecklist, reopenChecklist, setItem, tickWords,
} from '../server/censaiOrchestrator/checklist.js';
import { checkAnswer } from '../server/censaiOrchestrator/check.js';
import { findProjectFile } from '../server/censaiOrchestrator/projectFiles.js';
import { finish, markStopped, stickJob } from '../server/censaiOrchestrator/planState.js';

const listOf = (job) => job.checklist.map((item) => [item.text, item.how, item.auto || false]);
const planWith = (jobs, project = 'Homebase') => normalizePlanInput({ goal: 'Show the date', project, jobs });
const oneJob = (entry, project) => planWith([{ agent: 'nexus', job: 'Add the date to the header.', ...entry }], project).jobs[0];

describe('what goes on the list', () => {
  test('code work always carries the project\'s tests, and every list reads the reply at least once', () => {
    expect(listOf(oneJob({ kind: 'code', checklist: ['The header shows today\'s date'] }))).toEqual([
      ['The header shows today\'s date', 'answer', false], [TESTS_ITEM, 'tests', true],
    ]);
    expect(listOf(oneJob({ kind: 'code', checklist: [{ item: 'The new header file exists', check: 'file', path: './src/Header.jsx' }] }))).toEqual([
      [ANSWER_ITEM, 'answer', true], ['The new header file exists', 'file', false], [TESTS_ITEM, 'tests', true],
    ]);
    const filed = oneJob({ checklist: [{ item: 'The notes file exists', path: 'docs\\notes.md' }] });
    expect(filed.checklist[1]).toMatchObject({ how: 'file', path: 'docs/notes.md', state: 'open', line: '' });
  });

  test('a claim that tests pass is run, never taken from the reply', () => {
    expect(listOf(oneJob({ checklist: ['All tests pass', 'The date shows'] }))).toEqual([
      ['All tests pass', 'tests', false], ['The date shows', 'answer', false],
    ]);
    // An explicit "answer" check on a pure test claim is still a test run.
    expect(oneJob({ checklist: [{ item: 'The tests pass.', check: 'answer' }] }).checklist.map((item) => item.how)).toEqual(['answer', 'tests']);
    expect(listOf(oneJob({ checklist: ['The date shows and the tests pass'] }))).toEqual([
      ['The date shows and the tests pass', 'answer', false], [TESTS_ITEM, 'tests', true],
    ]);
    // Looking into failing tests is not a claim that they pass.
    expect(listOf(oneJob({ agent: 'echo', checklist: ['It explains why the tests do not pass'] }))).toEqual([
      ['It explains why the tests do not pass', 'answer', false],
    ]);
  });

  test('a list Censai cannot check is refused with what to fix', () => {
    expect(() => oneJob({ checklist: Array(7).fill(0).map((_, i) => `Item ${i}`) })).toThrow(/at most 6 checklist items/);
    expect(() => oneJob({ checklist: [{ check: 'file', item: 'It exists' }] })).toThrow(/Job 1, item 1: say which file must exist/);
    expect(() => oneJob({ checklist: [{ item: 'It exists', path: '../../etc/passwd' }] })).toThrow(/path inside the project/);
    expect(() => oneJob({ checklist: [{ item: 'It exists', path: 'C:\\Windows\\win.ini' }] })).toThrow(/path inside the project/);
    expect(() => oneJob({ checklist: [{ item: 'It exists', path: 'src/a.js' }] }, null)).toThrow(/a file check needs the project/);
    expect(() => oneJob({ checklist: [{ item: '  ' }] })).toThrow(PlanInputError);
    expect(oneJob({ checklist: ['Same thing', 'same thing'] }).checklist).toHaveLength(1);
  });
});

describe('where a list stands', () => {
  test('checked off only when every item is; could-not-check beats not-true-yet', () => {
    const job = oneJob({ kind: 'code', checklist: ['The date shows'] });
    expect(checklistVerdict(job).ok).toBeNull();
    setItem(job.checklist[0], 'ticked', 'It shows.');
    setItem(job.checklist[1], 'failed', 'The tests failed.', 'FAIL');
    expect(tickWords(job)).toBe('1 of 2 checked off');
    expect(checklistVerdict(job)).toEqual({ ok: false, items: [job.checklist[1]] });
    setItem(job.checklist[0], 'unknown', 'I could not read it over.');
    expect(checklistVerdict(job)).toMatchObject({ ok: null, item: job.checklist[0] });
    setItem(job.checklist[0], 'ticked', 'It shows.');
    setItem(job.checklist[1], 'ticked', 'The tests passed.');
    expect(job.checklist[1].detail).toBeUndefined();
    expect(checklistVerdict(job).ok).toBe(true);
    expect(tickWords(job)).toBe('All 2 checked off');
    expect(addTestsItem(job)).toBe(false);
  });

  test('a list that ends early says, item by item, why it was not checked', () => {
    const job = oneJob({ kind: 'code', checklist: ['The date shows'] });
    setItem(job.checklist[0], 'ticked', 'It shows.');
    closeChecklist(job, 'you stopped the plan');
    expect(job.checklist.map((item) => [item.state, item.line])).toEqual([
      ['ticked', 'It shows.'], ['unknown', 'Not checked: you stopped the plan.'],
    ]);
    reopenChecklist(job);
    expect(job.checklist.every((item) => item.state === 'open' && item.line === '')).toBe(true);
  });

  test('done needs every item on every list; anything less is stuck on the first gap and said', () => {
    const plan = { status: 'running', jobs: planWith([
      { agent: 'nexus', job: 'Add the date.', checklist: ['The date shows'] },
      { agent: 'echo', job: 'Write the line.', checklist: ['One plain line'] },
    ]).jobs };
    plan.jobs[0].status = 'done';
    setItem(plan.jobs[0].checklist[0], 'ticked', 'It shows.');
    plan.jobs[1].status = 'done';
    finish(plan);
    expect(plan.status).toBe('stuck');
    expect(plan.jobs[1]).toMatchObject({ status: 'stuck', stuckOn: 1 });
    expect(plan.jobs[1].checklist[0]).toMatchObject({ state: 'unknown', line: 'Not checked: the part stopped here.' });

    const stopped = { status: 'running', jobs: planWith([
      { agent: 'nexus', job: 'Add the date.', checklist: ['The date shows'] },
      { agent: 'echo', job: 'Write the line.', checklist: ['One plain line'] },
    ]).jobs };
    stopped.jobs[0].status = 'working';
    markStopped(stopped);
    expect(stopped.jobs.map((job) => [job.status, job.checklist[0].line])).toEqual([
      ['stopped', 'Not checked: you stopped the plan.'], ['skipped', 'Not checked: this part did not start.'],
    ]);
    const broken = { status: 'running', jobs: planWith([{ agent: 'nexus', job: 'Add the date.', checklist: ['The date shows'] }]).jobs };
    broken.jobs[0].status = 'checking';
    stickJob(broken, broken.jobs[0], { why: 'something went wrong on my side', error: 'Something went wrong on my side while running this part.' });
    expect(broken.summary).toBe('Stuck on Nexus\'s part. Something went wrong on my side while running this part.');
    expect(broken.jobs[0].checklist[0].line).toBe('Not checked: something went wrong on my side.');
  });
});

describe('checking the work against the list', () => {
  const edit = { tool: 'project_edit', ok: true, args: { project: 'Homebase', path: 'src/Header.jsx' }, summary: { path: 'src/Header.jsx' } };
  const passed = { ran: true, ok: true, line: 'The project\'s tests passed (12 tests).' };

  function deps({ tests = passed, review = '1 PASS The header shows the date.', file = { exists: true, line: 'Found src/Header.jsx in the project.' } } = {}) {
    const steps = [];
    const snapshots = [];
    let job;
    const out = {
      steps,
      snapshots,
      watch: (value) => { job = value; },
      change: jest.fn(async (mutate) => { mutate(); snapshots.push(job.checklist.map((item) => item.state).join(',')); }),
      step: jest.fn(async (text, state) => { steps.push([text, state]); }),
      findFile: jest.fn(async () => file),
      runTests: jest.fn(async () => tests),
      review: jest.fn(async () => (review instanceof Error ? Promise.reject(review) : review)),
    };
    return out;
  }

  test('each item is checked its own way, shown as it is checked, and the list is checked off', async () => {
    const job = oneJob({ kind: 'code', checklist: ['The header shows the date', { item: 'The header file exists', path: 'src/Header.jsx' }] });
    const d = deps();
    d.watch(job);
    const { seen, verdict } = await checkAnswer({ job, answer: 'Added the date.', toolActions: [edit], deps: d });
    expect(verdict.ok).toBe(true);
    expect(job.checklist.map((item) => [item.how, item.state, item.line])).toEqual([
      ['answer', 'ticked', 'The header shows the date.'],
      ['file', 'ticked', 'Found src/Header.jsx in the project.'],
      ['tests', 'ticked', 'The project\'s tests passed (12 tests).'],
    ]);
    expect(d.snapshots).toEqual([
      'open,open,open', 'open,checking,open', 'open,ticked,open', 'open,ticked,checking', 'open,ticked,ticked',
      'checking,ticked,ticked', 'ticked,ticked,ticked',
    ]);
    expect(d.steps).toEqual([['Checking all 3 items on the list', 'now'], ['All 3 checked off', 'done']]);
    expect(seen).toEqual(['Nexus changed 1 file: src/Header.jsx.', 'The project\'s tests passed (12 tests).']);
    // The read-over sees what the tests really did, and judges only its own items.
    const [, user] = d.review.mock.calls[0][0];
    expect(user.content).toContain('Items to judge:\n1. The header shows the date\n');
    expect(user.content).toContain('- The project\'s tests passed (12 tests).');
  });

  test('failing tests and a missing file are not true yet; the read-over still runs so the send-back has everything', async () => {
    const job = oneJob({ kind: 'code', checklist: ['The header shows the date', { item: 'The header file exists', path: 'src/Header.jsx' }] });
    const d = deps({
      tests: { ran: true, ok: false, line: 'The project\'s tests failed (1 of 12 failed).', detail: 'FAIL tests/header.test.js' },
      file: { exists: false, line: 'src/Header.jsx is not in the project.' },
      review: '1 FAIL The answer only says it will add the date later.',
    });
    d.watch(job);
    const { verdict } = await checkAnswer({ job, answer: 'I will add it later.', toolActions: [edit], deps: d });
    expect(verdict.ok).toBe(false);
    expect(verdict.items.map((item) => item.how)).toEqual(['answer', 'file', 'tests']);
    expect(job.checklist[2].detail).toBe('FAIL tests/header.test.js');
    expect(d.steps.at(-1)).toEqual(['0 of 3 checked off', 'bad']);
  });

  test('tests that cannot run here, and a read-over that never answers, leave the item not checked, never ticked', async () => {
    const job = oneJob({ kind: 'code', checklist: ['The header shows the date'] });
    const blocked = deps({ tests: { ran: false, ok: null, blocked: true, line: 'I could not run the tests: only this computer\'s owner can run them.' } });
    blocked.watch(job);
    const out = await checkAnswer({ job, answer: 'Added.', toolActions: [edit], deps: blocked });
    expect(out.verdict).toMatchObject({ ok: null, item: { how: 'tests', state: 'unknown' } });

    const silent = deps({ review: new Error('The AI request could not be completed.') });
    const answerJob = oneJob({ agent: 'echo', checklist: ['One plain line'] });
    silent.watch(answerJob);
    const later = await checkAnswer({ job: answerJob, answer: 'Here it is.', toolActions: [], deps: silent });
    expect(later.verdict.ok).toBeNull();
    expect(answerJob.checklist[0].line).toBe('I could not read it over: The AI request could not be completed.');
    expect(silent.runTests).not.toHaveBeenCalled();
  });

  test('an answer job that turned out to change files gets the project\'s tests on its list', async () => {
    const job = oneJob({ agent: 'atlas', checklist: ['The cause is named'] });
    const d = deps({ review: 'PASS\nThe cause is named.' });
    d.watch(job);
    const { verdict } = await checkAnswer({ job, answer: 'Found it and fixed it.', toolActions: [edit], deps: d });
    expect(listOf(job)).toEqual([['The cause is named', 'answer', false], [TESTS_ITEM, 'tests', true]]);
    expect(verdict.ok).toBe(true);
    expect(d.runTests).toHaveBeenCalledTimes(1);
  });
});

describe('looking for a file in the project', () => {
  const ask = (readFile, project = 'Homebase') => findProjectFile({ agentId: 'nexus', project, path: 'src/Header.jsx', context: { userId: 7 }, readFile });

  test('found, a folder, missing here or on GitHub, and could not look', async () => {
    const readFile = jest.fn(async () => 'file text');
    expect(await ask(readFile)).toEqual({ exists: true, line: 'Found src/Header.jsx in the project.' });
    expect(readFile).toHaveBeenCalledWith('nexus', 'project_read', { project: 'Homebase', path: 'src/Header.jsx', max_chars: 200 }, { userId: 7 });
    const fail = (error) => async () => { throw error; };
    expect((await ask(fail(Object.assign(new Error('EISDIR'), { code: 'EISDIR' })))).exists).toBe(true);
    expect(await ask(fail(Object.assign(new Error('no such file'), { code: 'ENOENT' })))).toEqual({ exists: false, line: 'src/Header.jsx is not in the project.' });
    expect((await ask(fail(new Error('GitHub API error 404: Not Found')))).exists).toBe(false);
    expect(await ask(fail(new Error('This agent is not authorized for that project in the current workspace.')))).toEqual({
      exists: null, line: 'I could not look for src/Header.jsx: This agent is not authorized for that project in the current workspace.',
    });
    expect((await ask(readFile, null)).exists).toBeNull();
  });
});
