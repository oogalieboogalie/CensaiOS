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
import { readPhoto } from '../src/lib/creative/photoModel.js';
import { readVideo } from '../src/lib/creative/videoModel.js';
import { PhotoPanel } from '../src/components/creative/photo/PhotoPanel.jsx';
import { ClipInspector } from '../src/components/creative/video/ClipInspector.jsx';

// Live cursors in Censai Photo (a text layer's words and its name) and Censai
// Video (a title's words): Pat sees where Sam is typing, as a line with Sam's
// name, and Pat's own cursor goes out to teammates. Each layer or title is its
// own words, so a cursor in one never shows in another, and a cursor in a
// layer's words never shows in its name. Only a spot goes out, never words.
// All words are made up.
const SIGN = 'Grand opening Friday';
const NOTE = 'Free coffee for all';
const layer = (name, text, at) => ({ kind: 'text', name, x: 0, y: 0, visible: true, opacity: 1, blend: 'source-over', adj: {}, text, size: 64, weight: 600, at });
const clip = (text, start, at) => ({ track: 't', start, dur: 3, text, pos: 'center', size: 72, at });
const PHOTO = {
  id: 'p1', kind: 'creativePhoto', x: 0, y: 0, w: 800, h: 600,
  photoDoc: { w: 1200, h: 800, order: ['l1', 'l2'] },
  'pl.l1': layer('Shop sign', SIGN, 1), 'pl.l2': layer('Small note', NOTE, 2),
};
const VIDEO = {
  id: 'v1', kind: 'creativeVideo', x: 0, y: 0, w: 800, h: 600,
  videoDoc: { w: 1280, h: 720, fps: 30 },
  'vc.c1': clip(SIGN, 0, 1), 'vc.c2': clip(NOTE, 3, 2),
};
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs(win) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [win] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function Photo({ win, start }) {
  const [current, select] = React.useState(start);
  const doc = readPhoto(win);
  const p = { doc, layer: doc.layers[current], current, select, setLayer: () => {}, addLayer: () => {}, duplicate: () => {}, move: () => {}, remove: () => {} };
  return <PhotoPanel p={p} windowId={win.id} />;
}

function Video({ win, start }) {
  const [id, setId] = React.useState(start);
  const doc = readVideo(win);
  const c = doc.clips[id];
  return (
    <>
      <button type="button" onClick={() => setId(id === 'c1' ? 'c2' : 'c1')}>Other title</button>
      <ClipInspector clip={c} clipId={id} windowId={win.id} onChange={() => {}} />
    </>
  );
}

function open(doc, ui) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(ui);
  return awareness;
}

function samAt(b, pat, windowId, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, windowId, field, index) });
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
  return sam;
}

const box = (name) => screen.getByRole('textbox', { name });
const markIn = (el) => el.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a Photo layer's words and name, and a Video title's words, are shared words; their size is not", () => {
  const { a } = twoDocs(PHOTO);
  expect(sharedText(a, 'p1', 'pl.l1/text')?.toString()).toBe(SIGN);
  expect(sharedText(a, 'p1', 'pl.l2/name')?.toString()).toBe('Small note');
  expect(sharedText(a, 'p1', 'pl.l1/size')).toBeNull();
  const { a: v } = twoDocs(VIDEO);
  expect(sharedText(v, 'v1', 'vc.c2/text')?.toString()).toBe(NOTE);
  expect(sharedText(v, 'v1', 'vc.c2/pos')).toBeNull();
});

test("Photo: a teammate's cursor shows with their name in that layer's words only", () => {
  const { a, b } = twoDocs(PHOTO);
  const pat = open(a, <Photo win={PHOTO} start="l1" />);
  const sam = samAt(b, pat, 'p1', 'pl.l1/text', 'Grand'.length);
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('Friday');
  expect(markIn(box('Text'))).toHaveAttribute('data-at', '5');
  expect(markIn(box('Text'))).toHaveTextContent('Sam Example');
  expect(markIn(box('Layer name'))).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^T\s*Small note$/ }));
  expect(box('Text')).toHaveValue(NOTE);
  expect(markIn(box('Text'))).toBeNull();
});

test("Photo: a teammate typing a layer's name shows there, and moves when letters land in front", () => {
  const { a, b } = twoDocs(PHOTO);
  const pat = open(a, <Photo win={PHOTO} start="l2" />);
  samAt(b, pat, 'p1', 'pl.l2/name', 5);
  expect(markIn(box('Layer name'))).toHaveAttribute('data-at', '5');
  expect(markIn(box('Text'))).toBeNull();
  act(() => { sharedText(b, 'p1', 'pl.l2/name').insert(0, 'My '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(box('Layer name'))).toHaveAttribute('data-at', '8');
});

test("Video: a teammate's cursor shows with their name in that title only", () => {
  const { a, b } = twoDocs(VIDEO);
  const pat = open(a, <Video win={VIDEO} start="c1" />);
  samAt(b, pat, 'v1', 'vc.c1/text', 3);
  expect(markIn(box('Title text'))).toHaveAttribute('data-at', '3');
  expect(markIn(box('Title text'))).toHaveTextContent('Sam Example');
  fireEvent.click(screen.getByRole('button', { name: 'Other title' }));
  expect(box('Title text')).toHaveValue(NOTE);
  expect(markIn(box('Title text'))).toBeNull();
});

test('typing in a Photo layer or Video title tells teammates where my cursor is, and leaving takes it away', () => {
  const cases = [[PHOTO, <Photo key="p" win={PHOTO} start="l1" />, 'Text', 'pl.l1/text'],
    [PHOTO, <Photo key="n" win={PHOTO} start="l1" />, 'Layer name', 'pl.l1/name'],
    [VIDEO, <Video key="v" win={VIDEO} start="c1" />, 'Title text', 'vc.c1/text']];
  for (const [win, ui, name, field] of cases) {
    const { a } = twoDocs(win);
    const awareness = open(a, ui);
    jest.useFakeTimers();
    try {
      const el = box(name);
      act(() => { el.focus(); el.setSelectionRange(2, 2); fireEvent.keyUp(el, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
      const sent = awareness.getLocalState().caret;
      expect(sent).toEqual(expect.objectContaining({ windowId: win.id, field }));
      expect(JSON.stringify(sent)).not.toContain('Friday');
      expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, win.id, field)[0].index).toBe(2);
      act(() => { el.blur(); });
      expect(awareness.getLocalState().caret).toBeNull();
    } finally {
      jest.useRealTimers();
      cleanup();
    }
  }
});

test('a viewer with no window sends no cursor', () => {
  const { a } = twoDocs(VIDEO);
  const awareness = new Awareness(a);
  act(() => setCaretChannel(a, awareness));
  const { id, ...noId } = VIDEO;
  render(<Video win={noId} start="c1" />);
  jest.useFakeTimers();
  try {
    const el = box('Title text');
    act(() => { el.focus(); fireEvent.keyUp(el, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
