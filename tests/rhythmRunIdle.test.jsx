/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// An open Rhythm Run window that isn't playing must not keep a 60-frames-a-
// second loop going: the menu and results draw one still frame.
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, render } from '@testing-library/react';
import { RhythmRunWindow } from '../src/components/windows/rhythm/index.jsx';

let queued;
beforeEach(() => {
  queued = new Map();
  let next = 1;
  global.requestAnimationFrame = jest.fn((cb) => { const id = next; next += 1; queued.set(id, cb); return id; });
  global.cancelAnimationFrame = jest.fn((id) => queued.delete(id));
  HTMLCanvasElement.prototype.getContext = () => null;
});
afterEach(cleanup);

function flushFrames(times) {
  for (let i = 0; i < times; i += 1) {
    const due = [...queued.entries()];
    queued.clear();
    for (const [, cb] of due) cb(performance.now() + i * 16);
  }
}

test('the menu draws once and then stops asking for frames', () => {
  render(<RhythmRunWindow win={{ id: 'rr-idle', kind: 'rhythmRun' }} onUpdate={() => {}} />);
  act(() => flushFrames(1));
  const asked = global.requestAnimationFrame.mock.calls.length;
  expect(asked).toBeGreaterThan(0);
  act(() => flushFrames(120));
  expect(global.requestAnimationFrame.mock.calls.length).toBe(asked);
  expect(queued.size).toBe(0);
});
