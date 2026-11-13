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
import { caretState, readTextCarets, setCaretChannel, sharedText } from '../src/lib/collaboration/textCarets.js';
import { LayoutStoryBox, LayoutStoryHere, layoutStoryField } from '../src/components/yorware/layout/LayoutStoryText.jsx';

// Live cursors in a YorWare Layout text frame: Pat sees where Sam is typing
// in a frame's words. In the Text panel it is a line with Sam's name at the
// letter; on the page, a name tag over that frame only. Pat's own cursor goes
// out to teammates. Only a spot goes out, never the words. All made up.
const WORDS = 'Bake sale at noon';
const OTHER = 'Made-up footer';
const frame = (story, y) => ({ page: 'p1', type: 'text', x: 72, y, w: 300, h: 100, z: 1, story });
const WIN = {
  id: 'l1', kind: 'yorLayout', x: 0, y: 0, w: 900, h: 700,
  layDoc: { size: 'letter', w: 612, h: 792, margin: 36, order: ['p1'] },
  'lpg.p1': { at: 1 },
  'lfr.f1': frame('s1', 72),
  'lfr.f2': frame('s2', 300),
  'lst.s1': { text: WORDS, font: 'sans', size: 24, frames: ['f1'] },
  'lst.s2': { text: OTHER, font: 'sans', size: 12, frames: ['f2'] },
};
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function Panel({ storyId = 's1', text = WORDS, windowId = 'l1' }) {
  const ref = React.useRef(null);
  return <LayoutStoryBox textRef={ref} windowId={windowId} storyId={storyId} text={text} onText={() => {}} />;
}

const Page = () => (
  <svg>
    <g data-frame="f1"><LayoutStoryHere windowId="l1" frame={WIN['lfr.f1']} /></g>
    <g data-frame="f2"><LayoutStoryHere windowId="l1" frame={WIN['lfr.f2']} /></g>
  </svg>
);

function open(doc, ui) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  return { awareness, view: render(ui) };
}

function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'l1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Bake');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
}

const tagIn = (el) => el.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a Layout story's words are found as shared words", () => {
  const { a } = twoDocs();
  expect(layoutStoryField('s1')).toBe('lst.s1/text');
  expect(layoutStoryField(null)).toBeNull();
  expect(sharedText(a, 'l1', layoutStoryField('s1'))?.toString()).toBe(WORDS);
  expect(sharedText(a, 'l1', layoutStoryField('s2'))?.toString()).toBe(OTHER);
});

test('on the page, a name tag shows over the frame a teammate types in, and only that frame', () => {
  const { a, b } = twoDocs();
  const { awareness } = open(a, <Page />);
  samAt(b, awareness, layoutStoryField('s1'), 'Bake sale'.length);
  const f1 = document.querySelector('[data-frame="f1"]');
  expect(tagIn(f1)).toHaveTextContent('Sam Example');
  expect(tagIn(f1)).toHaveAttribute('data-at', '9');
  expect(tagIn(document.querySelector('[data-frame="f2"]'))).toBeNull();
});

test("in the Text panel, Pat sees Sam's cursor at the letter, and it moves with the words", () => {
  const { a, b } = twoDocs();
  const { awareness, view } = open(a, <Panel />);
  samAt(b, awareness, layoutStoryField('s1'), 'Bake sale'.length);
  const box = screen.getByLabelText('Text');
  expect(tagIn(box.parentElement)).toHaveAttribute('data-at', '9');
  expect(tagIn(box.parentElement)).toHaveTextContent('Sam Example');
  act(() => {
    sharedText(b, 'l1', layoutStoryField('s1')).insert(0, 'Big ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  view.rerender(<Panel text={`Big ${WORDS}`} />);
  expect(tagIn(box.parentElement)).toHaveAttribute('data-at', '13');
});

test("the panel for another frame's story shows no cursor for Sam", () => {
  const { a, b } = twoDocs();
  const { awareness } = open(a, <Panel storyId="s2" text={OTHER} />);
  samAt(b, awareness, layoutStoryField('s1'), 3);
  expect(tagIn(screen.getByLabelText('Text').parentElement)).toBeNull();
});

test('typing in the panel tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = open(a, <Panel storyId="s2" text={OTHER} />);
  jest.useFakeTimers();
  try {
    const box = screen.getByLabelText('Text');
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'l1', field: 'lst.s2/text' }));
    expect(JSON.stringify(sent)).not.toContain('footer');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'l1', sent.field)[0].index).toBe(4);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('off a live board, typing in the panel sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  render(<Panel />);
  jest.useFakeTimers();
  try {
    const box = screen.getByLabelText('Text');
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
