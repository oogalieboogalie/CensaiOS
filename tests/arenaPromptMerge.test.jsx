/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { ModelArenaWindow } from '../src/components/windows/modelArena/index.jsx';
import { useArena } from '../src/components/windows/modelArena/useArena.js';

// Model Arena's request and its instructions merge letter by letter: Pat and
// Sam typing in the same box at the same moment both keep what they typed,
// instead of the last one wiping the other, and both screens see it as they
// type (before, the request stayed on one screen until a race ended). All
// words are made up.
const LOCAL = 'local';
const PROMPT = 'Write a made-up recipe for bread';
const SYSTEM = 'Be brief.';
const board = (fields = {}) => ({
  wins: [{ id: 'm1', kind: 'modelArena', x: 0, y: 0, w: 1100, h: 700, prompt: PROMPT, system: SYSTEM, ...fields }],
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

const winOf = (doc, base) => readDocState(doc, base).wins[0];

function startBoth() {
  const pair = offlinePair();
  const base = board();
  writeStateToDoc(pair.a, null, base, LOCAL);
  pair.sync();
  return { ...pair, base };
}

afterEach(cleanup);

test('Pat and Sam typing in the request at once keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ prompt: `Please: ${PROMPT}` }), LOCAL);
  writeStateToDoc(b, base, board({ prompt: `${PROMPT} in 3 steps` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).prompt).toBe(`Please: ${PROMPT} in 3 steps`);
});

test('one person in the request and the other in the instructions both keep their change', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ prompt: `${PROMPT}!` }), LOCAL);
  writeStateToDoc(b, base, board({ system: `${SYSTEM} Use plain words.` }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const win = winOf(doc, base);
    expect([win.prompt, win.system]).toEqual([`${PROMPT}!`, `${SYSTEM} Use plain words.`]);
  }
});

test('a request saved whole by an older board still merges after its first edit', () => {
  const { a, b, sync, base } = startBoth();
  a.getMap('canvas').get('windows').get('m1').set('prompt', PROMPT);
  sync();
  const one = board({ prompt: `${PROMPT}.` });
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, board({ prompt: `Pat: ${PROMPT}.` }), LOCAL);
  writeStateToDoc(b, one, board({ prompt: `${PROMPT}. (Sam)` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).prompt).toBe(`Pat: ${PROMPT}. (Sam)`);
});

test('an agent changing the request only touches the letters it changed', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ prompt: `${PROMPT} (Pat)` }), LOCAL);
  upsertWindowInDoc(b, { ...base.wins[0], prompt: PROMPT.replace('recipe', 'plan') });
  sync();
  for (const doc of [a, b]) expect(winOf(doc, base).prompt).toBe(`${PROMPT.replace('recipe', 'plan')} (Pat)`);
});

test('typing saves to the board right away, and a sample task fills both boxes', () => {
  const updates = [];
  let arena;
  function Probe() { arena = useArena({ id: 'm1' }, (patch) => updates.push(patch)); return null; }
  render(<Probe />);
  act(() => arena.setPrompt('Name three made-up towns'));
  act(() => arena.setSystem('One line each.'));
  act(() => arena.pickSample({ prompt: 'Sum 2 and 2', system: 'Answer only.' }));
  expect(updates).toEqual([
    { prompt: 'Name three made-up towns' },
    { system: 'One line each.' },
    { prompt: 'Sum 2 and 2', system: 'Answer only.' },
  ]);
});

test('a teammate typing before your cursor in the request keeps your cursor in place', async () => {
  const win = { id: 'w1', kind: 'modelArena', prompt: PROMPT, system: '' };
  const noop = () => {};
  let view;
  await act(async () => { view = render(<ModelArenaWindow win={win} onUpdate={noop} />); });
  const { rerender } = view;
  const box = screen.getByRole('textbox', { name: 'Request to send to every model' });
  expect(box.value).toBe(PROMPT);
  box.focus();
  const at = 'Write a made-up'.length;
  box.setSelectionRange(at, at);
  rerender(<ModelArenaWindow win={{ ...win, prompt: `Sam says: ${PROMPT}` }} onUpdate={noop} />);
  expect(box.value).toBe(`Sam says: ${PROMPT}`);
  expect(box.value.slice(0, box.selectionStart)).toBe('Sam says: Write a made-up');
});

test("a teammate's new instructions show on your screen, since your race sends them too", async () => {
  const win = { id: 'w1', kind: 'modelArena', prompt: PROMPT, system: '' };
  const noop = () => {};
  let view;
  await act(async () => { view = render(<ModelArenaWindow win={win} onUpdate={noop} />); });
  expect(screen.queryByRole('textbox', { name: 'Instructions for every model' })).toBeNull();
  view.rerender(<ModelArenaWindow win={{ ...win, system: SYSTEM }} onUpdate={noop} />);
  expect(screen.getByRole('textbox', { name: 'Instructions for every model' }).value).toBe(SYSTEM);
});
