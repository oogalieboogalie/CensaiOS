/** @jest-environment jsdom */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BoardWakeUp } from '../src/components/onboarding/BoardWakeUp.jsx';
import { TryThisWindow } from '../src/components/windows/tryThis/index.jsx';
import { LeadResults } from '../src/components/leadhound/LeadResults.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import { readFirstMission } from '../src/lib/firstMission.js';
import {
  freshBoardFor, glideOrder, greetingText, noteBoardLoad, shouldWakeUp, wakeUpStorageKey, wakeUpWindows,
} from '../src/lib/wakeUp/boardWakeUp.js';
import { SAMPLE_HUNT } from '../src/lib/wakeUp/sampleHunt.js';

// The board wakes up: only a never-stored board of a new account, only once,
// and one click clears it again.
const originalState = useWorkspaceStore.getState();
const NEW_BOARD = { status: 'ready', value: null, revision: 0, workspaceId: 'user-7-default' };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  noteBoardLoad(null);
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  act(() => useWorkspaceStore.setState(originalState, true));
});

const wake = () => {
  act(() => useWorkspaceStore.setState({ wins: [], workspaceId: 'user-7-default' }));
  render(<BoardWakeUp />);
  act(() => { jest.advanceTimersByTime(400); });
  return useWorkspaceStore.getState().wins;
};

test('only a board the server never stored, opened as your own, counts as new', () => {
  noteBoardLoad({ ...NEW_BOARD, revision: 3, value: { wins: [] } });
  expect(freshBoardFor('user-7-default')).toBeNull();
  noteBoardLoad(NEW_BOARD, { requestedId: 'someone-elses-board' });
  expect(freshBoardFor('user-7-default')).toBeNull();
  noteBoardLoad({ ...NEW_BOARD, status: 'restore_required' });
  expect(freshBoardFor('user-7-default')).toBeNull();
  noteBoardLoad(NEW_BOARD, { user: { name: 'Alex Green' } });
  expect(freshBoardFor('user-7-default')).toEqual({ workspaceId: 'user-7-default', name: 'Alex' });
  expect(freshBoardFor('another-board')).toBeNull();
});

test('a new board wakes up with a greeting, a try-this list and a finished sample hunt', () => {
  noteBoardLoad(NEW_BOARD, { user: { name: 'Sam' } });
  const wins = wake();
  expect(wins.map((w) => w.kind)).toEqual(['chat', 'leadHound', 'tryThis']);
  expect(wins.every((w) => w.wakeUp)).toBe(true);
  expect(wins[0].msgs[0].text).toMatch(/^Hi Sam, welcome to censaiOS\./);
  expect(wins[1].leadHound.result.leads).toHaveLength(3);
  // The first mission steps aside; the list's tour step brings it back.
  expect(readFirstMission('user-7-default')?.state).toBe('dismissed');
  expect(localStorage.getItem(wakeUpStorageKey('user-7-default'))).toBeTruthy();
});

test('it never wakes twice, never on a board that has windows, never on an existing board', () => {
  noteBoardLoad(NEW_BOARD);
  expect(shouldWakeUp({ workspaceId: 'user-7-default', wins: [{ id: 'x' }] })).toBe(false);
  expect(wake()).toHaveLength(3);
  act(() => useWorkspaceStore.setState({ wins: [] }));
  cleanup();
  expect(wake()).toHaveLength(0);

  localStorage.clear();
  noteBoardLoad({ ...NEW_BOARD, revision: 12, value: { wins: [] } });
  expect(wake()).toHaveLength(0);
});

test('the greeting skips the placeholder name local sign-in uses', () => {
  noteBoardLoad(NEW_BOARD, { user: { name: 'Owner' } });
  expect(freshBoardFor('user-7-default').name).toBe('');
  expect(greetingText('')).toMatch(/^Hi, welcome to censaiOS\./);
});

test('windows glide in only right after waking', () => {
  const [[, chat], [, hound]] = wakeUpWindows({ now: 1000 });
  expect(glideOrder(chat, 1500)).toBe('1');
  expect(glideOrder(hound, 1500)).toBe('2');
  expect(glideOrder(chat, 60000)).toBeUndefined();
  expect(glideOrder({ id: 'plain' }, 1500)).toBeUndefined();
});

test('the sample hunt reads like a real finished hunt and says it is a sample', () => {
  render(<LeadResults result={SAMPLE_HUNT} />);
  expect(screen.getByText(/Sample hunt: this business and these companies are made up/)).toBeTruthy();
  expect(screen.getAllByText('Lone Oak Plumbing Co.').length).toBeGreaterThan(0);
  for (const lead of SAMPLE_HUNT.leads) {
    expect(lead.sequence.map((t) => t.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(lead.iceBreaker.deliverable).toMatch(/Where the money goes/);
    expect(lead.host).toMatch(/\.example$/);
  }
});

test('Try this ticks off a step and one click clears every welcome window', () => {
  noteBoardLoad(NEW_BOARD);
  wake();
  act(() => useWorkspaceStore.getState().spawnAt('notes', { title: 'mine' }));
  const listWin = () => useWorkspaceStore.getState().wins.find((w) => w.kind === 'tryThis');
  const onUpdate = (patch) => useWorkspaceStore.getState().onUpdate(listWin().id, patch);
  const view = render(<TryThisWindow win={listWin()} onUpdate={onUpdate} />);

  fireEvent.click(screen.getByText('Read a finished lead hunt'));
  const hound = useWorkspaceStore.getState().wins.find((w) => w.kind === 'leadHound');
  expect(useWorkspaceStore.getState().activeId).toBe(hound.id);
  expect(listWin().tried).toEqual({ sample: true });
  view.rerender(<TryThisWindow win={listWin()} onUpdate={onUpdate} />);
  expect(screen.getByText('1 of 6 tried')).toBeTruthy();

  fireEvent.click(screen.getByText("Open the top lead's plan as a document"));
  const doc = useWorkspaceStore.getState().wins.find((w) => w.kind === 'doc');
  expect(doc.text).toMatch(/Lone Oak Plumbing/);

  fireEvent.click(screen.getByText('Clear the welcome windows'));
  // The welcome windows go; anything the person made (the note, the doc) stays.
  expect(useWorkspaceStore.getState().wins.map((w) => w.kind).sort()).toEqual(['doc', 'notes']);
});
