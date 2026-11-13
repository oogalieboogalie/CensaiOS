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
import { caretState, readTextCarets, setCaretChannel } from '../src/lib/collaboration/textCarets.js';
import { OfficeDocsWindow } from '../src/components/windows/officeDocs/index.jsx';
import { WorkflowWindow } from '../src/components/WorkflowWindow.jsx';
import { OFFICE_STARTERS } from '../src/lib/office/officeStarters.js';

// Live cursors in window names (a Writer document's title, a Workflow's
// name): Pat sees where Sam is typing, as a line with Sam's name, and Pat's
// own cursor goes out to teammates. Only a spot in the shared name goes out,
// never the words. All made up.
const NAME = 'Spring bake sale plan';
const SPOT = 'Spring bake'.length;
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

const KINDS = {
  writer: {
    win: { id: 'd1', ...OFFICE_STARTERS.officeDocs, kind: 'officeDocs', x: 0, y: 0, w: 700, h: 560, title: NAME },
    label: 'Document title',
    open: (win) => render(<OfficeDocsWindow win={win} onUpdate={() => {}} />),
  },
  workflow: {
    win: { id: 'f1', kind: 'workflow', x: 0, y: 0, w: 900, h: 600, title: NAME },
    label: 'Workflow name',
    open: (win) => {
      render(<WorkflowWindow win={win} onUpdate={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    },
  },
};

function twoDocs(win) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [win] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function openAs(kind, doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  KINDS[kind].open(KINDS[kind].win);
  return awareness;
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const boxOf = (kind) => screen.getByRole('textbox', { name: KINDS[kind].label });
const markIn = (kind) => boxOf(kind).parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

describe.each(Object.keys(KINDS))('%s name', (kind) => {
  const { id } = KINDS[kind].win;

  test("shows a teammate's cursor with their name", async () => {
    const { a, b } = twoDocs(KINDS[kind].win);
    const pat = openAs(kind, a);
    const sam = new Awareness(b);
    sam.setLocalState({ user: SAM, caret: caretState(b, id, 'title', SPOT) });
    expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('bake');
    act(() => applyRemoteAwareness(pat, sam));
    await screen.findByText('Sam Example');
    expect(markIn(kind)).toHaveAttribute('data-at', String(SPOT));
  });

  test("a teammate's cursor moves with the words when someone types in front of it", async () => {
    const { a, b } = twoDocs(KINDS[kind].win);
    const pat = openAs(kind, a);
    const sam = new Awareness(b);
    sam.setLocalState({ user: SAM, caret: caretState(b, id, 'title', SPOT) });
    act(() => applyRemoteAwareness(pat, sam));
    await screen.findByText('Sam Example');
    const text = (doc) => doc.getMap('canvas').get('windows').get(id).get('title');
    act(() => { text(b).insert(0, 'Big '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
    expect(markIn(kind)).toHaveAttribute('data-at', String(SPOT + 4));
  });

  test("a teammate's cursor in another field does not show in the name", async () => {
    const { a, b } = twoDocs({ ...KINDS[kind].win, prompt: 'Sam Example notes' });
    const pat = openAs(kind, a);
    const sam = new Awareness(b);
    sam.setLocalState({ user: SAM, caret: caretState(b, id, 'prompt', 2) });
    expect(sam.getLocalState().caret).not.toBeNull();
    act(() => applyRemoteAwareness(pat, sam));
    expect(markIn(kind)).toBeNull();
  });

  test('typing in the name tells teammates where my cursor is, and leaving takes it away', () => {
    const { a } = twoDocs(KINDS[kind].win);
    const awareness = openAs(kind, a);
    jest.useFakeTimers();
    try {
      const box = boxOf(kind);
      act(() => { box.focus(); box.setSelectionRange(5, 5); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
      const sent = awareness.getLocalState().caret;
      expect(sent).toEqual(expect.objectContaining({ windowId: id, field: 'title' }));
      expect(JSON.stringify(sent)).not.toContain('bake');
      expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, id, 'title')[0].index).toBe(5);
      act(() => { box.blur(); });
      expect(awareness.getLocalState().caret).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
