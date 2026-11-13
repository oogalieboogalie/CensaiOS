import { jest } from '@jest/globals';

// A Kraken Request hands its arms to Censai's plans a few at a time
// (server/kraken/feeder.js). Made-up person: Pat (user 1) on the Testco board.
// The database, the plan runner and the board's rules are stand-ins.

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember: jest.fn(async () => ({ role: 'owner' })) }));
jest.unstable_mockModule('../server/censaiOrchestrator/runner.js', () => ({
  createPlan: jest.fn(), stopPlan: jest.fn(), recoverOnce: jest.fn(async () => {}), onPlanSettled: jest.fn(),
}));
jest.unstable_mockModule('../server/censaiOrchestrator/store.js', () => ({
  MAX_OPEN_PLANS: 3, countOpenPlans: jest.fn(), getPlan: jest.fn(),
  loadPlan: jest.fn(async () => ({ workspace_id: 'ws-testco', user_id: 1 })),
}));
jest.unstable_mockModule('../server/tools/handlers/censaiOrchestrator.js', () => ({ handOffGap: jest.fn(async () => null) }));

const requests = new Map();
jest.unstable_mockModule('../server/kraken/store.js', () => ({
  listOpenRequests: jest.fn(async () => [...requests.values()].filter((row) => row.status === 'open')),
  getRequest: jest.fn(async (_db, { id }) => requests.get(id) || null),
  listOpenOwners: jest.fn(async () => [...requests.values()].filter((row) => row.status === 'open').map(() => ({ workspaceId: 'ws-testco', userId: 1 }))),
  saveRequest: jest.fn(async (_db, { id, status, arms }) => {
    const row = requests.get(id);
    if (!row || row.status !== 'open') return null;
    Object.assign(row, { status, arms: structuredClone(arms) });
    return row;
  }),
}));

const { feed, feedEveryone, stopRequest, KRAKEN_SLOTS } = await import('../server/kraken/feeder.js');
const { onPlanSettled } = await import('../server/censaiOrchestrator/runner.js');
const { saveRequest } = await import('../server/kraken/store.js');
const whenPlanSettles = onPlanSettled.mock.calls[0][0];
const { buildArms } = await import('../server/kraken/arms.js');

const PAT = { workspaceId: 'ws-testco', userId: 1 };
const FINDINGS = ['Checkout crashes', 'Orders table has no index', 'Two date libraries', 'Old logs pile up']
  .map((title, i) => ({ n: i + 1, severity: i ? 'P2' : 'P0', title, body: '', doneWhen: [], files: [] }));

let plans;
let deps;
const armStates = () => requests.get('r1').arms.map((arm) => arm.status);

beforeEach(() => {
  requests.clear();
  plans = new Map();
  requests.set('r1', { id: 'r1', project: null, mode: 'writeup', status: 'open', arms: buildArms(FINDINGS, {}) });
  deps = {
    db: {},
    recoverOnce: jest.fn(async () => {}),
    countOpenPlans: jest.fn(async () => [...plans.values()].filter((plan) => plan.status === 'running').length),
    getPlan: jest.fn(async (_db, { id }) => plans.get(id) || null),
    createPlan: jest.fn(async (input) => {
      const plan = { id: `plan-${plans.size + 1}`, status: 'running', summary: null, input };
      plans.set(plan.id, plan);
      return plan;
    }),
    stopPlan: jest.fn(async ({ id }) => {
      const plan = plans.get(id);
      if (plan.status === 'running') plan.status = 'stopped';
      return plan;
    }),
    handOffGap: jest.fn(async () => null),
    requireMember: jest.fn(async () => ({ role: 'owner' })),
  };
});

describe('kraken feeder', () => {
  test('hands out only as many arms as there is room for, worst first', async () => {
    await feed(PAT, deps);
    expect(KRAKEN_SLOTS).toBe(2);
    expect(armStates()).toEqual(['handed', 'handed', 'waiting', 'waiting']);
    expect(deps.createPlan).toHaveBeenCalledTimes(2);
    const first = deps.createPlan.mock.calls[0][0];
    expect(first).toEqual(expect.objectContaining({ workspaceId: 'ws-testco', userId: 1, goal: 'Kraken P0: Checkout crashes' }));
    expect(first.jobs).toHaveLength(1);
  });

  test('looking twice at once never hands the same arm out twice', async () => {
    await Promise.all([feed(PAT, deps), feed(PAT, deps), feed(PAT, deps)]);
    expect(deps.createPlan).toHaveBeenCalledTimes(2);
  });

  test('when a plan comes back the arm takes its result and the next arm goes out', async () => {
    await feed(PAT, deps);
    Object.assign(plans.get('plan-1'), { status: 'done', summary: 'Atlas found the crash and wrote up the fix.' });
    Object.assign(plans.get('plan-2'), { status: 'stuck', summary: 'Stuck on the first item.' });
    await feed(PAT, deps);
    expect(armStates()).toEqual(['done', 'stuck', 'handed', 'handed']);
    expect(requests.get('r1').arms[0].result).toBe('Atlas found the crash and wrote up the fix.');
    expect(requests.get('r1').status).toBe('open');
  });

  test('the request is done once every arm is back, stuck ones included', async () => {
    await feed(PAT, deps);
    for (const plan of plans.values()) plan.status = 'done';
    await feed(PAT, deps);
    for (const plan of plans.values()) plan.status = 'done';
    await feed(PAT, deps);
    expect(armStates()).toEqual(['done', 'done', 'done', 'done']);
    expect(requests.get('r1').status).toBe('done');
    expect(deps.createPlan).toHaveBeenCalledTimes(4);
  });

  test('a fix that could never be checked off here goes out as a write-up, with the reason', async () => {
    const [arm] = buildArms([{ n: 1, severity: 'P0', title: 'The api route has no timeout', body: 'server', doneWhen: [], files: [] }], { mode: 'fix', project: 'testco-shop' });
    requests.set('r1', { id: 'r1', project: 'testco-shop', mode: 'fix', status: 'open', arms: [arm] });
    deps.handOffGap.mockResolvedValue('Error: Atlas cannot save files on this board yet: Project Writer is not equipped on Atlas. Job 1 changes code.');
    await feed(PAT, deps);
    const saved = requests.get('r1').arms[0];
    expect([saved.status, saved.kind]).toEqual(['handed', 'answer']);
    expect(saved.note).toBe('Atlas cannot save files on this board yet: Project Writer is not equipped on Atlas.');
    expect(deps.createPlan.mock.calls[0][0].jobs[0].kind).toBe('answer');
  });

  test('stopping stops the plans that are out and never starts the rest', async () => {
    await feed(PAT, deps);
    const row = await stopRequest({ id: 'r1', ...PAT }, deps);
    expect(row.status).toBe('stopped');
    expect(armStates()).toEqual(['stopped', 'stopped', 'stopped', 'stopped']);
    expect(deps.stopPlan).toHaveBeenCalledTimes(2);
    await feed(PAT, deps);
    expect(deps.createPlan).toHaveBeenCalledTimes(2);
  });

  test('a plan that finished just before the stop keeps its own ending', async () => {
    await feed(PAT, deps);
    deps.stopPlan.mockImplementationOnce(async () => ({ status: 'done', summary: 'Found and written up.' }));
    await stopRequest({ id: 'r1', ...PAT }, deps);
    expect(armStates().slice(0, 2)).toEqual(['done', 'stopped']);
    expect(requests.get('r1').arms[0].result).toBe('Found and written up.');
  });

  test('a save that fails after a hand-out stops that plan, so the arm never goes out twice', async () => {
    saveRequest.mockRejectedValueOnce(new Error('database blip'));
    await expect(feed(PAT, deps)).rejects.toThrow('database blip');
    expect(plans.get('plan-1').status).toBe('stopped');
    expect(armStates()[0]).toBe('waiting');
    await feed(PAT, deps);
    expect([...plans.values()].filter((plan) => plan.status === 'running')).toHaveLength(2);
  });

  test('a start of the app sends waiting arms out with no window open, and the feeder listens for settled plans', async () => {
    expect(await feedEveryone(deps)).toBe(1);
    expect(deps.createPlan).toHaveBeenCalledTimes(2);
    expect(typeof whenPlanSettles).toBe('function');
  });

  test('a request that is not this person\'s is not found', async () => {
    expect(await stopRequest({ id: 'r-other', ...PAT }, deps)).toBeNull();
  });
});
