// Censai the orchestrator: plans running in the background (server/censaiOrchestrator/runner.js
// and job.js), with stand-ins for the family's runs, the mail, the tests, the
// project's files and Censai's own model, and an in-memory plan table.
import { jest } from '@jest/globals';
import { fakePlanDb } from './support/censaiPlanDb.js';
import {
  createPlan, planSettled, recoverOnce, resetPlansForTests, stopPlan,
} from '../server/censaiOrchestrator/runner.js';
import { normalizePlanInput } from '../server/censaiOrchestrator/shape.js';
import { claimReport, insertPlan, savePlan } from '../server/censaiOrchestrator/store.js';
import { onLogRecord } from '../server/logger.js';

const scope = { workspaceId: 'ws-1', userId: 7 };
const editOf = (path) => ({ tool: 'project_edit', ok: true, args: { project: 'Homebase', path }, summary: { path } });
const edit = editOf('src/Header.jsx');
const passed = { ran: true, ok: true, line: 'The project\'s tests passed (12 tests).', total: 12 };
const failed = { ran: true, ok: false, line: 'The project\'s tests failed (1 of 12 failed).', detail: 'FAIL tests/header.test.js' };

function harness({ turns = [], reviews = [], tests = [], files = [], report = 'It is done and checked.', answer = null } = {}) {
  const db = fakePlanDb();
  const mail = [];
  const read = [];
  const agentCalls = [];
  let mailId = 100;
  const deps = {
    db,
    now: () => Date.now(),
    runAgent: jest.fn(async (input) => {
      agentCalls.push({ ...input, messages: input.messages.map((m) => ({ ...m })) });
      if (answer) return answer(input);
      const next = turns.shift();
      if (typeof next === 'function') return next(input);
      if (next instanceof Error) throw next;
      return next || { finalText: 'Done.', toolActions: [] };
    }),
    sendMail: jest.fn(async (from, to, content, opts) => {
      mail.push({ from, to, content, opts });
      mailId += 1;
      return mailId;
    }),
    markRead: jest.fn(async (id) => { read.push(id); return true; }),
    runTests: jest.fn(async () => tests.shift() || passed),
    readTestScript: jest.fn(async () => 'jest'),
    findFile: jest.fn(async ({ path }) => files.shift() || { exists: true, line: `Found ${path} in the project.` }),
    censaiModel: jest.fn(async () => ({ model: 'stand-in', workspaceId: 'ws-1' })),
    askCensai: jest.fn(async (_model, messages) => {
      if (/tell the person what got done/.test(messages[0].content)) return report;
      return reviews.shift() ?? '1 PASS It is done.';
    }),
  };
  return { db, deps, mail, read, agentCalls };
}

async function runPlan(h, args) {
  const row = await createPlan({ ...scope, ...normalizePlanInput(args) }, h.deps);
  await planSettled(row.id);
  return h.db.row(row.id);
}

const steps = (job) => job.steps.map((step) => [step.text, step.state]);
const items = (job) => job.checklist.map((item) => [item.text, item.state, item.line]);

async function until(check) {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setImmediate(resolve));
  if (!check()) throw new Error('timed out waiting');
}

afterEach(() => resetPlansForTests());

describe('a plan from hand-off to one checked line', () => {
  test('the job goes by family mail, is answered, read over, and reported in one line', async () => {
    const records = [];
    const off = onLogRecord((record) => { if (record.namespace === 'censai-orchestrator') records.push(record.message); });
    const h = harness({
      turns: [{ finalText: 'The leads table has name, email and stage.', toolActions: [] }],
      reviews: ['1 PASS Nexus named all three columns.'],
      report: 'Nexus checked the leads table: it holds name, email and stage.',
    });
    const plan = await runPlan(h, {
      goal: 'Tell me what the leads table holds',
      jobs: [{ agent: 'nexus', job: 'Look at the leads table and list its columns.', checklist: ['Every column is named'] }],
    });
    off();
    expect(plan.status).toBe('done');
    expect(plan.summary).toBe('Nexus checked the leads table: it holds name, email and stage.');
    expect(plan.finished_at).toBeTruthy();
    expect(steps(plan.jobs[0])).toEqual([
      ['Handed to Nexus', 'done'],
      ['Nexus answered', 'done'],
      ['Checked off', 'done'],
    ]);
    expect(items(plan.jobs[0])).toEqual([['Every column is named', 'ticked', 'Nexus named all three columns.']]);
    // Family mail both ways, waking nobody, both already read.
    expect(h.mail.map((m) => [m.from, m.to, m.opts.messageType, m.opts.wake])).toEqual([
      ['censai', 'nexus', 'work_request', false], ['nexus', 'censai', 'agent_report', false],
    ]);
    expect(h.mail[1].opts.threadId).toBe(101);
    expect(h.read).toEqual([101, 102]);
    expect(h.agentCalls[0]).toMatchObject({
      origin: 'help', agentId: 'nexus', userId: 7, workspaceId: 'ws-1', conversationId: `censai-plan:${plan.id}:1`,
    });
    expect(h.agentCalls[0].messages[0].text).toContain('Your job: Look at the leads table and list its columns.');
    expect(h.agentCalls[0].messages[0].text).toContain('1. Every column is named');
    expect(h.deps.runTests).not.toHaveBeenCalled();
    expect(h.deps.readTestScript).not.toHaveBeenCalled();
    expect(records).toEqual(expect.arrayContaining(['plan made', 'plan started', 'job handed off', 'job answered', 'job checked', 'plan done']));
  });

  test('code work is checked off item by item: the file is found, the tests run, the reply is read', async () => {
    const h = harness({
      turns: [{ finalText: 'I added the date to src/Header.jsx.', toolActions: [edit] }],
      reviews: ['1 PASS The date shows in the header.'],
      report: 'Nexus added the date to the header, and the project\'s 12 tests pass.',
    });
    const plan = await runPlan(h, {
      goal: 'Show the date in the header',
      project: 'Homebase',
      jobs: [{
        agent: 'nexus', job: 'Add the date to the header.', kind: 'code',
        checklist: ['The date shows in the header', { item: 'The header file is there', path: 'src/Header.jsx' }],
      }],
    });
    expect(plan.status).toBe('done');
    // The tests run in the plan's project, against how they ran before the job, and stop with the plan.
    expect(h.deps.readTestScript).toHaveBeenCalledWith({ agentId: 'nexus', project: 'Homebase', context: scope });
    expect(h.deps.runTests).toHaveBeenCalledWith({
      agentId: 'nexus', project: 'Homebase', files: ['src/Header.jsx'], projects: ['Homebase'], shell: false,
      expectScript: 'jest', signal: expect.any(AbortSignal), context: scope,
    });
    expect(h.deps.findFile).toHaveBeenCalledWith({ agentId: 'nexus', project: 'Homebase', path: 'src/Header.jsx', context: scope });
    expect(items(plan.jobs[0])).toEqual([
      ['The date shows in the header', 'ticked', 'The date shows in the header.'],
      ['The header file is there', 'ticked', 'Found src/Header.jsx in the project.'],
      ['The project\'s tests pass', 'ticked', 'The project\'s tests passed (12 tests).'],
    ]);
    expect(plan.jobs[0].seen).toEqual(['Nexus changed 1 file: src/Header.jsx.', 'The project\'s tests passed (12 tests).']);
    expect(steps(plan.jobs[0])).toContainEqual(['All 3 checked off', 'done']);
  });

  test('an item not checked off sends it back once with what the checks showed, then everything is checked again', async () => {
    const h = harness({
      turns: [{ finalText: 'Added.', toolActions: [edit] }, { finalText: 'Fixed the header test.', toolActions: [editOf('tests/header.test.js')] }],
      tests: [failed, passed],
      reviews: ['1 PASS The date shows.', '1 PASS The date shows.'],
    });
    const plan = await runPlan(h, {
      goal: 'Show the date', project: 'Homebase',
      jobs: [{ agent: 'nexus', job: 'Add the date to the header.', checklist: ['The date shows'], kind: 'code' }],
    });
    expect(plan.status).toBe('done');
    expect(plan.jobs[0].attempts).toBe(2);
    const again = h.agentCalls[1].messages;
    expect(again.map((m) => m.from)).toEqual(['me', 'nexus', 'me']);
    expect(again[1].text).toBe('Added.');
    expect(again[2].text).toContain('- The project\'s tests pass: The project\'s tests failed (1 of 12 failed).');
    expect(again[2].text).toContain('FAIL tests/header.test.js');
    expect(steps(plan.jobs[0])).toContainEqual(['1 of 2 checked off', 'bad']);
    expect(steps(plan.jobs[0])).toContainEqual(['Sent it back to Nexus to fix: The project\'s tests pass', 'note']);
    // Both tries were read over and tested; then the one result line.
    expect(h.deps.runTests).toHaveBeenCalledTimes(2);
    expect(h.deps.askCensai).toHaveBeenCalledTimes(3);
    // The second run covers the first try's change too, so leaving its broken test out cannot pass.
    expect(h.deps.runTests.mock.calls[1][0]).toMatchObject({ files: ['src/Header.jsx', 'tests/header.test.js'], projects: ['Homebase'] });
    expect(h.deps.readTestScript).toHaveBeenCalledTimes(1);
    expect(items(plan.jobs[0]).map(([, state]) => state)).toEqual(['ticked', 'ticked']);
  });

  test('still failing after the send-back: stuck, and later jobs never start', async () => {
    const h = harness({
      turns: [{ finalText: 'Added.', toolActions: [edit] }, { finalText: 'Tried again.', toolActions: [edit] }],
      tests: [failed, failed],
    });
    const plan = await runPlan(h, {
      goal: 'Show the date',
      project: 'Homebase',
      jobs: [
        { agent: 'nexus', job: 'Add the date to the header.', checklist: ['The date shows'], kind: 'code' },
        { agent: 'echo', job: 'Write the changelog line.', checklist: ['One line'] },
      ],
    });
    expect(plan.status).toBe('stuck');
    expect(plan.jobs.map((job) => job.status)).toEqual(['stuck', 'skipped']);
    expect(plan.jobs[0].stuckOn).toBe(2);
    expect(plan.summary).toBe('Stuck on "The project\'s tests pass" in Nexus\'s part. Nexus tried twice and it still does not check out. '
      + 'The project\'s tests failed (1 of 12 failed). I stopped there, so Echo did not start.');
    expect(steps(plan.jobs[0]).at(-1)).toEqual(['Stuck on "The project\'s tests pass"', 'bad']);
    expect(items(plan.jobs[1])).toEqual([['One line', 'unknown', 'Not checked: this part did not start.']]);
    expect(h.deps.runAgent).toHaveBeenCalledTimes(2);
  });

  test('a run that cannot start says why in plain words', async () => {
    const keyMissing = Object.assign(new Error('"gpt-4o" requires a personal API key. Add one in Settings or use free AI access.'), {
      code: 'MODEL_ACCESS_PERSONAL_KEY_REQUIRED', statusCode: 403,
    });
    const h = harness({ turns: [keyMissing] });
    const plan = await runPlan(h, { goal: 'g', jobs: [{ agent: 'atlas', job: 'Look at the API.', checklist: ['Every route is named'] }] });
    expect(plan.status).toBe('stuck');
    expect(steps(plan.jobs[0])).toEqual([
      ['Handed to Atlas', 'done'],
      ['"gpt-4o" requires a personal API key. Add one in Settings or use free AI access.', 'bad'],
    ]);
    expect(plan.summary).toMatch(/^Stuck on Atlas's part\. "gpt-4o" requires a personal API key/);
    expect(items(plan.jobs[0])).toEqual([['Every route is named', 'unknown', 'Not checked: Atlas did not finish.']]);
  });

  test('tests that could not run leave the plan stuck on that item, never done, and are not sent back', async () => {
    const h = harness({
      turns: [{ finalText: 'Added the date.', toolActions: [edit] }],
      tests: [{ ran: false, ok: null, blocked: true, line: 'I could not run the tests: only this computer\'s owner can run them.' }],
      reviews: ['1 PASS The date was added.'],
    });
    const plan = await runPlan(h, {
      goal: 'g', project: 'Homebase', jobs: [{ agent: 'nexus', job: 'Add the date.', checklist: ['The date shows'], kind: 'code' }],
    });
    expect(plan.status).toBe('stuck');
    expect(plan.summary).toBe('Stuck on "The project\'s tests pass" in Nexus\'s part. I could not run the tests: only this computer\'s owner can run them.');
    expect(h.deps.runAgent).toHaveBeenCalledTimes(1);
    expect(items(plan.jobs[0]).map(([, state]) => state)).toEqual(['ticked', 'unknown']);
  });

  test('a read-over with no verdict is stuck on that item, never done', async () => {
    const h = harness({ reviews: ['Looks fine to me!'] });
    const plan = await runPlan(h, { goal: 'g', jobs: [{ agent: 'echo', job: 'Write a line.', checklist: ['One plain line'] }] });
    expect(plan.status).toBe('stuck');
    expect(plan.jobs[0].error).toBe('My read-over did not say whether this is true.');
    expect(plan.summary).toBe('Stuck on "One plain line" in Echo\'s part. My read-over did not say whether this is true.');
  });

  test('a file that is not there is sent back, and found the second time', async () => {
    const h = harness({
      turns: [{ finalText: 'Wrote the notes.', toolActions: [] }, { finalText: 'Saved docs/notes.md this time.', toolActions: [] }],
      files: [{ exists: false, line: 'docs/notes.md is not in the project.' }],
      reviews: ['1 PASS The notes are written.', '1 PASS The notes are written.'],
    });
    const plan = await runPlan(h, {
      goal: 'g', project: 'Homebase',
      jobs: [{ agent: 'genesis', job: 'Write the notes.', checklist: [{ item: 'The notes file is saved', path: 'docs/notes.md' }] }],
    });
    expect(plan.status).toBe('done');
    expect(h.agentCalls[1].messages[2].text).toContain('- The notes file is saved: docs/notes.md is not in the project.');
    expect(items(plan.jobs[0]).map(([, state]) => state)).toEqual(['ticked', 'ticked']);
  });

  test('a later job sees the checked answers before it', async () => {
    const h = harness({ turns: [{ finalText: 'The header lives in src/Header.jsx.' }, { finalText: 'Line written.' }] });
    const plan = await runPlan(h, {
      goal: 'g',
      jobs: [{ agent: 'atlas', job: 'Find the header file.', checklist: ['x'] }, { agent: 'echo', job: 'Write the line.', checklist: ['y'] }],
    });
    expect(plan.status).toBe('done');
    expect(h.agentCalls[1].messages[0].text).toContain('- Atlas: The header lives in src/Header.jsx.');
    expect(h.agentCalls[1].messages[0].text).toContain('part 2 of 2');
  });

  test('a fault on Censai\'s own side leaves the plan stuck, not running', async () => {
    const h = harness({ turns: [{ finalText: 'Added.', toolActions: [edit] }] });
    h.deps.runTests.mockRejectedValueOnce(new Error('runner exploded'));
    const plan = await runPlan(h, { goal: 'g', project: 'Homebase', jobs: [{ agent: 'nexus', job: 'Add it.', checklist: ['x'], kind: 'code' }] });
    expect(plan.status).toBe('stuck');
    expect(plan.jobs[0].error).toBe('Something went wrong on my side while running this part.');
    expect(items(plan.jobs[0]).map(([, state, line]) => [state, line])).toEqual([
      ['unknown', 'Not checked: something went wrong on my side.'], ['unknown', 'Not checked: something went wrong on my side.'],
    ]);
  });
});

describe('stopping and restarts', () => {
  test('stop ends the job in progress, skips the rest, and only the person can do it', async () => {
    const h = harness({
      turns: [(input) => new Promise((_resolve, reject) => {
        input.signal.addEventListener('abort', () => reject(Object.assign(new Error('Stopped'), { code: 'CHAT_ABORTED' })));
      })],
    });
    const row = await createPlan({
      ...scope,
      ...normalizePlanInput({
        goal: 'g',
        project: 'Homebase',
        jobs: [{ agent: 'nexus', job: 'Fix it.', checklist: ['x'], kind: 'code' }, { agent: 'echo', job: 'Tell them.', checklist: ['y'] }],
      }),
    }, h.deps);
    await until(() => h.agentCalls.length === 1);
    expect(await stopPlan({ id: row.id, workspaceId: 'ws-1', userId: 8 }, h.deps)).toBeNull();
    const stopped = await stopPlan({ id: row.id, ...scope }, h.deps);
    expect(stopped.status).toBe('stopped');
    await planSettled(row.id);
    const plan = h.db.row(row.id);
    expect(plan.status).toBe('stopped');
    expect(plan.jobs.map((job) => job.status)).toEqual(['stopped', 'skipped']);
    expect(plan.summary).toBe('Stopped while Nexus was on part 1, as you asked. Echo did not start.');
    expect(plan.jobs[0].steps.at(-1)).toMatchObject({ text: 'Stopped, as you asked', state: 'note' });
    expect(items(plan.jobs[0]).map(([, , line]) => line)).toEqual(['Not checked: you stopped the plan.', 'Not checked: you stopped the plan.']);
    // The result line is posted once: the first claim wins.
    expect(await claimReport(h.db, { id: row.id, ...scope })).toBe(true);
    expect(await claimReport(h.db, { id: row.id, ...scope })).toBe(false);
  });

  test('after a restart: unstarted plans run, plans between parts carry on, cut-off parts are not run twice', async () => {
    const h = harness({ answer: (input) => ({ finalText: `Answer to: ${/Your job: (.*)/.exec(input.messages[0].text)[1]}` }) });
    const jobs = (list, project) => normalizePlanInput({ goal: 'x', project, jobs: list }).jobs;
    const queued = await insertPlan(h.db, { ...scope, goal: 'Never started', project: null, jobs: jobs([{ agent: 'echo', job: 'Write a line.', checklist: ['x'] }]) });
    const cutJobs = jobs([{ agent: 'nexus', job: 'Fix it.', checklist: ['x'], kind: 'code' }, { agent: 'echo', job: 'Tell them.', checklist: ['y'] }], 'Homebase');
    Object.assign(cutJobs[0], { status: 'working', steps: [{ at: '2026-10-18T21:00:00Z', text: 'Nexus is working on it', state: 'now' }] });
    const cut = await insertPlan(h.db, { ...scope, goal: 'Cut off', project: 'Homebase', jobs: cutJobs });
    h.db.row(cut.id).status = 'running';
    const betweenJobs = jobs([{ agent: 'atlas', job: 'Find the file.', checklist: ['x'] }, { agent: 'echo', job: 'Say where it is.', checklist: ['y'] }]);
    Object.assign(betweenJobs[0], { status: 'done', answer: 'It is src/Header.jsx.' });
    Object.assign(betweenJobs[0].checklist[0], { state: 'ticked', line: 'It names the file.' });
    const between = await insertPlan(h.db, { ...scope, goal: 'Between parts', project: null, jobs: betweenJobs });
    h.db.row(between.id).status = 'running';

    await Promise.all([recoverOnce(h.deps), recoverOnce(h.deps)]);
    await Promise.all([planSettled(queued.id), planSettled(between.id)]);

    expect(h.db.row(queued.id).status).toBe('done');
    expect(h.db.row(between.id).status).toBe('done');
    expect(h.db.row(cut.id).status).toBe('stuck');
    expect(h.db.row(cut.id).jobs.map((job) => job.status)).toEqual(['stuck', 'skipped']);
    expect(h.db.row(cut.id).jobs[0].error).toBe('censaiOS restarted while Nexus was working on this. Ask me to run it again.');
    expect(h.db.row(cut.id).jobs[0].steps.at(-1)).toMatchObject({ text: 'Cut off when censaiOS restarted', state: 'bad' });
    expect(h.db.row(cut.id).jobs[0].checklist[0].line).toBe('Not checked: censaiOS restarted.');
    // Only the parts that had not run yet ran, once each.
    const asked = h.agentCalls.map((call) => /Your job: (.*)/.exec(call.messages[0].text)[1]).sort();
    expect(asked).toEqual(['Say where it is.', 'Write a line.']);
    const second = h.agentCalls.find((call) => call.agentId === 'echo' && call.messages[0].text.includes('Say where it is.'));
    expect(second.messages[0].text).toContain('- Atlas: It is src/Header.jsx.');
  });
  test('stop ends a test run in progress too', async () => {
    const h = harness({ turns: [{ finalText: 'Added.', toolActions: [edit] }] });
    h.deps.runTests.mockImplementationOnce(({ signal }) => new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve({ ran: false, ok: null, blocked: true, line: 'The test run was stopped.' }));
    }));
    const row = await createPlan({
      ...scope,
      ...normalizePlanInput({ goal: 'g', project: 'Homebase', jobs: [{ agent: 'nexus', job: 'Fix it.', checklist: ['x'], kind: 'code' }] }),
    }, h.deps);
    await until(() => h.deps.runTests.mock.calls.length === 1);
    expect((await stopPlan({ id: row.id, ...scope }, h.deps)).status).toBe('stopped');
    await planSettled(row.id);
    expect(h.deps.runTests.mock.calls[0][0].signal.aborted).toBe(true);
    expect(h.db.row(row.id).status).toBe('stopped');
    expect(h.db.row(row.id).jobs[0].status).toBe('stopped');
  });

  test('after a restart, a part that was already stuck is never built on', async () => {
    const h = harness();
    const stuckJobs = normalizePlanInput({
      goal: 'x', jobs: [{ agent: 'atlas', job: 'Find the file.', checklist: ['x'] }, { agent: 'echo', job: 'Say where it is.', checklist: ['y'] }],
    }).jobs;
    Object.assign(stuckJobs[0], { status: 'stuck', stuckOn: 1, error: 'Atlas tried twice and it still does not check out.' });
    Object.assign(stuckJobs[0].checklist[0], { state: 'failed', line: 'It names no file.' });
    // The server went down after the part was saved as stuck, before the plan was.
    const left = await insertPlan(h.db, { ...scope, goal: 'Stuck before the restart', project: null, jobs: stuckJobs });
    h.db.row(left.id).status = 'running';
    await recoverOnce(h.deps);
    await planSettled(left.id);
    const plan = h.db.row(left.id);
    expect(plan.status).toBe('stuck');
    expect(plan.jobs.map((job) => job.status)).toEqual(['stuck', 'skipped']);
    expect(plan.summary).toBe('Stuck on "x" in Atlas\'s part. Atlas tried twice and it still does not check out. I stopped there, so Echo did not start.');
    expect(h.deps.runAgent).not.toHaveBeenCalled();
  });

  test('a finished plan is never written over by a late save', async () => {
    const h = harness();
    const row = await insertPlan(h.db, { ...scope, goal: 'g', project: null, jobs: normalizePlanInput({ goal: 'g', jobs: [{ agent: 'echo', job: 'Write a line.', checklist: ['x'] }] }).jobs });
    h.db.row(row.id).status = 'stopped';
    expect(await savePlan(h.db, { id: row.id, status: 'done', summary: 'Done.', jobs: [] })).toBeNull();
    expect(h.db.row(row.id).status).toBe('stopped');
    // The guard is in the statement itself, so the database holds to it too.
    const db = { query: jest.fn(async () => ({ rows: [] })) };
    expect(await savePlan(db, { id: row.id, status: 'running', jobs: [] })).toBeNull();
    expect(db.query.mock.calls[0][0]).toMatch(/WHERE id = \$1 AND status IN \('queued', 'running'\)/);
  });
});
