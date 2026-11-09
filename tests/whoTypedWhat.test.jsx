/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { setCaretChannel, sharedText } from '../src/lib/collaboration/textCarets.js';
import { noteSignedInName } from '../src/lib/collaboration/signedInName.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { writerColors, writerList, writerRuns } from '../shared/collab/typedBy.js';
import { DocWindow } from '../src/components/DocWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

// Who typed what in a Document: Pat Example and Sam Example type into the
// same words on two screens. Every copy of the board knows which letters
// each one typed, the words themselves stay exactly the same, and the
// Document's "Show who typed what" view tints each person's part with a row
// of names. All people and words are made up.
const win = (text) => ({ id: 'd1', kind: 'doc', x: 0, y: 0, w: 400, h: 300, title: 'Bakery notes', text });
const board = (text) => ({ wins: [win(text)] });

function twoScreens(start = '') {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, board(start), 'local');
  sync();
  return { a, b, sync };
}

// One person types on one screen: from the words they had to the words they have now.
function type(doc, who, from, to) {
  noteSignedInName(who?.name ?? null, who?.id ?? null);
  writeStateToDoc(doc, board(from), board(to), 'local');
}

const PAT = { id: 'pat-1', name: 'Pat Example' };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const runsOf = (doc) => writerRuns(sharedText(doc, 'd1', 'text').toDelta()).map(({ text, by }) => [text, by]);

afterEach(() => {
  cleanup();
  noteSignedInName(null);
  act(() => setCaretChannel(null, null));
  useWorkspaceStore.getState().setActiveId(null);
});

test('both screens know which letters Pat typed and which Sam typed', () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', 'Order rye flour');
  sync();
  type(b, SAM, 'Order rye flour', 'Order rye flour and salt');
  sync();
  for (const doc of [a, b]) {
    expect(sharedText(doc, 'd1', 'text').toString()).toBe('Order rye flour and salt');
    expect(runsOf(doc)).toEqual([['Order rye flour', 'Pat Example'], [' and salt', 'Sam Example']]);
  }
  expect(writerList(writerRuns(sharedText(a, 'd1', 'text').toDelta())).map((p) => [p.name, p.letters]))
    .toEqual([['Pat Example', 15], ['Sam Example', 9]]);
});

test('typing inside a teammate\'s words splits them, and an agent\'s edit says an agent wrote it', () => {
  const { a } = twoScreens();
  type(a, PAT, '', 'Order flour');
  type(a, SAM, 'Order flour', 'Order rye flour');
  expect(runsOf(a)).toEqual([['Order ', 'Pat Example'], ['rye ', 'Sam Example'], ['flour', 'Pat Example']]);
  a.transact(() => upsertWindowInDoc(a, win('Order rye flour today')));
  expect(runsOf(a).at(-1)).toEqual([' today', 'An agent']);
});

test('words from before, or typed with nobody signed in, read as not recorded', () => {
  const { a } = twoScreens('Old list');
  type(a, null, 'Old list', 'Old list, still');
  type(a, PAT, 'Old list, still', 'Old list, still here');
  expect(runsOf(a)).toEqual([['Old list, still', null], [' here', 'Pat Example']]);
});

test('the Document shows each person\'s part with their name', () => {
  const { a, b, sync } = twoScreens();
  type(a, PAT, '', 'Order rye flour');
  sync();
  type(b, SAM, 'Order rye flour', 'Order rye flour and salt');
  sync();
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  useWorkspaceStore.getState().setActiveId('d1');
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
  const { container } = render(<DocWindow win={{ ...win('Order rye flour and salt'), annotations: [] }} onUpdate={jest.fn()}
    onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Show who typed what', hidden: true }));
  const names = screen.getByRole('list', { name: 'Who typed what' });
  expect(names).toHaveTextContent('Pat Example · 15 letters');
  expect(names).toHaveTextContent('Sam Example · 9 letters');
  expect(container.querySelector('[data-typed-by="Sam Example"]')).toHaveTextContent('and salt');
  expect(container.querySelector('[data-typed-by="Pat Example"]')).toHaveAttribute('title', 'Typed by Pat Example');
  // A teammate keeps typing: the view follows.
  type(b, SAM, 'Order rye flour and salt', 'Order rye flour and salt!');
  act(() => sync());
  expect(names).toHaveTextContent('Sam Example · 10 letters');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Hide who typed what', hidden: true }));
  expect(screen.queryByRole('list', { name: 'Who typed what' })).toBeNull();
});

test('with the board not shared live, the view says so', () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
  render(<DocWindow win={{ ...win('Order rye flour'), annotations: [] }} onUpdate={jest.fn()}
    onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Show who typed what', hidden: true }));
  expect(screen.getByText('Who typed what shows when this board is shared live.')).toBeInTheDocument();
});

test('two writers never get the same colour, even when their own colours are close', () => {
  const people = [1, 2, 3, 4].map((n) => ({ key: `u${n}`, name: `Person ${n}`, byId: String(n) }));
  const hues = [...writerColors(people).values()].map((c) => Number(/hsl\((\d+)/.exec(c)[1]));
  expect(hues).toHaveLength(4);
  for (let i = 0; i < hues.length; i += 1) for (let j = i + 1; j < hues.length; j += 1) {
    const d = Math.abs(hues[i] - hues[j]);
    expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(40);
  }
  expect(writerColors([{ key: '', name: null, letters: 3 }]).size).toBe(0);
});

test("an agent's edit still lands inside words that carry other formatting", () => {
  const { a } = twoScreens();
  type(a, PAT, '', 'Order flour');
  a.transact(() => sharedText(a, 'd1', 'text').format(0, 11, { bold: true }));
  expect(() => a.transact(() => upsertWindowInDoc(a, win('Order rye flour')))).not.toThrow();
  expect(sharedText(a, 'd1', 'text').toString()).toBe('Order rye flour');
  expect(runsOf(a).find(([text]) => text.includes('rye'))?.[1]).toBe('An agent');
});
