/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { FirstMission } from '../src/components/onboarding/FirstMission.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import {
  areWindowsAdjacent,
  FIRST_MISSION_DRAG_EVENT,
  firstMissionStorageKey,
} from '../src/lib/firstMission.js';
import { getMissionCardPosition } from '../src/components/onboarding/missionTargeting.js';

const originalState = useWorkspaceStore.getState();

afterEach(() => {
  cleanup();
  localStorage.clear();
  act(() => useWorkspaceStore.setState(originalState, true));
});

test('adjacency rejects distant windows and accepts side-by-side windows', () => {
  const first = { id: 'a', x: 0, y: 0, w: 200, h: 200 };
  expect(areWindowsAdjacent(first, { id: 'b', x: 900, y: 0, w: 200, h: 200 })).toBe(false);
  expect(areWindowsAdjacent(first, { id: 'b', x: 240, y: 20, w: 200, h: 200 })).toBe(true);
});

test('mission card is positioned beside its live target and inside the viewport', () => {
  expect(getMissionCardPosition(
    { left: 24, top: 80, width: 120, height: 40 },
    { width: 1200, height: 800 },
  )).toEqual({ left: 158, top: 64 });

  const cramped = getMissionCardPosition(
    { left: 970, top: 650, width: 200, height: 120 },
    { width: 1200, height: 800 },
  );
  expect(cramped.left).toBeGreaterThanOrEqual(16);
  expect(cramped.left + 320).toBeLessThanOrEqual(1184);
  expect(cramped.top).toBeGreaterThanOrEqual(64);
  expect(cramped.top + 180).toBeLessThanOrEqual(784);
});

test('mission advances only after the four real workspace actions', async () => {
  act(() => useWorkspaceStore.setState({
    ...originalState, workspaceId: 'mission-space', wins: [], sidebarFavorites: [],
  }, true));
  render(<FirstMission />);
  expect(await screen.findByText('Open your first module')).toBeTruthy();

  const first = { id: 'first', kind: 'doc', x: 0, y: 0, w: 200, h: 200 };
  act(() => useWorkspaceStore.setState({ wins: [first] }));
  expect(await screen.findByText('Build a pair')).toBeTruthy();

  const second = { id: 'second', kind: 'terminal', x: 900, y: 0, w: 200, h: 200 };
  act(() => useWorkspaceStore.setState({ wins: [first, second] }));
  expect(await screen.findByText('Put them side by side')).toBeTruthy();
  act(() => window.dispatchEvent(new CustomEvent(FIRST_MISSION_DRAG_EVENT, {
    detail: { winId: 'second', position: { x: 240, y: 20 } },
  })));
  expect(await screen.findByText('Reveal quick access')).toBeTruthy();

  act(() => useWorkspaceStore.setState({ sidebarFavorites: ['todos', 'terminal'] }));
  expect(await screen.findByText('Make a to-do')).toBeTruthy();

  act(() => useWorkspaceStore.setState({
    wins: [first, { ...second, x: 240, y: 20 }, {
      id: 'todo-window', kind: 'todos', x: 0, y: 260, w: 320, h: 360,
      items: [{ id: 'task-1', text: 'Ship the demo', done: false }],
    }],
  }));
  expect(await screen.findByText('Mission complete')).toBeTruthy();
  await waitFor(() => expect(JSON.parse(localStorage.getItem(
    firstMissionStorageKey('mission-space'),
  )).state).toBe('completed'));
  await waitFor(() => expect(screen.queryByTestId('first-mission')).toBeNull(), { timeout: 2400 });
  expect(screen.queryByTestId('first-mission-replay')).toBeNull();
});
