/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { starterGraph } from '../src/lib/workflow/graph.js';
import { NodeInspector } from '../src/components/workflow/NodeInspector.jsx';

// A Workflow window's steps merge: Pat and Sam typing in one step's
// instructions at the same moment both keep their words, and one person
// moving a step while the other types in another keeps both changes.
// Before, the whole drawing was saved as one piece, so the last one to
// change anything wiped the other's change. All words are made up.
const LOCAL = 'local';
const GRAPH = starterGraph();
const board = (graph) => ({ wins: [{ id: 'w1', kind: 'workflow', x: 0, y: 0, w: 900, h: 600, title: 'Open house', graph }] });
const withStep = (graph, id, patch) => ({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });

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

const graphOf = (doc, base) => readDocState(doc, base).wins[0].graph;
const step = (doc, base, id) => graphOf(doc, base).nodes.find((n) => n.id === id);
const WORDS = GRAPH.nodes[1].instructions; // 'Write a short plan from this.'

afterEach(cleanup);

test("Pat and Sam typing in one step's instructions keep both their words", () => {
  const base = board(GRAPH);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(withStep(GRAPH, 'draft', { instructions: `Sam Example says: ${WORDS}` })), LOCAL);
  writeStateToDoc(b, base, board(withStep(GRAPH, 'draft', { instructions: `${WORDS} Keep it to five lines.` })), LOCAL);
  sync();
  for (const doc of [a, b]) {
    expect(step(doc, base, 'draft').instructions).toBe(`Sam Example says: ${WORDS} Keep it to five lines.`);
  }
});

test('one person moves a step while the other types in another; both changes stay', () => {
  const base = board(GRAPH);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(withStep(GRAPH, 'start', { input: 'Two ideas for Pat Example.' })), LOCAL);
  writeStateToDoc(b, base, board(withStep(GRAPH, 'result', { x: 600, y: 300 })), LOCAL);
  sync();
  for (const doc of [a, b]) {
    expect(step(doc, base, 'start').input).toBe('Two ideas for Pat Example.');
    expect(step(doc, base, 'result')).toMatchObject({ x: 600, y: 300 });
  }
});

test('a step added on one screen and a name typed on the other both stay', () => {
  const base = board(GRAPH);
  const { a, b, sync } = startBoth(base);
  const extra = { id: 'check', type: 'branch', x: 300, y: 260, title: 'Check', test: 'contains', value: 'plan' };
  writeStateToDoc(a, base, board({ ...GRAPH, nodes: [...GRAPH.nodes, extra] }), LOCAL);
  writeStateToDoc(b, base, board(withStep(GRAPH, 'draft', { title: 'Draft the plan' })), LOCAL);
  sync();
  for (const doc of [a, b]) {
    expect(graphOf(doc, base).nodes.map((n) => n.id)).toEqual(['start', 'draft', 'result', 'check']);
    expect(step(doc, base, 'draft').title).toBe('Draft the plan');
    expect(graphOf(doc, base).edges).toEqual(GRAPH.edges);
  }
});

test('a removed step and its lines stay removed on both screens', () => {
  const base = board(GRAPH);
  const { a, b, sync } = startBoth(base);
  const gone = { nodes: GRAPH.nodes.filter((n) => n.id !== 'draft'), edges: [] };
  writeStateToDoc(a, base, board(gone), LOCAL);
  sync();
  expect(graphOf(b, base)).toEqual(gone);
});

test('a graph saved whole by an older board still merges after its first edit', () => {
  const base = board(GRAPH);
  const { a, b, sync } = startBoth(base);
  const win = a.getMap('canvas').get('windows').get('w1');
  win.set('graph', new Y.Map([['nodes', Y.Array.from(GRAPH.nodes.map((n) => new Y.Map(Object.entries(n))))], ['edges', Y.Array.from(GRAPH.edges.map((e) => new Y.Map(Object.entries(e))))]]));
  sync();
  const one = board(withStep(GRAPH, 'draft', { instructions: `${WORDS} Today.` }));
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  const g = one.wins[0].graph;
  writeStateToDoc(a, one, board(withStep(g, 'draft', { instructions: `Pat: ${WORDS} Today.` })), LOCAL);
  writeStateToDoc(b, one, board(withStep(g, 'draft', { instructions: `${WORDS} Today. OK` })), LOCAL);
  sync();
  for (const doc of [a, b]) expect(step(doc, base, 'draft').instructions).toBe(`Pat: ${WORDS} Today. OK`);
});

function inspector(instructions, patchNode = () => {}) {
  const node = { ...GRAPH.nodes[1], instructions };
  return <NodeInspector node={node} flow={{ patchNode, removeNode: () => {} }} agents={[{ id: 'censai', name: 'Censai' }]} />;
}

test('typing in a step saves it right away', () => {
  const patchNode = jest.fn();
  render(inspector(WORDS, patchNode));
  fireEvent.change(screen.getByLabelText('What should it do?'), { target: { value: `${WORDS}!` } });
  expect(patchNode).toHaveBeenCalledWith('draft', { instructions: `${WORDS}!` });
});

test("a teammate's letters show in the step and keep your cursor in place", () => {
  const { rerender } = render(inspector(WORDS));
  const box = screen.getByLabelText('What should it do?');
  act(() => { box.focus(); box.setSelectionRange(5, 5); });
  rerender(inspector(`Sam: ${WORDS}`));
  expect(box.value).toBe(`Sam: ${WORDS}`);
  expect(box.value.slice(0, box.selectionStart)).toBe('Sam: Write');
});

test('two people dragging one step at once never mix their x and y', () => {
  const base = board(GRAPH);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, board(withStep(GRAPH, 'result', { x: 600 })), LOCAL);
  writeStateToDoc(b, base, board(withStep(GRAPH, 'result', { y: 400 })), LOCAL);
  sync();
  const spots = [a, b].map((doc) => { const s = step(doc, base, 'result'); return [s.x, s.y]; });
  expect(spots[0]).toEqual(spots[1]);
  expect([[600, 120], [476, 400]]).toContainEqual(spots[0]);
});
