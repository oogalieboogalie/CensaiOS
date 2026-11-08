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
import { starterGraph } from '../src/lib/workflow/graph.js';
import { NodeInspector } from '../src/components/workflow/NodeInspector.jsx';

// Live cursors in Workflow steps: Pat sees where Sam is typing in a step's
// instructions, as a line with Sam's name, and Pat's own cursor goes out to
// teammates. Each step's box is its own words, so a cursor in one step never
// shows in another. Only a spot goes out, never the words. All made up.
const GRAPH = starterGraph();
const WIN = { id: 'w1', kind: 'workflow', x: 0, y: 0, w: 900, h: 600, title: 'Open house', graph: GRAPH };
const DRAFT = GRAPH.nodes.findIndex((n) => n.id === 'draft');
const WORDS = GRAPH.nodes[DRAFT].instructions; // 'Write a short plan from this.'
const field = (key, at = DRAFT) => `graph/nodes/${at}/${key}`;
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };

function twoDocs() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeStateToDoc(a, null, { wins: [WIN] }, 'local');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { a, b };
}

function Inspector({ id, winId = 'w1' }) {
  const flow = { graph: GRAPH, patchNode: () => {}, removeNode: () => {}, saveTrigger: () => {}, armed: null };
  const node = GRAPH.nodes.find((n) => n.id === id);
  return <NodeInspector node={node} flow={flow} agents={[{ id: 'censai', name: 'Censai' }]} result={null} winId={winId} />;
}

function openStep(doc, id = 'draft', winId = 'w1') {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  const view = render(<Inspector id={id} winId={winId} />);
  return { awareness, view };
}

function applyRemoteAwareness(to, from) {
  to.states.set(from.clientID, from.getLocalState());
  to.meta.set(from.clientID, { clock: 1, lastUpdated: Date.now() });
  to.emit('change', [{ added: [from.clientID], updated: [], removed: [] }, 'remote']);
}

const instructions = () => screen.getByDisplayValue(WORDS);
const markIn = (box) => box.parentElement.querySelector('[data-teammate-caret]');

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test("a step's words are found as shared words, and its place is not", () => {
  const { a } = twoDocs();
  expect(sharedText(a, 'w1', field('instructions'))?.toString()).toBe(WORDS);
  expect(sharedText(a, 'w1', field('title'))?.toString()).toBe(GRAPH.nodes[DRAFT].title);
  expect(sharedText(a, 'w1', field('x'))).toBeNull();
  expect(sharedText(a, 'w1', field('agentId'))).toBeNull();
});

test("a step shows a teammate's cursor with their name, only in that step's box", () => {
  const { a, b } = twoDocs();
  const { awareness: pat, view } = openStep(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'w1', field('instructions'), 'Write a'.length) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('plan');
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn(instructions())).toHaveAttribute('data-at', '7');
  expect(markIn(instructions())).toHaveTextContent('Sam Example');
  // The step's name box shows nothing: Sam is in the instructions.
  expect(markIn(screen.getByDisplayValue(GRAPH.nodes[DRAFT].title))).toBeNull();
  // Another step open shows no cursor at all.
  view.rerender(<Inspector id="start" />);
  expect(document.querySelector('[data-teammate-caret]')).toBeNull();
});

test("a teammate's cursor moves with the words when someone types in front of it", () => {
  const { a, b } = twoDocs();
  const { awareness: pat } = openStep(a);
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'w1', field('instructions'), 5) });
  act(() => applyRemoteAwareness(pat, sam));
  expect(markIn(instructions())).toHaveAttribute('data-at', '5');
  const text = (doc) => sharedText(doc, 'w1', field('instructions'));
  act(() => { text(b).insert(0, 'Pat: '); Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote'); });
  expect(markIn(instructions())).toHaveAttribute('data-at', '10');
});

test("typing in a step tells teammates where my cursor is, and leaving takes it away", () => {
  const { a } = twoDocs();
  const { awareness } = openStep(a);
  jest.useFakeTimers();
  try {
    const box = instructions();
    act(() => { box.focus(); box.setSelectionRange(3, 3); fireEvent.keyUp(box, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'w1', field: field('instructions') }));
    expect(JSON.stringify(sent)).not.toContain('plan');
    expect(readTextCarets(new Map([[9, { user: PAT, caret: sent }]]), 1, a, 'w1', field('instructions'))[0].index).toBe(3);
    act(() => { box.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a viewer with no window sends no cursor', () => {
  const { a } = twoDocs();
  const { awareness } = openStep(a, 'draft', null);
  jest.useFakeTimers();
  try {
    const box = instructions();
    act(() => { box.focus(); fireEvent.keyUp(box, { key: 'a' }); jest.runOnlyPendingTimers(); });
    expect(awareness.getLocalState()?.caret ?? null).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
