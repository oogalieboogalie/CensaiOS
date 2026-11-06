/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { LegionSetup } from '../src/components/windows/legion/LegionSetup.jsx';

// Earlier runs are not part of this test: the list comes back empty.
beforeEach(() => { global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ runs: [] }) }); });

// Legion's goal ("What should the Legion build?") and its YAML spec merge
// letter by letter: Pat and Sam typing in the same box at the same moment
// both keep what they typed, and both screens see it as they type (before,
// the goal stayed on one screen until someone pressed Start). All words are
// made up.
const LOCAL = 'local';
const GOAL = 'A made-up page for Sam Example Bakery';
const SPEC = 'goal: A made-up page\njobs: []\n';
const board = (fields = {}) => ({
  wins: [{ id: 'l1', kind: 'legion', x: 0, y: 0, w: 1000, h: 700, legionGoal: GOAL, legionSpecYaml: SPEC, ...fields }],
});

function startBoth() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = board();
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync, base };
}

const winOf = (doc, base) => readDocState(doc, base).wins[0];

afterEach(cleanup);

test('Pat and Sam typing in the goal at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ legionGoal: `Build: ${GOAL}` }), LOCAL);
  writeStateToDoc(b, base, board({ legionGoal: `${GOAL} with a menu` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).legionGoal).toBe(`Build: ${GOAL} with a menu`);
});

test('one person in the goal and the other in the spec both keep their change', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ legionGoal: `${GOAL}!` }), LOCAL);
  writeStateToDoc(b, base, board({ legionSpecYaml: `${SPEC}checks: []\n` }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const win = winOf(doc, base);
    expect([win.legionGoal, win.legionSpecYaml]).toEqual([`${GOAL}!`, `${SPEC}checks: []\n`]);
  }
});

test('a goal saved whole by an older board still merges after its first edit', () => {
  const { a, b, sync, base } = startBoth();
  a.getMap('canvas').get('windows').get('l1').set('legionGoal', GOAL);
  sync();
  const one = board({ legionGoal: `${GOAL}.` });
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board({ legionGoal: `Pat: ${GOAL}.` }), LOCAL);
  writeStateToDoc(b, one, board({ legionGoal: `${GOAL}. (Sam)` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).legionGoal).toBe(`Pat: ${GOAL}. (Sam)`);
});

test('the server saving the goal on Start only touches the letters it changed', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ legionGoal: `${GOAL} (Pat)` }), LOCAL);
  upsertWindowInDoc(b, { ...base.wins[0], legionGoal: GOAL.replace('page', 'site') });
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).legionGoal).toBe(`${GOAL.replace('page', 'site')} (Pat)`);
});

test('typing in the goal and the spec saves to the board right away', async () => {
  const updates = [];
  await act(async () => { render(<LegionSetup win={{ id: 'l1' }} onUpdate={(p) => updates.push(p)} onStart={() => {}} />); });
  fireEvent.change(screen.getByRole('textbox', { name: 'What should the Legion build?' }), { target: { value: 'A tip calculator' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Use my own YAML spec/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'YAML spec' }), { target: { value: 'goal: tips' } });
  expect(updates).toEqual([{ legionGoal: 'A tip calculator' }, { legionSpecYaml: 'goal: tips' }]);
});

test('a teammate typing before your cursor in the goal keeps your cursor in place', async () => {
  const win = { id: 'l1', legionGoal: GOAL };
  const noop = () => {};
  let view;
  await act(async () => { view = render(<LegionSetup win={win} onUpdate={noop} onStart={noop} />); });
  const box = screen.getByRole('textbox', { name: 'What should the Legion build?' });
  expect(box.value).toBe(GOAL);
  box.focus();
  const at = 'A made-up'.length;
  box.setSelectionRange(at, at);
  view.rerender(<LegionSetup win={{ ...win, legionGoal: `Sam says: ${GOAL}` }} onUpdate={noop} onStart={noop} />);
  expect(box.value).toBe(`Sam says: ${GOAL}`);
  expect(box.value.slice(0, box.selectionStart)).toBe('Sam says: A made-up');
});

test("a teammate's spec opens the spec box on your screen, since your Start sends it", async () => {
  const win = { id: 'l1', legionGoal: GOAL };
  const noop = () => {};
  let view;
  await act(async () => { view = render(<LegionSetup win={win} onUpdate={noop} onStart={noop} />); });
  expect(screen.queryByRole('textbox', { name: 'YAML spec' })).toBeNull();
  view.rerender(<LegionSetup win={{ ...win, legionSpecYaml: SPEC }} onUpdate={noop} onStart={noop} />);
  expect(screen.getByRole('textbox', { name: 'YAML spec' }).value).toBe(SPEC);
});
