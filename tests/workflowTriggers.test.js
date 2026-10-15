import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { boardStartText, checkTrigger, watchedWindows } from '../server/workflows/triggers.js';
import { cardSpot, placeResultCardInDoc } from '../server/workflows/board.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { readDocWindows } from '../server/agent-registry/helpCards.js';
import { triggerInput } from '../server/routes/workflows.js';

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
