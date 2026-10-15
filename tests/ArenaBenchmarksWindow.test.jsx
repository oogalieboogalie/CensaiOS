/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModelArenaWindow } from '../src/components/windows/modelArena/index.jsx';
import { ArenaBenchmarksWindow } from '../src/components/windows/arenaBenchmarks/index.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import { BENCHMARK_TASKS } from '../src/lib/modelArena/benchmarkTasks.js';

const lanes = [
  { provider: 'google', model: 'gemini-3.8-flash' },
  { provider: 'anthropic', model: 'claude-haiku-5-5' },
];
const done = (text, firstTokenMs, totalMs) => ({ status: 'done', text, firstTokenMs, totalMs, usage: { input: 50, output: 40 }, error: null });

// Holds the window's data the way the board does: onUpdate merges into it.
function Board({ initial, Window }) {
  const [win, setWin] = React.useState(initial);
  const onUpdate = React.useCallback((patch) => setWin((w) => ({ ...w, ...patch })), []);
  return <Window win={win} onUpdate={onUpdate} />;
}

const benchmarks = () => useWorkspaceStore.getState().wins.find((w) => w.kind === 'arenaBenchmarks');

beforeEach(() => useWorkspaceStore.setState({ wins: [] }));
afterEach(cleanup);

test('marking and recording a race opens Benchmarks on the board, and later marks update it', () => {
  render(<Board Window={ModelArenaWindow} initial={{
    id: 'arena-1', lanes, prompt: 'Where is the tax rate?',
    lastRun: { at: '2026-10-13T17:00:00Z', lanes, results: [done('tax.js:2', 400, 1800), done('tax.js line 2', 300, 1200)] },
  }} />);
  const lane2 = screen.getByRole('group', { name: 'Marks for model 2' });
  fireEvent.click(within(lane2).getByRole('button', { name: 'Best answer' }));
  fireEvent.click(within(lane2).getByRole('button', { name: 'Right' }));
  expect(screen.getByRole('combobox', { name: 'Judge model' }).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: /Record this run/ }));

  const board = benchmarks();
  expect(board.runs).toHaveLength(1);
  expect(board.runs[0]).toMatchObject({ prompt: 'Where is the tax rate?', marks: { best: 1, lanes: { 1: 'right' } } });
  expect(board.runs[0].lanes[1]).toMatchObject({ model: 'claude-haiku-5-5', firstTokenMs: 300, totalMs: 1200 });
  expect(screen.getByText(/Recorded\./)).toBeTruthy();
  expect(screen.getByText(/Your own request: you can record it as a note/)).toBeTruthy();
  expect(board.runs[0].task).toBeUndefined();

  fireEvent.click(within(screen.getByRole('group', { name: 'Marks for model 1' })).getByRole('button', { name: 'Wrong' }));
  expect(benchmarks().runs[0].marks.lanes).toEqual({ 0: 'wrong', 1: 'right' });
  expect(useWorkspaceStore.getState().wins.filter((w) => w.kind === 'arenaBenchmarks')).toHaveLength(1);
});

test('a benchmark task shows its cost before the race and what a right answer is after', () => {
  const task = BENCHMARK_TASKS.find((t) => t.id === 'commission');
  const { unmount } = render(<Board Window={ModelArenaWindow} initial={{ id: 'arena-3', lanes }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Work out the money' }));
  expect(screen.getByLabelText('Cost estimate').textContent).toMatch(/gemini-3.8-flash about \$0\.0007 · Claude Haiku 5.5 about < \$0\.0001/);
  unmount();
  render(<Board Window={ModelArenaWindow} initial={{
    id: 'arena-4', lanes, prompt: task.prompt, system: task.system,
    lastRun: { lanes, results: [done('$8,400', 400, 1800), { ...done('$8,4', 300, 1200), finishReason: 'length' }] },
  }} />);
  expect(screen.getByText(/A right answer: \$8,400/)).toBeTruthy();
  expect(screen.getByText('Cut off, so it cannot count as right.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Record this run/ }));
  expect(benchmarks().runs[0]).toMatchObject({ task: 'commission', taskVersion: 1 });
  expect(benchmarks().runs[0].lanes[1]).toMatchObject({ cutOff: true });
});

test('no marks or record button while nothing has finished', () => {
  render(<Board Window={ModelArenaWindow} initial={{ id: 'arena-2', lanes }} />);
  expect(screen.queryByRole('button', { name: /Record this run/ })).toBeNull();
  expect(screen.queryByRole('group', { name: /Marks for model/ })).toBeNull();
});

test('the Benchmarks window shows the model table and lets anyone re-mark a run', () => {
  const run = {
    id: 'run-a', at: '2026-10-13T17:00:00Z', prompt: 'Map a repo', task: 'map',
    lanes: [
      { ...lanes[0], status: 'done', firstTokenMs: 400, totalMs: 1800, usage: { input: 50, output: 40 }, cost: 0.0002, tokensPerSecond: 28, text: 'map one' },
      { ...lanes[1], status: 'done', firstTokenMs: 300, totalMs: 1200, usage: { input: 50, output: 40 }, cost: 0.00003, tokensPerSecond: 44, text: 'map two' },
    ],
    marks: { best: 1, lanes: { 1: 'right' }, judge: null },
  };
  render(<Board Window={ArenaBenchmarksWindow} initial={{ id: 'bench-1', runs: [run] }} />);
  const table = screen.getByRole('table');
  const haiku = within(table).getByRole('row', { name: /Claude Haiku 5.5/ });
  expect(within(haiku).getByText('Most picked')).toBeTruthy();
  expect(within(haiku).getByText('Fastest finish')).toBeTruthy();
  expect(within(haiku).getByText('Fast and right')).toBeTruthy();
  expect(within(haiku).getByText('1.2 s', { selector: '.hb-bench-headline' })).toBeTruthy();
  expect(within(haiku).getByText('100% of 1')).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: 'Runs' }));
  expect(screen.getByText(/Map a repo/, { selector: 'span' })).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'Best answer' })[0]);
  fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
  const gemini = within(screen.getByRole('table')).getByRole('row', { name: /gemini-3.8-flash/i });
  expect(within(gemini).getByText('Most picked')).toBeTruthy();
});

test('an empty Benchmarks window says how to fill it', () => {
  render(<Board Window={ArenaBenchmarksWindow} initial={{ id: 'bench-2' }} />);
  expect(screen.getByText('No runs recorded yet.')).toBeTruthy();
});
