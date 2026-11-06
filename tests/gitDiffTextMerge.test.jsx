/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { GitDiffWindow } from '../src/components/windows/gitDiff/index.jsx';

// The Git Diff Viewer's two pasted versions (Before and After) merge letter
// by letter: Pat and Sam typing in the same box at the same moment both keep
// what they typed, instead of the last one wiping the other. All words are
// made up.
const LOCAL = 'local';
const BEFORE = 'flour 2 cups\nbake 20 minutes';
const AFTER = 'flour 3 cups\nbake 25 minutes';
const board = (fields = {}) => ({
  wins: [{ id: 'g1', kind: 'gitDiff', x: 0, y: 0, w: 900, h: 600, diffBefore: BEFORE, diffAfter: AFTER, ...fields }],
});

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const winOf = (doc, base) => readDocState(doc, base).wins[0];

function startBoth() {
  const pair = offlinePair();
  const base = board();
  writeStateToDoc(pair.a, null, base, LOCAL);
  pair.sync();
  return { ...pair, base };
}

afterEach(cleanup);

test('Pat and Sam typing in the Before box at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ diffBefore: `Made-up recipe\n${BEFORE}` }), LOCAL);
  writeStateToDoc(b, base, board({ diffBefore: `${BEFORE}\nserve warm` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).diffBefore).toBe(`Made-up recipe\n${BEFORE}\nserve warm`);
});

test('one person in Before and the other in After both keep their change', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ diffBefore: `${BEFORE}!` }), LOCAL);
  writeStateToDoc(b, base, board({ diffAfter: `${AFTER}?` }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const win = winOf(doc, base);
    expect([win.diffBefore, win.diffAfter]).toEqual([`${BEFORE}!`, `${AFTER}?`]);
  }
});

test('a version saved whole by an older board still merges after its first edit', () => {
  const { a, b, sync, base } = startBoth();
  // An older board saved the text as one plain piece, not as mergeable letters.
  a.getMap('canvas').get('windows').get('g1').set('diffAfter', AFTER);
  sync();
  const one = board({ diffAfter: `${AFTER}.` });
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board({ diffAfter: `Pat: ${AFTER}.` }), LOCAL);
  writeStateToDoc(b, one, board({ diffAfter: `${AFTER}. (Sam)` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).diffAfter).toBe(`Pat: ${AFTER}. (Sam)`);
});

test('an agent changing the After text only touches the letters it changed', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ diffAfter: `${AFTER} (Pat)` }), LOCAL);
  upsertWindowInDoc(b, { ...base.wins[0], diffAfter: AFTER.replace('3 cups', '4 cups') });
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).diffAfter).toBe(`${AFTER.replace('3 cups', '4 cups')} (Pat)`);
});

test('a teammate typing before your cursor in a box keeps your cursor in place', async () => {
  const win = { id: 'w1', kind: 'gitDiff', diffBefore: BEFORE, diffAfter: AFTER, diffEditing: true };
  const noop = () => {};
  let view;
  // The window asks for the agent task list on open; let that settle first.
  await act(async () => { view = render(<GitDiffWindow win={win} onUpdate={noop} />); });
  const { rerender } = view;
  const box = screen.getByTestId('gdv-after');
  box.focus();
  const at = 'flour 3'.length;
  box.setSelectionRange(at, at);
  rerender(<GitDiffWindow win={{ ...win, diffAfter: `Made-up recipe\n${AFTER}` }} onUpdate={noop} />);
  expect(box.value).toBe(`Made-up recipe\n${AFTER}`);
  expect(box.value.slice(0, box.selectionStart)).toBe('Made-up recipe\nflour 3');
});
