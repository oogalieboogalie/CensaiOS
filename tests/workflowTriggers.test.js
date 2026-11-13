import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { boardStartText, checkTrigger, watchedWindows } from '../server/workflows/triggers.js';
import { resetWorkflowRuns, startWorkflowRun } from '../server/workflows/runner.js';
import { cardSpot, placeResultCardInDoc } from '../server/workflows/board.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { readDocWindows } from '../server/agent-registry/helpCards.js';
import { triggerInput } from '../server/routes/workflows.js';
import { graphHash } from '../src/lib/workflow/graphHash.js';

const flow = { id: 'wf-1', kind: 'workflow', x: 100, y: 50, w: 900, h: 500 };

function deps(wins, start = jest.fn(async () => ({}))) {
  return { db: { query: jest.fn(async () => ({ rows: [] })) }, read: jest.fn(async () => wins), start };
}

describe('workflow starts on their own', () => {
  test('a board start runs once for a new window of its kind and hands over its text', async () => {
    const wins = [flow, { id: 'd1', kind: 'doc', fileName: 'listing.md', text: '3 bed, 2 bath' }, { id: 'c1', kind: 'chat' }];
    const row = { mode: 'board', workspace_id: 'ws', window_id: 'wf-1', window_kind: 'doc', armed_by: 7, seen_window_ids: [] };
    const d = deps(wins);
    expect(await checkTrigger(row, d)).toBe(true);
    expect(d.start).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'board', userId: 7, windowId: 'wf-1' }));
    expect(d.start.mock.calls[0][0].startText).toContain('"listing.md"');
    expect(d.start.mock.calls[0][0].startText).toContain('3 bed, 2 bath');
    const seen = JSON.parse(d.db.query.mock.calls.at(-1)[1][2]);
    expect(seen).toEqual(['d1']);
    // Already seen: nothing runs.
    const again = deps(wins);
    expect(await checkTrigger({ ...row, seen_window_ids: ['d1'] }, again)).toBe(false);
    expect(again.start).not.toHaveBeenCalled();
  });

  test('result cards made by workflows never start a workflow', () => {
    const wins = [flow, { id: 'card', kind: 'doc', fromWorkflowId: 'wf-2' }, { id: 'mine', kind: 'doc', fromWorkflowId: 'wf-1' }];
    expect(watchedWindows(wins, { window_id: 'wf-1', window_kind: 'doc' })).toEqual([]);
  });

  test('a busy workflow keeps the new window for next time', async () => {
    const busy = Object.assign(new Error('busy'), { statusCode: 409 });
    const d = deps([flow, { id: 'd1', kind: 'doc' }], jest.fn(async () => { throw busy; }));
    expect(await checkTrigger({ mode: 'board', workspace_id: 'ws', window_id: 'wf-1', window_kind: 'doc', armed_by: 7, seen_window_ids: [] }, d)).toBe(false);
    expect(d.db.query).not.toHaveBeenCalled();
  });

  test('a deleted workflow window turns its start off', async () => {
    const d = deps([{ id: 'd1', kind: 'doc' }]);
    await checkTrigger({ mode: 'board', workspace_id: 'ws', window_id: 'wf-1', window_kind: 'doc', armed_by: 7, seen_window_ids: [] }, d);
    expect(d.db.query.mock.calls[0][0]).toMatch(/DELETE FROM board_workflow_triggers/);
  });

  test('a schedule moves its next time on and runs', async () => {
    const d = deps([flow]);
    expect(await checkTrigger({ mode: 'schedule', workspace_id: 'ws', window_id: 'wf-1', every_minutes: 60, armed_by: 7 }, d)).toBe(true);
    expect(d.db.query.mock.calls[0][0]).toMatch(/next_run_at = NOW\(\) \+ make_interval/);
    expect(d.start).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'schedule' }));
  });

  test('the same steps hash the same whatever the key order', async () => {
    const left = { nodes: [{ id: 's', type: 'trigger', title: 'Start' }], edges: [] };
    const right = { nodes: [{ title: 'Start', type: 'trigger', id: 's' }], edges: [] };
    expect(await graphHash(left)).toBe(await graphHash(right));
    expect(await graphHash(left)).not.toBe(await graphHash({ nodes: [{ id: 's', type: 'trigger', title: 'Other' }], edges: [] }));
  });

  test('an armed graph that has not changed still runs', async () => {
    const original = {
      nodes: [
        { id: 's', type: 'trigger', x: 0, y: 0, title: 'Start', input: 'new docs' },
        { id: 'a', type: 'agent', x: 200, y: 0, title: 'Summarize', agentId: 'atlas', instructions: 'Summarize the new docs.' },
      ],
      edges: [{ id: 'e1', from: 's', to: 'a' }],
    };
    const runAgent = jest.fn(async () => ({ finalText: 'done' }));
    const win = { id: 'wf-same', kind: 'workflow', title: 'Docs', graph: original };
    const started = await checkTrigger({
      mode: 'schedule', workspace_id: 'ws', window_id: 'wf-same', every_minutes: 60, armed_by: 7, graph_hash: await graphHash(original),
    }, {
      db: { query: jest.fn(async () => ({ rows: [] })) },
      read: jest.fn(async () => [win]),
      start: async (input) => {
        const run = await startWorkflowRun(input, {
          db: { query: jest.fn(async () => ({ rows: [] })) },
          runAgent,
          runTool: jest.fn(),
          readWindow: async () => win,
          patchWindow: async () => true,
          placeCard: async () => ({ id: 'card' }),
        });
        if (run?.done) await run.done;
        return run;
      },
    });
    expect(started).toBe(true);
    expect(runAgent.mock.calls[0][0].messages[0].text).toContain('Summarize the new docs.');
    resetWorkflowRuns();
  });

  test('an editor who changes an armed graph does not get that graph run', async () => {
    const original = {
      nodes: [
        { id: 's', type: 'trigger', x: 0, y: 0, title: 'Start', input: 'new docs' },
        { id: 'a', type: 'agent', x: 200, y: 0, title: 'Summarize', agentId: 'atlas', instructions: 'Summarize the new docs.' },
      ],
      edges: [{ id: 'e1', from: 's', to: 'a' }],
    };
    const edited = {
      ...original,
      nodes: original.nodes.map((node) => (node.id === 'a'
        ? { ...node, instructions: 'Use project_write to add a file, then run_tests.' }
        : node)),
    };
    const armedHash = await graphHash(original);
    expect(await graphHash(edited)).not.toBe(armedHash);
    const runAgent = jest.fn(async () => ({ finalText: 'done' }));
    const queries = [];
    const db = { query: jest.fn(async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; }) };
    const win = { id: 'wf-edited', kind: 'workflow', title: 'Docs', graph: edited };
    const started = await checkTrigger({
      mode: 'schedule', workspace_id: 'ws', window_id: 'wf-edited', every_minutes: 60, armed_by: 7, graph_hash: armedHash,
    }, {
      db,
      read: jest.fn(async () => [win]),
      start: async (input) => {
        const run = await startWorkflowRun(input, {
          db, runAgent, runTool: jest.fn(), readWindow: async () => win, patchWindow: async () => true, placeCard: async () => ({ id: 'card' }),
        });
        if (run?.done) await run.done;
        return run;
      },
    });
    expect(started).toBe(false);
    expect(runAgent).not.toHaveBeenCalled();
    expect(queries.some((query) => /INSERT INTO board_workflow_runs/.test(query.sql))).toBe(false);
    expect(queries.some((query) => /disarmed_reason/.test(query.sql))).toBe(true);
    resetWorkflowRuns();
  });

  test('start text names each new window', () => {
    expect(boardStartText('idea', [{ id: 'i', title: 'Pool party' }])).toBe('A new idea was added to the board: "Pool party".');
    expect(boardStartText('doc', [{ id: 'd', fileName: 'lead.md' }])).toBe('A new document was added to the board: "lead.md".');
  });

  test('turning a start on checks its settings', () => {
    expect(triggerInput({ mode: 'schedule', everyMinutes: '30' })).toEqual({ mode: 'schedule', everyMinutes: 30 });
    expect(() => triggerInput({ mode: 'schedule', everyMinutes: 1 })).toThrow(/every 5 minutes/);
    expect(triggerInput({ mode: 'board', windowKind: 'doc' })).toEqual({ mode: 'board', windowKind: 'doc' });
    expect(() => triggerInput({ mode: 'board', windowKind: 'doc; drop' })).toThrow(/which kind/);
    expect(() => triggerInput({ mode: 'cron' })).toThrow(/how this workflow starts/);
    expect(triggerInput({})).toEqual({ mode: 'manual' });
  });
});

describe('workflow result cards', () => {
  test('cards land to the right of the workflow, stacked, joined by a line', () => {
    const doc = new Y.Doc();
    upsertWindowInDoc(doc, flow);
    let id = 0;
    const makeId = () => `id${(id += 1)}`;
    const first = placeResultCardInDoc(doc, { workflowWindowId: 'wf-1', title: 'Open House Plan', text: 'the plan', runId: 'r1', makeId });
    const second = placeResultCardInDoc(doc, { workflowWindowId: 'wf-1', title: 'Second', text: 'more', runId: 'r1', makeId });
    expect(first).toMatchObject({ kind: 'doc', x: 1040, y: 50, fileName: 'open-house-plan.md', text: 'the plan', fromWorkflowId: 'wf-1' });
    expect(second.y).toBeGreaterThan(first.y + first.h);
    expect(readDocWindows(doc).filter((win) => win.kind === 'doc')).toHaveLength(2);
    expect(doc.getMap('canvas').get('links').toJSON()[0]).toMatchObject({ fromId: 'wf-1', toId: first.id });
    expect(placeResultCardInDoc(doc, { workflowWindowId: 'gone', title: 'x', text: 'y', runId: 'r' })).toBeNull();
    expect(cardSpot(flow, [])).toEqual({ x: 1040, y: 50 });
  });
});
