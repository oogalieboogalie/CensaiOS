// Censai the orchestrator: the pure parts (server/censaiOrchestrator): reading Censai's
// plan, the words that go to the family and the one result line. The
// checklist itself: censaiOrchestratorChecklist.test.js.
import { jest } from '@jest/globals';
import {
  FILE_CHANGERS, PlanInputError, addStep, clip, normalizePlanInput, publicPlan, handoffAgentId, settleStep,
} from '../server/censaiOrchestrator/shape.js';
import { jobPrompt, parseItemReview, reviewMessages, sendBackPrompt, summaryLine } from '../server/censaiOrchestrator/prompts.js';
import { needsTests, readEvidence, workLines } from '../server/censaiOrchestrator/check.js';
import {
  codeFilesIn, readTestScript, runProjectTests, testCounts, whyNoTestsHere, whyTestsCannotRun,
} from '../server/censaiOrchestrator/projectTests.js';
import { storable } from '../server/censaiOrchestrator/store.js';
import { turnError } from '../server/censaiOrchestrator/job.js';

const item = (n, text, state = 'ticked', over = {}) => ({ n, text, how: 'answer', state, line: '', ...over });
const job = (over = {}) => ({
  n: 1, agentId: 'nexus', title: 'Add the date', task: 'Add the date to the header.', kind: 'code',
  checklist: [item(1, 'The date shows.', 'ticked', { line: 'The header shows the date.' }),
    item(2, 'The project\'s tests pass', 'ticked', { how: 'tests', auto: true, line: 'The project\'s tests passed (12 tests).' })],
  status: 'done', attempts: 1, answer: '', error: null, stuckOn: null, steps: [], seen: [], ...over,
});

describe('reading Censai\'s plan', () => {
  test('a good plan becomes jobs in order, each waiting its turn', () => {
    const plan = normalizePlanInput({
      goal: 'Show the date in the header',
      project: 'Homebase',
      jobs: [
        { agent: 'Nexus', job: 'Add the date to the header. Use the board clock.', checklist: ['The date shows.'], kind: 'code' },
        { agent: 'the Echo', job: 'Write one line for the changelog.', checklist: [{ item: 'One plain line.' }] },
      ],
    });
    expect(plan.goal).toBe('Show the date in the header');
    expect(plan.project).toBe('Homebase');
    expect(plan.jobs.map((entry) => [entry.n, entry.agentId, entry.kind, entry.status])).toEqual([
      [1, 'nexus', 'code', 'waiting'], [2, 'echo', 'answer', 'waiting'],
    ]);
    expect(plan.jobs[0].title).toBe('Add the date to the header.');
    expect(plan.jobs[1].checklist).toEqual([{ n: 1, text: 'One plain line.', how: 'answer', state: 'open', line: '' }]);
  });

  test('jobs and checklists sent as JSON strings still read, and done_when alone is one item', () => {
    const plan = normalizePlanInput({
      goal: 'g',
      jobs: JSON.stringify([{ agent: 'atlas', job: 'Look at the API.', checklist: JSON.stringify(['Every route is named.']) }]),
    });
    expect(plan.jobs[0].agentId).toBe('atlas');
    expect(plan.jobs[0].checklist.map((entry) => entry.text)).toEqual(['Every route is named.']);
    const legacy = normalizePlanInput({ goal: 'g', jobs: [{ agent: 'atlas', job: 'Look at the API.', done_when: 'x' }] });
    expect(legacy.jobs[0].checklist.map((entry) => [entry.text, entry.how])).toEqual([['x', 'answer']]);
  });

  test('a bad plan is refused with words Censai can act on', () => {
    const ok = { checklist: ['It is done.'] };
    expect(() => normalizePlanInput({ jobs: [{ agent: 'nexus', job: 'x', ...ok }] })).toThrow(/goal/);
    expect(() => normalizePlanInput({ goal: 'g', jobs: [] })).toThrow(/at least one job/);
    expect(() => normalizePlanInput({ goal: 'g', jobs: Array(5).fill({ agent: 'nexus', job: 'x', ...ok }) })).toThrow(/At most 4/);
    expect(() => normalizePlanInput({ goal: 'g', jobs: [{ agent: 'censai', job: 'x', ...ok }] })).toThrow(/not a family member I can hand work to/);
    expect(() => normalizePlanInput({ goal: 'g', jobs: [{ agent: 'nexus', ...ok }] })).toThrow(/say what Nexus should do/);
    expect(() => normalizePlanInput({ goal: 'g', jobs: [{ agent: 'echo', job: 'Fix the bug.', kind: 'code', ...ok }] }))
      .toThrow(/Echo can read project files but not change them/);
    expect(() => normalizePlanInput({ goal: 'g', jobs: [{ agent: 'nexus', job: 'Fix it.' }] })).toThrow(/Job 1: give a checklist/);
    expect(() => normalizePlanInput({ goal: 'g', jobs: 'nope' })).toThrow(PlanInputError);
  });

  test('only family members with file tools take code jobs, and Censai is never one of them', () => {
    expect(FILE_CHANGERS).toEqual(expect.arrayContaining(['atlas', 'nexus', 'genesis', 'architect', 'phoenix']));
    expect(FILE_CHANGERS).not.toContain('echo');
    expect(handoffAgentId('The Architect')).toBe('architect');
    expect(handoffAgentId('censai')).toBeNull();
  });
});

describe('steps and the public shape', () => {
  test('a step in progress is replaced by its outcome', () => {
    const entry = job({ steps: [] });
    addStep(entry, 'Handed to Nexus', 'done', 0);
    addStep(entry, 'Nexus is working on it', 'now', 1);
    settleStep(entry, 'Nexus answered', 'done', 2);
    settleStep(entry, 'Checked: it works', 'done', 3);
    expect(entry.steps.map((step) => [step.text, step.state])).toEqual([
      ['Handed to Nexus', 'done'], ['Nexus answered', 'done'], ['Checked: it works', 'done'],
    ]);
  });

  test('text is saved as Postgres takes it, and is never cut through an emoji', () => {
    expect(storable({ a: 'x\u0000y', b: ['\ud83d', 'ok \ud83d\ude00'], c: { d: '\ude00 left' }, n: 3, none: null })).toEqual({
      a: 'xy', b: ['\ufffd', 'ok \ud83d\ude00'], c: { d: '\ufffd left' }, n: 3, none: null,
    });
    const cut = clip('ab\ud83d\ude00cd', 4);
    expect(cut).toBe('ab\u2026');
    expect(clip('abc\ud83d\ude00', 5)).toBe('abc\ud83d\ude00');
    expect(clip('abcdef', 4)).toBe('abc\u2026');
  });

  test('the browser gets names and the checklist, and answers only when asked', () => {
    const tests = item(2, 'The project\'s tests pass', 'failed', { how: 'tests', auto: true, line: 'failed', detail: 'x'.repeat(2000) });
    const row = {
      id: 'p1', goal: 'g', project: null, status: 'done', summary: 'Done.', created_at: '2026-10-18T21:00:00Z',
      updated_at: '2026-10-18T21:01:00Z', finished_at: null, reported_at: null,
      jobs: [job({ answer: 'I added it.', seen: ['Nexus changed 1 file: src/Header.jsx.'], checklist: [job().checklist[0], tests] })],
    };
    const plain = publicPlan(row);
    expect(plain.jobs[0]).toMatchObject({ agent: 'Nexus', status: 'done', stuckOn: null, seen: ['Nexus changed 1 file: src/Header.jsx.'] });
    expect(plain.jobs[0].answer).toBeUndefined();
    expect(plain.jobs[0].checklist[0]).toEqual({ n: 1, text: 'The date shows.', how: 'answer', state: 'ticked', line: 'The header shows the date.' });
    expect(plain.jobs[0].checklist[1]).toMatchObject({ how: 'tests', auto: true, state: 'failed' });
    expect(plain.jobs[0].checklist[1].detail.length).toBeLessThanOrEqual(1500);
    expect(publicPlan(row, { withAnswers: true }).jobs[0].answer).toBe('I added it.');
  });
});

describe('the words that go out', () => {
  test('the job prompt carries the plan, the job, its checklist and what was checked before, nothing canned', () => {
    const prompt = jobPrompt({
      plan: { goal: 'Show the date', project: 'Homebase' },
      job: job({ n: 2, checklist: [...job().checklist, item(3, 'The header file exists', 'open', { how: 'file', path: 'src/Header.jsx' })] }),
      earlier: [{ agentId: 'atlas', answer: 'The header lives in Header.jsx.' }],
      total: 2,
    });
    expect(prompt).toContain('part 2 of 2');
    expect(prompt).toContain('The whole plan: Show the date');
    expect(prompt).toContain('Project: Homebase');
    expect(prompt).toContain('Censai checks off each item on this list itself before it counts as done:\n1. The date shows.\n'
      + '2. The project\'s tests pass (Censai runs the project\'s tests)\n3. The header file exists (Censai looks for src/Header.jsx)');
    expect(prompt).toContain('- Atlas: The header lives in Header.jsx.');
    const back = sendBackPrompt([
      item(1, 'The date shows.', 'failed', { line: 'The answer only says it will add it later.' }),
      item(2, 'The project\'s tests pass', 'failed', { how: 'tests', line: 'The project\'s tests failed (1 of 3 failed).', detail: 'FAIL header.test.js' }),
    ]);
    expect(back).toContain('- The date shows.: The answer only says it will add it later.');
    expect(back).toContain('- The project\'s tests pass: The project\'s tests failed (1 of 3 failed).');
    expect(back).toContain('FAIL header.test.js');
  });

  test('the read-over judges each item on its own, and an item it skips stays not checked', () => {
    const verdicts = parseItemReview('1 PASS The date shows in the header.\n**2. FAIL** - the colour was never changed\nItem 4: PASS', 3);
    expect([...verdicts.entries()]).toEqual([
      [1, { ok: true, sentence: 'The date shows in the header.' }],
      [2, { ok: false, sentence: 'the colour was never changed' }],
    ]);
    expect(parseItemReview('Verdict: pass\nLine 2: All done.', 1).get(1)).toEqual({ ok: true, sentence: 'All done.' });
    expect(parseItemReview('FAIL', 1).get(1)).toEqual({ ok: false, sentence: 'It is not done yet.' });
    expect(parseItemReview('PASS', 2).size).toBe(0);
    expect(parseItemReview('Looks good to me!', 1).size).toBe(0);
    // Only PASS or FAIL in capitals, as the verdict, counts: an item's own words never do.
    expect(parseItemReview('1. Pass the locale through: FAIL it still uses en-US', 1).get(1)).toEqual({ ok: false, sentence: 'it still uses en-US' });
    expect(parseItemReview('Pass/fail check:', 1).size).toBe(0);
    expect(parseItemReview('Item 1 looks like a PASS since it shows', 1).size).toBe(0);
    expect(parseItemReview('PASS?', 1).size).toBe(0);
    expect(parseItemReview('pass', 1).size).toBe(0);
    expect(parseItemReview('| 1 | The date shows | PASS | It shows |', 1).get(1)).toEqual({ ok: true, sentence: 'It shows' });
    expect(parseItemReview('1. The date shows \u2014 PASS \u2014 it is in the header', 1).get(1)).toEqual({ ok: true, sentence: 'it is in the header' });
    // A FAIL anywhere for an item wins, whichever line comes first.
    expect(parseItemReview('1 PASS It shows.\n1 FAIL Actually it does not.', 1).get(1)).toEqual({ ok: false, sentence: 'Actually it does not.' });
    expect(parseItemReview('1 FAIL It does not.\n1 PASS Yes it does.', 1).get(1)).toEqual({ ok: false, sentence: 'It does not.' });
    const [system, user] = reviewMessages({
      job: job(), answer: 'Added.', items: [job().checklist[0], item(3, 'The colour is the brand gold.')], seen: ['Nexus changed 1 file: Header.jsx.'],
    });
    expect(system.content).toMatch(/one line per item/);
    expect(user.content).toContain('Items to judge:\n1. The date shows.\n2. The colour is the brand gold.');
    expect(user.content).toContain('- Nexus changed 1 file: Header.jsx.');
  });

  test('the result line: done, stuck on an item, stuck without one, and stopped', () => {
    const done = { goal: 'Show the date.', status: 'done', jobs: [job()] };
    expect(summaryLine(done, 'Nexus added the date to the header and the tests pass.')).toBe('Nexus added the date to the header and the tests pass.');
    expect(summaryLine(done)).toBe('Done: Show the date. All 2 items on the list are checked off.');
    expect(summaryLine({ ...done, jobs: [job({ checklist: [job().checklist[0]] })] })).toBe('Done: Show the date. The one item on the list is checked off.');
    const stuck = {
      goal: 'g', status: 'stuck',
      jobs: [
        job({ status: 'stuck', stuckOn: 2, error: 'Nexus tried twice and it still does not check out. The project\'s tests failed (1 of 12 failed).' }),
        job({ n: 2, agentId: 'echo', status: 'skipped' }),
      ],
    };
    expect(summaryLine(stuck)).toBe('Stuck on "The project\'s tests pass" in Nexus\'s part. Nexus tried twice and it still does not check out. '
      + 'The project\'s tests failed (1 of 12 failed). I stopped there, so Echo did not start.');
    const noItem = { goal: 'g', status: 'stuck', jobs: [job({ status: 'stuck', error: 'Nexus did not finish within 8 minutes' })] };
    expect(summaryLine(noItem)).toBe('Stuck on Nexus\'s part. Nexus did not finish within 8 minutes.');
    const stopped = { goal: 'g', status: 'stopped', jobs: [job({ status: 'stopped' }), job({ n: 2, agentId: 'echo', status: 'skipped' })] };
    expect(summaryLine(stopped)).toBe('Stopped while Nexus was on part 1, as you asked. Echo did not start.');
    expect(summaryLine({ goal: 'g', status: 'stopped', jobs: [job({ status: 'skipped' })] })).toBe('Stopped, as you asked. Nexus did not start.');
  });

  test('turn errors become plain words, a time-out says how long', () => {
    expect(turnError({ code: 'CHAT_ABORTED' }, 'Nexus', 10, 8 * 60 * 1000)).toBe('Nexus did not finish within 8 minutes.');
    expect(turnError(Object.assign(new Error('"gpt-x" requires a personal API key. Add one in Settings.'), {
      code: 'MODEL_ACCESS_PERSONAL_KEY_REQUIRED', statusCode: 403,
    }), 'Nexus', 10)).toMatch(/requires a personal API key/);
    expect(turnError(new Error('socket hang up at 10.0.0.1'), 'Nexus', 10)).toBe('The AI request could not be completed. Try again shortly.');
  });
});

describe('what the agent really did', () => {
  const actions = [
    { tool: 'project_edit', ok: true, args: { project: 'Homebase', path: 'src/Header.jsx' }, summary: { path: 'src/Header.jsx' } },
    {
      tool: 'project_write', ok: false, args: { path: 'src/nope.js' },
      result_preview: 'Error: TOOL_APPROVAL_GRANT_REQUIRED: The approval module for this tool is not equipped.',
    },
    { tool: 'project_write', ok: false, args: { path: 'src/nope.js' }, result: 'Error: a later failure' },
    { tool: 'canvas_append_window', ok: false, args: {}, result: 'APPROVAL_REQUIRED: ap-1 is pending owner/admin review. No action was executed.' },
    { tool: 'run_tests', ok: true, args: {}, result: 'TEST RUN — FAILED (exit 1)\nExit code: 1' },
    { tool: 'recall', ok: true, args: { query: 'x' } },
  ];

  test('files, projects and failed steps, with why they failed, come from the tool calls', () => {
    const evidence = readEvidence(actions);
    expect(evidence).toEqual({
      files: ['src/Header.jsx'], projects: ['Homebase'], shell: false, failedTools: ['project_write', 'canvas_append_window'],
      failures: [
        { tool: 'project_write', why: 'did not go through: The approval module for this tool is not equipped' },
        { tool: 'canvas_append_window', why: 'is waiting for an OK in Action Approvals' },
      ],
      agentTests: [false],
    });
    expect(workLines(evidence, job())).toEqual([
      'Nexus changed 1 file: src/Header.jsx.',
      'Nexus ran the tests and they failed.',
      'Nexus\'s project_write did not go through: The approval module for this tool is not equipped.',
      'Nexus\'s canvas_append_window is waiting for an OK in Action Approvals.',
    ]);
    const many = ['a_tool', 'b_tool', 'c_tool', 'd_tool', 'e_tool'].map((tool) => ({ tool, ok: false }));
    expect(workLines(readEvidence(many), job()).slice(-2)).toEqual([
      'Nexus\'s c_tool did not go through.',
      '2 more of Nexus\'s steps did not go through.',
    ]);
    expect(workLines(readEvidence([]), job())).toEqual(['Nexus did not change any files.']);
  });

  test('the project a file went to comes from the tool\'s own result, and every file of a multi-edit counts', () => {
    const wrote = readEvidence([
      { tool: 'project_write', ok: true, args: { path: 'src/a.js' }, result_preview: 'Wrote src/a.js in date-badge on `main`. \u2192 open it in Files' },
      { tool: 'project_edit', ok: true, args: { project: 'Homebase', path: 'src/b.js' }, result: 'Edited src/b.js in app. \u2192 see the diff' },
      {
        tool: 'project_multi_edit', ok: true, args: { edits: [{ path: 'src/c.js' }, { path: 'src/d.js' }] },
        result_preview: 'Multi-edit: 2/2 files edited in app.\n- src/c.js\n- src/d.js',
      },
    ]);
    expect(wrote.files).toEqual(['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js']);
    expect(wrote.projects).toEqual(['date-badge', 'app']);
  });

  test('only a change a test could see needs the tests: words and pictures alone do not', () => {
    const write = (path) => ({ tool: 'project_write', ok: true, args: { path } });
    expect(needsTests(readEvidence([write('README.md'), write('docs/shot.PNG'), write('CHANGELOG.txt')]))).toBe(false);
    expect(needsTests(readEvidence([write('README.md'), write('src/Header.jsx')]))).toBe(true);
    expect(needsTests(readEvidence([write('package.json')]))).toBe(true);
    expect(needsTests(readEvidence([{ tool: 'terminal_run', ok: true, args: { command: 'npm i' } }]))).toBe(true);
    expect(needsTests(readEvidence([{ tool: 'recall', ok: true, args: {} }]))).toBe(false);
  });
});

describe('the project\'s own tests', () => {
  const owner = { query: async () => ({ rows: [{ role: 'admin' }] }) };
  const teammate = { query: async () => ({ rows: [{ role: 'user' }] }) };
  const base = {
    agentId: 'nexus', project: 'app', files: ['src/Header.jsx', 'README.md'], context: { userId: 1, workspaceId: 'ws' },
    resolve: async () => ({ cwd: '/work/app' }),
    readPkg: async () => ({ scripts: { test: 'jest' }, devDependencies: { jest: '29' } }),
  };

  test('counts tests from Jest, Vitest and TAP output', () => {
    expect(testCounts('Tests:       1 failed, 2 passed, 3 total')).toEqual({ total: 3, failed: 1 });
    expect(testCounts('Tests  1 failed | 4 passed (5)')).toEqual({ total: 5, failed: 1 });
    expect(testCounts('ok 1 - a\nnot ok 2 - b\n# tests 5\n# pass 4\n# fail 1\n')).toEqual({ total: 5, failed: 1 });
    expect(testCounts('# tests 2\n# pass 2\n')).toEqual({ total: 2, failed: 0 });
    expect(testCounts('nothing')).toEqual({ total: 0, failed: 0 });
    expect(codeFilesIn('/work/app', ['/work/app/src/a.ts', 'b.md', '../c.js', 'src\\d.jsx'])).toEqual(['src/a.ts', 'src/d.jsx']);
  });

  test('a teammate cannot run them; the owner runs only the related tests, in a plain environment', async () => {
    const run = jest.fn(async () => ({ stdout: 'Tests:       2 passed, 2 total', stderr: '', code: 0 }));
    expect(await runProjectTests({ ...base, db: teammate, run })).toMatchObject({
      ran: false, blocked: true, line: 'I could not run the tests: only this computer\'s owner can run them.',
    });
    expect(run).not.toHaveBeenCalled();
    expect(await whyTestsCannotRun(teammate, base.context)).toBe('I could not run the tests: only this computer\'s owner can run them.');
    expect(await whyTestsCannotRun(owner, base.context)).toBeNull();
    const env = { PATH: '/bin', OPENAI_API_KEY: 'sk-secret', HOME: '/home/a' };
    const saved = process.env;
    process.env = { ...saved, ...env };
    let result;
    try {
      result = await runProjectTests({ ...base, db: owner, run });
    } finally {
      process.env = saved;
    }
    expect(result).toMatchObject({ ran: true, ok: true, total: 2, line: 'The project\'s tests passed (2 tests).' });
    const [command, args, options] = run.mock.calls[0];
    expect(command).toBe('npm');
    expect(args).toEqual(['test', '--', '--findRelatedTests', 'src/Header.jsx', '--passWithNoTests']);
    expect(options.cwd).toBe('/work/app');
    expect(options.env.OPENAI_API_KEY).toBeUndefined();
    expect(options.env).toMatchObject({ NODE_ENV: 'test', CI: '1', PATH: '/bin' });
  });

  test('a failing exit code is a failure even though the runner did not throw', async () => {
    const run = async () => ({ stdout: 'Tests:       1 failed, 1 passed, 2 total', stderr: 'boom', code: 1 });
    expect(await runProjectTests({ ...base, db: owner, run })).toMatchObject({
      ran: true, ok: false, failed: 1, line: 'The project\'s tests failed (1 of 2 failed).',
    });
  });

  test('no test covers the change, or only non-code files changed: the whole test script runs, so a pass means something', async () => {
    const run = jest.fn()
      .mockResolvedValueOnce({ stdout: 'No tests found related to files changed since last commit.', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'Tests:       40 passed, 40 total', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'Tests:       40 passed, 40 total', stderr: '', code: 0 });
    expect(await runProjectTests({ ...base, db: owner, run })).toMatchObject({ ran: true, ok: true, total: 40 });
    expect(run.mock.calls.map((callArgs) => callArgs[1])).toEqual([
      ['test', '--', '--findRelatedTests', 'src/Header.jsx', '--passWithNoTests'], ['test'],
    ]);
    expect(await runProjectTests({ ...base, files: ['README.md'], db: owner, run })).toMatchObject({ ran: true, ok: true, total: 40 });
    expect(run.mock.calls[2][1]).toEqual(['test']);
  });

  test('no tests set up, npm missing, and commands turned off are each said plainly', async () => {
    const run = jest.fn();
    expect(await runProjectTests({ ...base, db: owner, run, readPkg: async () => ({ scripts: {} }) })).toMatchObject({
      ran: false, blocked: false, line: 'This project has no tests set up, so I could not run any.',
    });
    expect((await runProjectTests({ ...base, db: owner, run: async () => ({ code: 'ENOENT' }) })).line).toMatch(/npm did not start/);
    const off = async () => { throw new Error('Dangerous execution is disabled. Enable RUNNER_ENABLED.'); };
    expect(await runProjectTests({ ...base, db: owner, run: off })).toMatchObject({
      blocked: true, line: 'I could not run the tests: running commands is turned off on this computer.',
    });
    expect(run).not.toHaveBeenCalled();
  });
  test('the tests run in the plan\'s project, and only vouch for changes made there', async () => {
    const run = jest.fn(async () => ({ stdout: 'Tests:       2 passed, 2 total', stderr: '', code: 0 }));
    const folders = { app: '/work/app', other: '/work/other', same: '/work/app' };
    const resolve = async (_agent, { project }) => ({ cwd: folders[project] });
    const elsewhere = await runProjectTests({ ...base, projects: ['app', 'other'], resolve, db: owner, run });
    expect(elsewhere).toEqual({
      ran: false, ok: false, blocked: false,
      line: 'Nexus changed files outside app (other), so its tests can\'t vouch for them. Keep the changes in app.',
    });
    const outside = await runProjectTests({ ...base, files: ['/work/elsewhere/x.js'], resolve, db: owner, run });
    expect(outside.line).toBe('Nexus changed files outside app (/work/elsewhere/x.js), so its tests can\'t vouch for them. Keep the changes in app.');
    expect(run).not.toHaveBeenCalled();
    // Another name for the same folder is the same project.
    expect(await runProjectTests({ ...base, projects: ['app', 'same'], resolve, db: owner, run })).toMatchObject({ ran: true, ok: true });
    // No project on the plan: the one the agent wrote to, and never a guess between two.
    expect(await runProjectTests({ ...base, project: null, projects: ['other'], resolve, db: owner, run })).toMatchObject({ ran: true, ok: true });
    expect(run.mock.calls.at(-1)[2].cwd).toBe('/work/other');
    expect((await runProjectTests({ ...base, project: null, projects: ['app', 'other'], resolve, db: owner, run })).line)
      .toBe('Nexus changed files in more than one project (app, other), so I could not test them in one go.');
    expect((await runProjectTests({ ...base, project: null, resolve, db: owner, run })).line).toBe('I could not tell which project to run the tests in.');
  });

  test('a changed test script cannot pass for the tests', async () => {
    const run = jest.fn(async () => ({ stdout: 'ok', stderr: '', code: 0 }));
    const changed = await runProjectTests({ ...base, expectScript: 'jest --ci', db: owner, run });
    expect(changed).toEqual({
      ran: false, ok: false, blocked: false,
      line: 'Nexus changed how the project\'s tests run (the test script in package.json), so a pass would not prove anything. Put it back the way it was.',
    });
    expect(run).not.toHaveBeenCalled();
    expect(await runProjectTests({ ...base, expectScript: 'jest', db: owner, run })).toMatchObject({ ran: true, ok: true });
    // A project with no tests before the job may get its first ones.
    expect(await runProjectTests({ ...base, expectScript: '', db: owner, run })).toMatchObject({ ran: true, ok: true });
  });

  test('a project the tests cannot reach here is said plainly, before and after the job', async () => {
    const onGitHub = async () => { throw new Error('Project "app" is GitHub-backed. Use the GitHub tools.'); };
    const noFolder = async () => { throw new Error('Project "app" does not have a local path.'); };
    const missing = async () => { throw new Error('No project named app'); };
    expect(await whyNoTestsHere({ ...base, resolve: onGitHub })).toBe('The project "app" lives on GitHub, so I can\'t run its tests on this computer.');
    expect(await whyNoTestsHere({ ...base, resolve: noFolder })).toBe('The project "app" has no folder on this computer, so I can\'t run its tests here.');
    expect(await whyNoTestsHere({ ...base, resolve: missing })).toBe('I could not find the project "app" to run its tests.');
    expect(await whyNoTestsHere(base)).toBeNull();
    expect(await runProjectTests({ ...base, resolve: onGitHub, db: owner, run: jest.fn() })).toMatchObject({
      ran: false, ok: null, blocked: true, line: 'The project "app" lives on GitHub, so I can\'t run its tests on this computer.',
    });
    expect(await readTestScript(base)).toBe('jest');
    expect(await readTestScript({ ...base, readPkg: async () => ({}) })).toBe('');
    expect(await readTestScript({ ...base, resolve: onGitHub })).toBeNull();
  });

  test('odd file names and commands run the whole test script instead of naming files', async () => {
    const run = jest.fn(async () => ({ stdout: 'Tests:       9 passed, 9 total', stderr: '', code: 0 }));
    await runProjectTests({ ...base, files: ['src/a b.js'], db: owner, run });
    await runProjectTests({ ...base, files: ['src/$(whoami).js'], db: owner, run });
    await runProjectTests({ ...base, files: ['src/Header.jsx'], shell: true, db: owner, run });
    expect(run.mock.calls.map((callArgs) => callArgs[1])).toEqual([['test'], ['test'], ['test']]);
  });

  test('a stopped run is said, and not run again', async () => {
    const controller = new AbortController();
    const run = jest.fn(async (_command, _args, options) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort();
      return { stdout: '', stderr: '', code: 'ABORT_ERR' };
    });
    expect(await runProjectTests({ ...base, db: owner, run, signal: controller.signal })).toMatchObject({
      ran: false, ok: null, blocked: true, line: 'The test run was stopped.',
    });
    expect(run).toHaveBeenCalledTimes(1);
    const loud = async () => ({ stdout: '', stderr: '', code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
    expect((await runProjectTests({ ...base, db: owner, run: loud })).line).toBe('The tests wrote more output than I can read, so I could not tell how they went.');
  });
});
