/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { cleanup, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { OfficeDocsWindow } from '../src/components/windows/officeDocs/index.jsx';
import { OFFICE_STARTERS } from '../src/lib/office/officeStarters.js';

// A window's name (a Writer document's title, a Workflow's name) merges
// letter by letter: Pat and Sam renaming one document at the same moment
// both keep what they typed, instead of the last one wiping the other.
// All names are made up.
const LOCAL = 'local';
const board = (title, extra = {}) => ({
  wins: [{ id: 'd1', kind: 'officeDocs', x: 0, y: 0, w: 600, h: 500, title, ...extra }],
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

const titleOf = (doc, base) => readDocState(doc, base).wins[0].title;

function startBoth(title = 'Bake sale plan') {
  const pair = offlinePair();
  const base = board(title);
  writeStateToDoc(pair.a, null, base, LOCAL);
  pair.sync();
  return { ...pair, base };
}

afterEach(cleanup);

test('Pat and Sam renaming one document at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board('Spring bake sale plan'), LOCAL);
  writeStateToDoc(b, base, board('Bake sale plan, draft 2'), LOCAL);
  sync();
  for (const doc of [a, b]) expect(titleOf(doc, base)).toBe('Spring bake sale plan, draft 2');
});

test('renaming while a teammate moves the window keeps both', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board('Bake sale plan!'), LOCAL);
  writeStateToDoc(b, base, board('Bake sale plan', { x: 240 }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const win = readDocState(doc, base).wins[0];
    expect([win.title, win.x]).toEqual(['Bake sale plan!', 240]);
  }
});

test('a name saved whole by an older board still merges after its first edit', () => {
  const { a, b, sync, base } = startBoth();
  // An older board saved the name as plain text, not as mergeable letters.
  a.getMap('canvas').get('windows').get('d1').set('title', 'Bake sale plan');
  sync();
  const one = board('Bake sale plan v2');
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board('Pat: Bake sale plan v2'), LOCAL);
  writeStateToDoc(b, one, board('Bake sale plan v2 (Sam)'), LOCAL);
  sync();
  for (const doc of [a, b]) expect(titleOf(doc, base)).toBe('Pat: Bake sale plan v2 (Sam)');
});

test('an agent renaming the window only touches the letters it changed', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board('Bake sale plan (Pat)'), LOCAL);
  upsertWindowInDoc(b, { ...base.wins[0], title: 'Final bake sale plan' });
  sync();
  for (const doc of [a, b]) expect(titleOf(doc, base)).toBe('Final bake sale plan (Pat)');
});

test('a teammate typing before your cursor in the Writer title keeps your cursor in place', () => {
  const win = { id: 'w1', ...OFFICE_STARTERS.officeDocs, title: 'Bake sale plan' };
  const noop = () => {};
  const { rerender } = render(<OfficeDocsWindow win={win} onUpdate={noop} />);
  const box = screen.getByLabelText('Document title');
  box.focus();
  const at = 'Bake sale'.length;
  box.setSelectionRange(at, at);
  rerender(<OfficeDocsWindow win={{ ...win, title: 'Spring Bake sale plan' }} onUpdate={noop} />);
  expect(box.value).toBe('Spring Bake sale plan');
  expect(box.value.slice(0, box.selectionStart)).toBe('Spring Bake sale');
});
