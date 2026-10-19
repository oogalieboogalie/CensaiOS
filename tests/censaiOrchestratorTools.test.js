// Censai the orchestrator's tools: hand_off_jobs, jobs_status and stop_jobs
// (server/tools/handlers/censaiOrchestrator.js), who has them, and that Censai
// starts with them even when Censai's other tools are loaded on demand.
import { jest } from '@jest/globals';
import { fakePlanDb } from './support/censaiPlanDb.js';
import { handleCensaiPlanTool } from '../server/tools/handlers/censaiOrchestrator.js';
import { planSettled, resetPlansForTests } from '../server/censaiOrchestrator/runner.js';
import { normalizePlanInput } from '../server/censaiOrchestrator/shape.js';
import { insertPlan } from '../server/censaiOrchestrator/store.js';
import { FAMILY_DEFAULT_TOOL_NAMES, familyDefaultToolNames } from '../server/tools/rbac/familyBaseline.js';
import { TOOL_DEFINITIONS, listToolCatalog } from '../server/tools/definitions.js';
import { TOOL_REGISTRY } from '../server/tools/handlers/index.js';
import { createChatToolSession } from '../server/routes/chat/toolSession.js';
import { CENSAI_ORCHESTRATOR_PROMPT } from '../server/agents/censaiOrchestrator.js';

const context = { workspaceId: 'ws-1', userId: 7 };
const PLAN_TOOLS = ['hand_off_jobs', 'jobs_status', 'stop_jobs'];
const goodPlan = {
  goal: 'Show the date in the header',
  project: 'Homebase',
  jobs: [{ agent: 'nexus', job: 'Add the date to the header.', checklist: ['The date shows'], kind: 'code' }],
};
const lookIntoIt = {
  goal: 'Find out why the header has no date',
  jobs: [{ agent: 'atlas', job: 'Find where the header is drawn and why it has no date.', checklist: ['The file and the reason are named'] }],
};

function deps(db) {
  return {
    db,
    now: () => Date.now(),
    runAgent: jest.fn(async () => ({ finalText: 'Added the date.', toolActions: [] })),
    sendMail: jest.fn(async () => 1),
    markRead: jest.fn(async () => true),
    runTests: jest.fn(async () => ({ ran: true, ok: true, line: 'The project\'s tests passed (3 tests).' })),
    readTestScript: jest.fn(async () => 'jest'),
    whyNoTestsHere: jest.fn(async () => null),
    findFile: jest.fn(async () => ({ exists: true, line: 'Found it.' })),
    censaiModel: jest.fn(async () => ({ model: 'stand-in' })),
    askCensai: jest.fn(async (_model, messages) => (/what got done/.test(messages[0].content) ? 'Nexus added the date.' : '1 PASS The date was added.')),
  };
}

const call = (db, name, args, ctx = context, agentId = 'censai', extra = {}) => handleCensaiPlanTool(agentId, name, args, ctx, db, { ...deps(db), ...extra });
const NO_PLAN = 'Error: No plan of this person has that id.';

afterEach(() => resetPlansForTests());

describe('the tools themselves', () => {
  test('only Censai hands out plans, only for a signed-in person who may work on the board', async () => {
    const db = fakePlanDb();
    expect(await call(db, 'hand_off_jobs', goodPlan, context, 'nexus')).toBe('Error: Only Censai hands out plans to the family.');
    expect(await call(db, 'hand_off_jobs', goodPlan, { workspaceId: 'ws-1' })).toMatch(/^Error: There is no board and signed-in person/);
    expect(await call(db, 'hand_off_jobs', goodPlan, { workspaceId: 'ws-1', userId: 8 }))
      .toBe('Error: This person can look at this board but not start or stop work on it.');
    expect(db.plans.size).toBe(0);
  });

  test('a bad plan comes back to Censai with what to fix', async () => {
    const db = fakePlanDb();
    expect(await call(db, 'hand_off_jobs', { goal: 'g', jobs: [{ agent: 'echo', job: 'Fix the bug.', kind: 'code', checklist: ['x'] }] }))
      .toMatch(/^Error: Job 1: Echo can read project files but not change them/);
    expect(await call(db, 'hand_off_jobs', { goal: 'g', jobs: [{ agent: 'atlas', job: 'Look.' }] })).toMatch(/^Error: Job 1: give a checklist/);
  });

  test('code changes and test runs are the computer owner\'s, so nobody else gets a plan that could never be checked off', async () => {
    const db = fakePlanDb({ roles: { 7: 'user' } });
    const refused = await call(db, 'hand_off_jobs', goodPlan);
    expect(refused).toBe('Error: I could not run the tests: only this computer\'s owner can run them. Job 1 changes code or needs the project\'s tests, '
      + 'so it could never be checked off for this person. Hand out jobs that look into it and write up what to change instead, '
      + 'and tell the person that code changes here need this computer\'s owner.');
    expect(db.plans.size).toBe(0);
    const testsOnly = { goal: 'g', project: 'Homebase', jobs: [{ agent: 'echo', job: 'Say if the tests pass.', checklist: ['The tests pass'] }] };
    expect(await call(db, 'hand_off_jobs', testsOnly)).toMatch(/^Error: I could not run the tests/);
    // Looking into it and writing it up is open to every member.
    expect(await call(db, 'hand_off_jobs', lookIntoIt)).toContain('Handed off; it has only started.');
    expect(db.plans.size).toBe(1);
  });

  test('a code job needs its agent to save files here without waiting, or it could never be checked off', async () => {
    const unequipped = fakePlanDb({ writers: [] });
    expect(await call(unequipped, 'hand_off_jobs', goodPlan)).toBe('Error: Nexus cannot save files on this board yet: '
      + 'Project Writer is not equipped on Nexus. Job 1 changes code, so it could never be checked off. Tell the person to equip it '
      + '(Nexus\'s Exo-Skeleton Builder, Exo-Modules tab, Install and equip on Project Writer) and ask again, '
      + 'or hand out a job that looks into it and writes up what to change instead.');
    const waits = /^Error: Nexus's file saves for this person wait for an OK in Action Approvals .* so job 1 could not be checked off while it waits\./;
    expect(await call(fakePlanDb({ trust: [{ agent_id: '*', trusted: false }] }), 'hand_off_jobs', goodPlan)).toMatch(waits);
    expect(await call(fakePlanDb({ trust: [{ agent_id: 'nexus', trusted: false }] }), 'hand_off_jobs', goodPlan)).toMatch(waits);
    // A board member's saves wait for an owner or admin, even on the computer owner's account.
    expect(await call(fakePlanDb(), 'hand_off_jobs', goodPlan, { workspaceId: 'ws-1', userId: 9 })).toMatch(waits);
    // One agent's own trust switch can turn it on where the board's is off.
    const ownSwitch = fakePlanDb({ trust: [{ agent_id: '*', trusted: false }, { agent_id: 'nexus', trusted: true }] });
    expect(await call(ownSwitch, 'hand_off_jobs', goodPlan)).toContain('Handed off; it has only started.');
    // Looking into it needs no saves.
    expect(await call(unequipped, 'hand_off_jobs', lookIntoIt)).toContain('Handed off; it has only started.');
    expect(unequipped.plans.size).toBe(1);
  });

  test('a job that needs the tests is refused where they cannot run on this computer', async () => {
    const db = fakePlanDb();
    const onGitHub = jest.fn(async ({ project }) => `The project "${project}" lives on GitHub, so I can't run its tests on this computer.`);
    expect(await call(db, 'hand_off_jobs', goodPlan, context, 'censai', { whyNoTestsHere: onGitHub })).toBe(
      'Error: The project "Homebase" lives on GitHub, so I can\'t run its tests on this computer. Job 1 needs the project\'s tests, '
      + 'so it could never be checked off. Hand out jobs that look into it and write up what to change instead, and tell the person why.',
    );
    expect(onGitHub).toHaveBeenCalledWith({ agentId: 'nexus', project: 'Homebase', context });
    expect(db.plans.size).toBe(0);
    // Code work names its project, so Censai knows where to run the tests.
    expect(await call(db, 'hand_off_jobs', { ...goodPlan, project: undefined }))
      .toBe('Error: Job 1: code work needs the project it is in (project), so I know where to run its tests.');
    // Looking into it needs no tests.
    expect(await call(db, 'hand_off_jobs', lookIntoIt, context, 'censai', { whyNoTestsHere: onGitHub })).toContain('Handed off; it has only started.');
  });

  test('a good plan is saved, started, and Censai is told it has only started', async () => {
    const db = fakePlanDb();
    const text = await call(db, 'hand_off_jobs', goodPlan);
    const [id] = [...db.plans.keys()];
    expect(text).toContain(`Plan ${id} (queued): Show the date in the header`);
    expect(text).toContain('1. Nexus: Add the date to the header. - not started yet (0 of 2 checked off)\n   [ ] The date shows\n   [ ] The project\'s tests pass');
    expect(text).toContain('Do not say it is done.');
    await planSettled(id);
    expect(db.row(id)).toMatchObject({ status: 'done', user_id: 7, workspace_id: 'ws-1', summary: 'Nexus added the date.' });
    expect(db.row(id).jobs[0].checklist.map((item) => item.state)).toEqual(['ticked', 'ticked']);
  });

  test('at most three plans run at once for one person', async () => {
    const db = fakePlanDb();
    for (let i = 0; i < 3; i += 1) {
      const row = await insertPlan(db, { ...context, goal: `Plan ${i}`, project: null, jobs: normalizePlanInput(goodPlan).jobs });
      db.row(row.id).status = 'running';
    }
    expect(await call(db, 'hand_off_jobs', goodPlan)).toBe('Error: 3 plans are already running for this person. Wait for one to finish, or stop one with stop_jobs.');
  });

  test('jobs_status reads the person\'s plans with what came back; stop_jobs stops the newest running one', async () => {
    const db = fakePlanDb();
    expect(await call(db, 'jobs_status', {})).toBe('No plans are open for this person.');
    const jobs = normalizePlanInput(goodPlan).jobs;
    Object.assign(jobs[0], {
      status: 'checking', answer: 'Halfway there.',
      steps: [{ at: '2026-10-18T21:00:00Z', text: 'Checking all 2 items on the list', state: 'now' }],
    });
    Object.assign(jobs[0].checklist[0], { state: 'failed', line: 'The answer says it is only halfway there.' });
    Object.assign(jobs[0].checklist[1], { state: 'checking', line: 'Running the project\'s tests' });
    const row = await insertPlan(db, { ...context, goal: 'Show the date', project: 'Homebase', jobs });
    db.row(row.id).status = 'running';
    const status = await call(db, 'jobs_status', {});
    expect(status).toContain(`Plan ${row.id} (running): Show the date [project: Homebase]`);
    expect(status).toContain('now: Checking all 2 items on the list');
    expect(status).toContain('[ ] not yet: The date shows - The answer says it is only halfway there.');
    expect(status).toContain('[ ] checking: The project\'s tests pass - Running the project\'s tests');
    expect(status).toContain('answer: Halfway there.');
    expect(await call(db, 'jobs_status', { plan_id: 'not-a-plan' })).toBe(NO_PLAN);
    expect(await call(db, 'jobs_status', { plan_id: '00000000-0000-4000-8000-000000000000' })).toBe(NO_PLAN);
    expect(await call(db, 'jobs_status', { plan_id: row.id }, { workspaceId: 'ws-1', userId: 9 })).toBe(NO_PLAN);
    expect(await call(db, 'jobs_status', {}, { workspaceId: 'ws-1', userId: 9 })).toBe('No plans are open for this person.');

    expect(await call(db, 'stop_jobs', { plan_id: 'not-a-plan' })).toBe(NO_PLAN);
    expect(await call(db, 'stop_jobs', { plan_id: row.id }, { workspaceId: 'ws-1', userId: 9 })).toBe(NO_PLAN);
    expect(db.row(row.id).status).toBe('running');
    expect(await call(db, 'stop_jobs', {})).toBe('Stopped. Stopped while Nexus was on part 1, as you asked.');
    expect(db.row(row.id).status).toBe('stopped');
    expect(await call(db, 'stop_jobs', {})).toBe('No plan is running for this person.');
  });
});

describe('who has them', () => {
  test('Censai alone gets the plan tools, each with a handler and a catalog entry', () => {
    expect(familyDefaultToolNames('censai')).toEqual(expect.arrayContaining(PLAN_TOOLS));
    for (const [agentId, names] of Object.entries(FAMILY_DEFAULT_TOOL_NAMES)) {
      if (agentId !== 'censai') expect(names.filter((name) => PLAN_TOOLS.includes(name))).toEqual([]);
    }
    const catalog = new Map(listToolCatalog().tools.map((tool) => [tool.name, tool]));
    for (const name of PLAN_TOOLS) {
      expect(TOOL_DEFINITIONS.some((tool) => tool.function.name === name)).toBe(true);
      expect(typeof TOOL_REGISTRY[name]).toBe('function');
      expect(catalog.get(name)?.category).toBe('Coordination');
    }
    expect(CENSAI_ORCHESTRATOR_PROMPT).toContain('hand_off_jobs');
  });

  test('Censai starts with them even when Censai\'s other tools are found by search', () => {
    const names = new Set([...familyDefaultToolNames('censai'), 'search_tools', 'get_tool', 'get_toolkit']);
    const tools = TOOL_DEFINITIONS.filter((tool) => names.has(tool.function.name));
    const session = createChatToolSession(tools, 'openai');
    expect(session.discoveryFirst).toBe(true);
    expect(session.list().map((tool) => tool.function.name).sort()).toEqual(
      ['get_tool', 'get_toolkit', 'hand_off_jobs', 'jobs_status', 'search_tools', 'stop_jobs'],
    );
    // An agent without them starts with only the search tools, as before.
    const atlas = TOOL_DEFINITIONS.filter((tool) => [...familyDefaultToolNames('atlas'), 'search_tools', 'get_tool'].includes(tool.function.name));
    expect(createChatToolSession(atlas, 'openai').list().map((tool) => tool.function.name).sort()).toEqual(['get_tool', 'search_tools']);
  });
});
