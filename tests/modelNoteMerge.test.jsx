/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { MAX_NOTE_LENGTH, readScene } from '../src/lib/yorware/modelBoard.js';
import { NotesSection } from '../src/components/yorware/model3d/ModelNotes.jsx';

// A note pinned on a model in a YorWare 3D Viewer merges letter by letter:
// Pat and Sam typing in one note at the same moment both keep their words.
// Before, the box saved the whole note when you left it, so the last person
// to leave wiped the other's words. All words are made up.
const LOCAL = 'local';
const MODEL = { name: 'Made-up bracket', format: 'stl', main: 'b.stl', files: {}, bytes: 0, at: 1 };
const NOTE = { model: 'k1', p: [1, 2, 3], text: 'Sam Example', by: 'Sam Example', at: 2 };
const board = (note, extra = {}) => ({
  wins: [{
    id: 'v1', kind: 'yor3d', x: 0, y: 0, w: 900, h: 600, m3Scene: { order: ['k1'] },
    'm3.k1': MODEL, 'm3n.n1': note, ...extra,
  }],
});

function startBoth(base) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync };
}

const noteOf = (doc, base, id = 'n1') => readScene(readDocState(doc, base).wins[0]).notes[id];
const typed = (text) => ({ ...NOTE, text });

afterEach(cleanup);

test('Pat and Sam typing in one note keep both their words', () => {
  const base = board(NOTE);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(typed('Check: Sam Example')), LOCAL);
  writeStateToDoc(b, base, board(typed('Sam Example, hole too small')), LOCAL);
  sync();
  for (const doc of [a, b]) expect(noteOf(doc, base)).toEqual(typed('Check: Sam Example, hole too small'));
});

test('two notes typed at once stay apart', () => {
  const other = { ...NOTE, text: 'Pat Example', by: 'Pat Example', at: 3 };
  const base = board(NOTE, { 'm3n.n2': other });
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(typed('Sam Example!'), { 'm3n.n2': other }), LOCAL);
  writeStateToDoc(b, base, board(NOTE, { 'm3n.n2': { ...other, text: 'Pat Example?' } }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    expect(noteOf(doc, base).text).toBe('Sam Example!');
    expect(noteOf(doc, base, 'n2').text).toBe('Pat Example?');
  }
});

test('a removed note stays removed on both screens', () => {
  const base = board(NOTE);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(null), LOCAL);
  sync();
  expect(noteOf(b, base)).toBeUndefined();
});

test('a note saved whole by an older board still merges after its first edit', () => {
  const base = board(NOTE);
  const { a, b, sync } = startBoth(base);
  a.getMap('canvas').get('windows').get('v1').set('m3n.n1', new Y.Map(Object.entries(NOTE)));
  sync();
  const one = board(typed('Sam Example, 2026'));
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board(typed('Pat: Sam Example, 2026')), LOCAL);
  writeStateToDoc(b, one, board(typed('Sam Example, 2026. OK')), LOCAL);
  sync();
  for (const doc of [a, b]) expect(noteOf(doc, base).text).toBe('Pat: Sam Example, 2026. OK');
});

function notesFor(text, editNote = () => {}) {
  const scene = { notes: { n1: { ...NOTE, text } }, noteOrder: ['n1'], models: { k1: MODEL } };
  const m = { scene, measure: [], tool: 'orbit', openNote: 'n1', setOpenNote: () => {}, editNote, removeNote: () => {} };
  return <NotesSection m={m} maxLength={MAX_NOTE_LENGTH} />;
}

test('typing in a note saves it right away, not only when you leave the box', () => {
  const editNote = jest.fn();
  render(notesFor('Sam Example', editNote));
  fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Sam Example!' } });
  expect(editNote).toHaveBeenCalledWith('n1', 'Sam Example!');
});

test("a teammate's letters show in the note and keep your cursor in place", () => {
  const { rerender } = render(notesFor('Sam Example'));
  const box = screen.getByLabelText('Note text');
  act(() => { box.focus(); box.setSelectionRange(3, 3); });
  rerender(notesFor('Check: Sam Example'));
  expect(box.value).toBe('Check: Sam Example');
  expect(box.value.slice(0, box.selectionStart)).toBe('Check: Sam');
});
