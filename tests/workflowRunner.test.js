import { jest } from '@jest/globals';
import { resetWorkflowRuns, startWorkflowRun } from '../server/workflows/runner.js';
import { answerReview, stopWorkflowRun } from '../server/workflows/control.js';

const node = (id, type, extra = {}) => ({ id, type, x: 0, y: 0, title: id, ...extra });

function harness(graph, { agent = async ({ messages }) => ({ finalText: `answer to: ${messages[0].text.slice(-20)}` }) } = {}) {
  const win = { id: 'wf-1', kind: 'workflow', title: 'Open house', x: 0, y: 0, w: 900, h: 500, graph };
  const patches = [];
  const cards = [];
  const queries = [];
  const deps = {
    db: { query: jest.fn(async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; }) },
    runAgent: jest.fn(agent),
    runTool: jest.fn(async (agentId, name, args) => `tool ${name} got ${JSON.stringify(args)}`),
    readWindow: jest.fn(async () => win),
    patchWindow: jest.fn(async (ws, id, patch) => { patches.push(patch.run); win.run = patch.run; return true; }),
    placeCard: jest.fn(async (ws, input) => { cards.push(input); return { id: `card-${cards.length}` }; }),
  };
  return { win, deps, patches, cards, queries };
}

const chain = {
  nodes: [
    node('s', 'trigger', { input: 'three open house ideas' }),
    node('a', 'agent', { agentId: 'censai', instructions: 'Draft a plan.' }),
    node('t', 'tool', { tool: 'web_search' }),
    node('r', 'output'),
  ],
  edges: [{ id: '1', from: 's', to: 'a' }, { id: '2', from: 'a', to: 't' }, { id: '3', from: 't', to: 'r' }],
};

afterEach(() => resetWorkflowRuns());

describe('workflow runner', () => {
  test('runs each step in order, hands results on, and drops a result card on the board', async () => {
    const h = harness(chain);
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps);
    await done;
    expect(run.status).toBe('complete');
    const call = h.deps.runAgent.mock.calls[0][0];
    expect(call).toMatchObject({ origin: 'workflow', agentId: 'censai', userId: 7, workspaceId: 'ws' });
    expect(call.messages[0].text).toContain('Draft a plan.');
    expect(call.messages[0].text).toContain('three open house ideas');
    expect(h.deps.runTool).toHaveBeenCalledWith('censai', 'web_search', expect.objectContaining({ query: expect.stringContaining('answer to') }), { userId: 7, workspaceId: 'ws' });
    expect(h.cards[0]).toMatchObject({ workflowWindowId: 'wf-1', title: 'r', runId: run.id });
    expect(h.cards[0].text).toContain('tool web_search');
    expect(h.win.run.nodes.r).toMatchObject({ status: 'done', cardId: 'card-1' });
    // Everyone on the board saw each step go running, then done.
    expect(h.patches.some((p) => p.nodes.a.status === 'running')).toBe(true);
    expect(h.queries[0].sql).toMatch(/INSERT INTO board_workflow_runs/);
  });

  test('a tool the agent does not have is named in plain words', async () => {
    const h = harness(chain);
    h.deps.runTool.mockResolvedValue('Error: TOOL_NOT_AVAILABLE: Tool web_search is not active for this agent in this workspace.');
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps);
    await done;
    expect(run.results.t.error).toBe('Censai can\'t use "Search the web" on this board yet. Equip Web Research for Censai in the ExoSkeleton, or pick another agent for this step.');
  });

  test('a check skips the way not taken', async () => {
    const graph = {
      nodes: [node('s', 'trigger', { input: 'a HOT lead' }), node('c', 'branch', { test: 'contains', value: 'hot' }), node('y', 'output'), node('n', 'output')],
      edges: [{ id: '1', from: 's', to: 'c' }, { id: '2', from: 'c', to: 'y', port: 'yes' }, { id: '3', from: 'c', to: 'n', port: 'no' }],
    };
    const h = harness(graph);
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps);
    await done;
    expect(run.results.c.way).toBe('yes');
    expect(run.results.y.status).toBe('done');
    expect(run.results.n.status).toBe('skipped');
    expect(h.cards).toHaveLength(1);
  });

  test('a failing step stops the run and says which step', async () => {
    const h = harness(chain, { agent: async () => { throw new Error('No model key for this agent.'); } });
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps);
    await done;
    expect(run.status).toBe('failed');
    expect(run.error).toBe('a: No model key for this agent.');
    expect(run.results.t.status).toBe('pending');
    expect(h.cards).toHaveLength(0);
  });

  test('a review step pauses the run until a teammate approves', async () => {
    const graph = {
      nodes: [node('s', 'trigger', { input: 'x' }), node('a', 'agent', { agentId: 'censai' }), node('v', 'review'), node('r', 'output')],
      edges: [{ id: '1', from: 's', to: 'a' }, { id: '2', from: 'a', to: 'v' }, { id: '3', from: 'v', to: 'r' }],
    };
    const h = harness(graph);
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps);
    await done;
    expect(run.status).toBe('awaiting_review');
    expect(h.cards).toHaveLength(0);
    const runRow = { id: run.id, status: 'awaiting_review', graph, results: run.results, started_by: 7, trigger: 'manual', started_at: run.startedAt };
    const resumed = await answerReview({ workspaceId: 'ws', windowId: 'wf-1', runRow, approve: true }, h.deps);
    await resumed.done;
    expect(resumed.run.status).toBe('complete');
    expect(h.cards).toHaveLength(1);
    expect(h.cards[0].text).toContain('answer to');
  });

  test('not approving stops the run', async () => {
    const graph = { nodes: [node('s', 'trigger'), node('v', 'review'), node('r', 'output')], edges: [{ id: '1', from: 's', to: 'v' }, { id: '2', from: 'v', to: 'r' }] };
    const h = harness(graph);
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps);
    await done;
    const runRow = { id: run.id, status: 'awaiting_review', graph, results: run.results, started_by: 7, trigger: 'manual', started_at: run.startedAt };
    const answered = await answerReview({ workspaceId: 'ws', windowId: 'wf-1', runRow, approve: false }, h.deps);
    expect(answered.run.status).toBe('stopped');
    expect(h.cards).toHaveLength(0);
  });

  test('one run at a time per workflow, a broken graph never starts, and Stop ends a run', async () => {
    let release;
    const h = harness(chain, { agent: ({ signal }) => new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(new Error('aborted'))); }) });
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps);
    await expect(startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, h.deps)).rejects.toMatchObject({ statusCode: 409 });
    await new Promise((r) => setTimeout(r, 0));
    await stopWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1' }, h.deps);
    await done;
    expect(run.status).toBe('stopped');
    expect(typeof release).toBe('function');

    const broken = harness({ nodes: [node('a', 'agent', { agentId: 'x' })], edges: [] });
    await expect(startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, broken.deps)).rejects.toMatchObject({ statusCode: 400 });
    const gone = harness(chain);
    gone.deps.readWindow.mockResolvedValue(null);
    await expect(startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7 }, gone.deps)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('a run waits briefly for the edits the person just made to reach the board', async () => {
    const h = harness(chain);
    const older = { ...h.win, graph: { nodes: [node('s', 'trigger')], edges: [] } };
    h.deps.readWindow.mockResolvedValueOnce(older).mockResolvedValueOnce(older);
    const { run, done } = await startWorkflowRun({ workspaceId: 'ws', windowId: 'wf-1', userId: 7, expectGraph: chain }, h.deps);
    await done;
    expect(Object.keys(run.results)).toEqual(['s', 'a', 't', 'r']);
    expect(h.deps.readWindow).toHaveBeenCalledTimes(3);
  });
});
