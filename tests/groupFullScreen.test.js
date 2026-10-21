/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react';

// Stand-in bodies: a ticking terminal and a slow chat. They must keep running
// while a saved group is full screen, because the real windows unmount (and
// abort) if the canvas removes them.
jest.unstable_mockModule('../src/components/canvas/CanvasRenderer.jsx', () => {
  function StandIn({ canvasObject }) {
    const [ticks, setTicks] = React.useState(0);
    const [answer, setAnswer] = React.useState('');
    React.useEffect(() => {
      if (canvasObject.id !== 'term') return undefined;
      const id = setInterval(() => setTicks((n) => n + 1), 30);
      return () => clearInterval(id);
    }, [canvasObject.id]);
    React.useEffect(() => {
      if (canvasObject.id !== 'chat') return undefined;
      const timer = setTimeout(() => setAnswer('the whole answer'), 70);
      return () => clearTimeout(timer);
    }, [canvasObject.id]);
    const text = canvasObject.id === 'term' ? String(ticks) : canvasObject.id === 'chat' ? answer : 'inside';
    return React.createElement('div', { 'data-testid': `body-${canvasObject.id}` }, text);
  }
  return { CanvasObjectRenderer: StandIn };
});

const { CanvasWindows } = await import('../src/components/canvas/CanvasWindowLayers.jsx');
const { useWorkspaceStore } = await import('../src/lib/store.js');
const { pendingAppLog } = await import('../src/lib/appLog/browserLog.js');
const { filterForGroupFocus } = await import('../src/lib/groupHotkeys.js');

const group = { id: 'g1', label: 'Launch', x: 0, y: 0, w: 800, h: 600 };
const inside = { id: 'in', kind: 'notes', title: 'Inside', groupId: 'g1', x: 40, y: 40, w: 200, h: 160 };
const term = { id: 'term', kind: 'terminal', title: 'Shell', x: 4000, y: 4000, w: 320, h: 200 };
const chat = { id: 'chat', kind: 'chat', title: 'Chat', x: 4400, y: 4000, w: 320, h: 220 };
const board = [inside, term, chat];

function freshLines() {
  return pendingAppLog().map((entry) => entry.message);
}

function renderFocused() {
  const view = filterForGroupFocus(board, [group], { groupId: 'g1' });
  const noop = () => {};
  return render(React.createElement(CanvasWindows, {
    wins: view.mountedWins,
    canvasGroups: view.canvasGroups,
    zoom: 1,
    pan: { x: 0, y: 0 },
    activeId: 'in',
    selectedIds: [],
    groups: [],
    getProjectContext: () => null,
    onUpdate: noop,
    onClose: noop,
    onSelect: noop,
    onSpawn: noop,
  }));
}

describe('group full screen keeps outside work running', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      wins: board,
      canvasGroups: [group],
      groupFocus: { groupId: 'g1', slot: '1', prevPan: { x: 12, y: 34 }, prevZoom: 0.5 },
      pan: { x: 0, y: 0 },
      zoom: 1,
      activeId: 'in',
      selectedIds: [],
      links: [],
    });
  });

  test('windows outside the group stay mounted and hidden', async () => {
    const view = filterForGroupFocus(board, [group], { groupId: 'g1' });
    expect(view.wins.map((w) => w.id)).toEqual(['in']);
    expect(view.mountedWins.map((w) => w.id)).toEqual(['in', 'term', 'chat']);
    expect(view.hiddenOutside).toEqual(['chat', 'term']);

    const { container, unmount } = renderFocused();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="body-chat"]')?.textContent).toBe('the whole answer');
      expect(Number(container.querySelector('[data-testid="body-term"]')?.textContent)).toBeGreaterThan(1);
    });

    const chatNode = container.querySelector('[data-testid="body-chat"]');
    const termNode = container.querySelector('[data-testid="body-term"]');
    const ticks = Number(termNode.textContent);
    expect(container.querySelector('[data-win-shell="term"]').style.display).toBe('none');
    expect(container.querySelector('[data-win-shell="chat"]').style.display).toBe('none');
    expect(container.querySelector('[data-win-shell="in"]').style.display).not.toBe('none');

    act(() => {
      useWorkspaceStore.setState({ groupFocus: null });
    });

    expect(container.querySelector('[data-testid="body-chat"]')).toBe(chatNode);
    expect(container.querySelector('[data-testid="body-term"]')).toBe(termNode);
    expect(chatNode.textContent).toBe('the whole answer');
    expect(Number(termNode.textContent)).toBeGreaterThanOrEqual(ticks);
    expect(container.querySelector('[data-win-shell="term"]').style.display).not.toBe('none');
    unmount();
  });

  test('opening a window during full screen ends full screen first', () => {
    const seen = new Set(freshLines());
    const order = [];
    const unsub = useWorkspaceStore.subscribe((state, prev) => {
      if (prev.groupFocus && !state.groupFocus) order.push('exit');
      if (state.wins.length > prev.wins.length) order.push('add');
    });
    let id;
    act(() => {
      id = useWorkspaceStore.getState().spawnAt('terminal', { title: 'Shell' });
    });
    unsub();

    const state = useWorkspaceStore.getState();
    expect(order.slice(0, 2)).toEqual(['exit', 'add']);
    expect(state.groupFocus).toBeNull();
    expect(state.pan).toEqual({ x: 12, y: 34 });
    expect(state.zoom).toBe(0.5);
    const opened = state.wins.find((w) => w.id === id);
    expect(opened).toBeTruthy();
    expect(filterForGroupFocus(state.wins, state.canvasGroups, null).hiddenOutside).toEqual([]);

    const fresh = freshLines().filter((line) => !seen.has(line));
    expect(fresh.some((line) => line.includes('F1 ended by opening a') && line.includes(opened.kind) && line.includes('kept running outside'))).toBe(true);
  });

  test('F1 logs the start once, and Escape logs the end', () => {
    useWorkspaceStore.setState({ groupFocus: null, pan: { x: 3, y: 4 }, zoom: 0.25 });
    const seen = new Set(freshLines());
    act(() => {
      useWorkspaceStore.getState().enterGroupFocus('g1', { pan: { x: 1, y: 1 }, zoom: 2, slot: '1' });
    });
    const afterStart = freshLines().filter((line) => !seen.has(line));
    expect(afterStart).toEqual([
      'group full screen F1 started, 2 windows kept running outside',
    ]);
    const queued = pendingAppLog().length;
    const focus = useWorkspaceStore.getState().groupFocus;
    act(() => {
      useWorkspaceStore.getState().enterGroupFocus('g1', { pan: { x: 8, y: 8 }, zoom: 2, slot: focus.slot });
    });
    expect(pendingAppLog().length).toBe(queued);
    act(() => {
      expect(useWorkspaceStore.getState().exitGroupFocus()).toBe(true);
    });
    const afterEnd = freshLines().filter((line) => !seen.has(line));
    expect(afterEnd).toContain('group full screen F1 ended, 2 windows kept running outside');
    expect(useWorkspaceStore.getState().pan).toEqual({ x: 3, y: 4 });
    expect(useWorkspaceStore.getState().zoom).toBe(0.25);
    expect(useWorkspaceStore.getState().wins.map((w) => w.id)).toEqual(['in', 'term', 'chat']);
  });
});
