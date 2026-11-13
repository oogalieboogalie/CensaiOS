/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { EditorState } from '@codemirror/state';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { caretState, readTextCarets, setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { CodeEditorWindow } from '../src/components/CodeEditorWindow.jsx';
import { LegacyCodePane } from '../src/components/codeEditor/LegacyCodePane.jsx';
import { setTeammateCarets, teammateCaretsField } from '../src/components/codeEditor/teammateCodeCarets.js';

// Live cursors in the Code Editor: Pat sees where Sam is typing in the code,
// as a line in Sam's colour with Sam's name, and Pat's own cursor goes out to
// teammates. Only a spot in the shared code goes out, never the code. All
// people and code are made up.
const CODE = 'const shop = "Sam Example Bakery";\nconsole.log(shop);\n';
const WIN = { id: 'c1', kind: 'code', x: 0, y: 0, w: 700, h: 500, title: 'shop.js', code: CODE };
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const THEME = { background: 'var(--surface)', foreground: 'var(--ink)', black: 'var(--ink)', selectionBackground: 'var(--ink-faint)' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function patOn(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const mark = () => document.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("the code shows a teammate's cursor with their name, and no code goes out", async () => {
  const { a, b } = twoDocs();
  const pat = patOn(a);
  await act(async () => { render(<CodeEditorWindow win={WIN} onUpdate={jest.fn()} />); });
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'c1', 'code', 'const shop'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bakery');
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  expect(mark()).toHaveAttribute('data-teammate-caret', 'Sam Example');
  expect(mark()).toHaveAttribute('data-at', '10');
});

test("Sam's cursor moves with the code when Pat types in front of it", async () => {
  const { a, b } = twoDocs();
  const pat = patOn(a);
  await act(async () => { render(<CodeEditorWindow win={WIN} onUpdate={jest.fn()} />); });
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'c1', 'code', 'const shop'.length) });
  act(() => applyRemoteAwareness(pat, sam));
  await screen.findByText('Sam Example');
  act(() => { a.transact(() => writeStateToDoc(a, null, { wins: [{ ...WIN, code: `// ${CODE}` }] }, 'local')); });
  expect(mark()).toHaveAttribute('data-at', '13');
});

test('typing in the code tells teammates where my cursor is, and leaving takes it away', async () => {
  const { a } = twoDocs();
  const awareness = patOn(a);
  await act(async () => { render(<CodeEditorWindow win={WIN} onUpdate={jest.fn()} />); });
  const box = screen.getByDisplayValue(/Sam Example Bakery/);
  jest.useFakeTimers();
  try {
    act(() => { box.focus(); box.setSelectionRange(6, 6); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'c1', field: 'code' }));
    expect(JSON.stringify(sent)).not.toContain('shop');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'c1', 'code')[0].index).toBe(6);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('code that stays on this screen sends no cursor and shows none', async () => {
  const { a, b } = twoDocs();
  const pat = patOn(a);
  await act(async () => { render(<LegacyCodePane code={CODE} theme={THEME} readOnly={false} onChange={jest.fn()} focusProps={{}} />); });
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'c1', 'code', 4) });
  act(() => applyRemoteAwareness(pat, sam));
  const box = screen.getByDisplayValue(/Sam Example Bakery/);
  jest.useFakeTimers();
  try {
    act(() => { box.focus(); box.setSelectionRange(3, 3); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
  } finally {
    jest.useRealTimers();
  }
  expect(pat.getLocalState().caret ?? null).toBeNull();
  expect(mark()).toBeNull();
});

// The CodeMirror pane (what people see in the app) draws the same marks itself.
const marksOf = (state) => {
  const out = [];
  state.field(teammateCaretsField).between(0, state.doc.length, (from, _to, deco) => { out.push({ at: from, caret: deco.spec.widget.caret, widget: deco.spec.widget }); });
  return out;
};

test('the CodeMirror pane puts each teammate at their spot, with the name tag under the first line', () => {
  let state = EditorState.create({ doc: CODE, extensions: [teammateCaretsField] });
  state = state.update({ effects: setTeammateCarets.of([
    { clientId: '2', index: 40, name: 'Sam Example', color: 'hsl(1 72% 52%)' },
    { clientId: '3', index: 6, name: 'Pat Example', color: 'hsl(2 72% 52%)' },
    { clientId: '4', index: 9999, name: 'Far Example', color: 'hsl(3 72% 52%)' },
  ]) }).state;
  const marks = marksOf(state);
  expect(marks.map((m) => [m.caret.name, m.at, m.caret.below])).toEqual([
    ['Pat Example', 6, true], ['Sam Example', 40, false], ['Far Example', CODE.length, false],
  ]);
  const dom = marks[1].widget.toDOM();
  expect(dom).toHaveAttribute('data-teammate-caret', 'Sam Example');
  expect(dom).toHaveAttribute('data-at', '40');
  expect(dom.textContent).toBe('Sam Example');
});

test("in the CodeMirror pane a teammate's mark moves with code typed in front of it, and goes when they leave", () => {
  let state = EditorState.create({ doc: CODE, extensions: [teammateCaretsField] });
  state = state.update({ effects: setTeammateCarets.of([{ clientId: '2', index: 10, name: 'Sam Example', color: 'hsl(1 72% 52%)' }]) }).state;
  state = state.update({ changes: { from: 0, insert: '// ' } }).state;
  expect(marksOf(state).map((m) => m.at)).toEqual([13]);
  state = state.update({ effects: setTeammateCarets.of([]) }).state;
  expect(marksOf(state)).toEqual([]);
});
