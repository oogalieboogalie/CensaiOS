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
import { textBox } from '../src/lib/yorware/pdfModel.js';
import { PdfMark } from '../src/components/yorware/pdf/PdfMark.jsx';
import { pdfTextField } from '../src/components/yorware/pdf/PdfTextEdit.jsx';

// Live cursors in the text boxes placed on a YorWare PDF page: Pat sees where
// Sam is typing in a box. While Pat types in the same box, it is a line with
// Sam's name at the letter; otherwise a name tag on the box. Only that box.
// Pat's own cursor goes out to teammates. Only a spot goes out, never the
// words. All made up.
const WORDS = 'Signed by Sam Example';
const OTHER = 'Made-up witness';
const mark = (text, at) => ({ page: 'p1', type: 'text', text, size: 14, x: 40, y: 60 * at, ...textBox(text, 14), at });
const WIN = {
  id: 'd1', kind: 'yorPdf', x: 0, y: 0, w: 800, h: 600, pdfDoc: { order: ['p1'] },
  'pf.f1': { name: 'made-up.pdf', data: '', bytes: 0 },
  'pp.p1': { file: 'f1', index: 0, w: 612, h: 792, rot: 0 },
  'pm.m1': mark(WORDS, 1),
  'pm.m2': mark(OTHER, 2),
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

function Page({ editId, windowId = 'd1', texts = {} }) {
  return ['m1', 'm2'].map((id) => {
    const m = { ...WIN[`pm.${id}`], ...(texts[id] != null ? { text: texts[id] } : {}) };
    return (
      <PdfMark key={id} id={id} mark={m} box={m} scale={1} selected={editId === id} editing={editId === id} windowId={windowId}
        onPointerDown={() => {}} onDoubleClick={() => {}} onText={() => {}} onEndEdit={() => {}} />
    );
  });
}

function openPage(doc, props = {}) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  const view = render(<Page {...props} />);
  return { awareness, view };
}

function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'd1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Signed');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
}

const markEl = (id) => document.querySelector(`[data-mark="${id}"]`);
const tagIn = (el) => el.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a text box's words on a PDF page are found as shared words", () => {
  const { a } = twoDocs();
  expect(pdfTextField('m1')).toBe('pm.m1/text');
  expect(sharedText(a, 'd1', pdfTextField('m1'))?.toString()).toBe(WORDS);
  expect(sharedText(a, 'd1', pdfTextField('m2'))?.toString()).toBe(OTHER);
});

test('a box shows a name tag for a teammate typing in it, and only that box', () => {
  const { a, b } = twoDocs();
  const { awareness } = openPage(a);
  samAt(b, awareness, pdfTextField('m1'), 'Signed'.length);
  expect(tagIn(markEl('m1'))).toHaveTextContent('Sam Example');
  expect(tagIn(markEl('m2'))).toBeNull();
});

test("typing in the same box, Pat sees Sam's cursor at the letter, and it moves with the words", () => {
  const { a, b } = twoDocs();
  const { awareness, view } = openPage(a, { editId: 'm1' });
  samAt(b, awareness, pdfTextField('m1'), 'Signed'.length);
  const box = screen.getByLabelText('Text on the page');
  expect(tagIn(box.parentElement)).toHaveAttribute('data-at', '6');
  expect(tagIn(box.parentElement)).toHaveTextContent('Sam Example');
  act(() => {
    sharedText(b, 'd1', pdfTextField('m1')).insert(0, 'OK: ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  view.rerender(<Page editId="m1" texts={{ m1: `OK: ${WORDS}` }} />);
  expect(tagIn(box.parentElement)).toHaveAttribute('data-at', '10');
});

test('typing in a box tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = twoDocs();
  const { awareness } = openPage(a, { editId: 'm2' });
  jest.useFakeTimers();
  try {
    const box = screen.getByLabelText('Text on the page');
    act(() => { box.focus(); box.setSelectionRange(4, 4); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'd1', field: 'pm.m2/text' }));
    expect(JSON.stringify(sent)).not.toContain('witness');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'd1', sent.field)[0].index).toBe(4);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('off a live board, typing in a box sends no cursor', () => {
  const { a } = twoDocs();
  const awareness = new Awareness(a);
  render(<Page editId="m1" />);
  jest.useFakeTimers();
  try {
    const box = screen.getByLabelText('Text on the page');
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
