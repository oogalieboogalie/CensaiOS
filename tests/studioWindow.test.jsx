/**
 * @jest-environment jsdom
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { useWorkspaceStore } from '../src/lib/store.js';
// eslint-disable-next-line no-unused-vars
import { StudioWindow } from '../src/components/windows/studio/index.jsx';

// eslint-disable-next-line no-unused-vars
function Host({ id }) {
  const win = useWorkspaceStore((state) => state.wins.find((w) => w.id === id));
  // A fresh onUpdate every render, exactly like the canvas.
  const onUpdate = (patch) => useWorkspaceStore.getState().onUpdate(id, patch);
  return win ? <StudioWindow win={win} onUpdate={onUpdate} /> : null;
}

const studioOf = () => useWorkspaceStore.getState().wins.find((w) => w.id === 's1').studio;

beforeEach(() => {
  useWorkspaceStore.setState({ workspaceId: 'ws1', wins: [{ id: 's1', kind: 'studio', x: 0, y: 0, w: 1120, h: 700 }], links: [] });
});

test('a new Studio saves its demo song to the window record so teammates get the same song', async () => {
  render(<Host id="s1" />);
  await waitFor(() => expect(studioOf()?.tracks?.length).toBe(3));
  expect(studioOf().tracks.map(t => t.name)).toEqual(['Keys', 'Bass', 'Vocals']);
  expect(screen.getAllByTestId('studio-clip')).toHaveLength(2);
});

test('edits are saved to the board, and other board changes mid-edit do not loop', async () => {
  render(<Host id="s1" />);
  await waitFor(() => expect(studioOf()).toBeTruthy());
  const mixer = screen.getByTestId('studio-mixer');
  fireEvent.click(within(mixer).getAllByTitle('Mute')[0]);
  // Something else on the board changes before the edit is saved (this used to loop forever).
  act(() => { useWorkspaceStore.getState().onUpdate('s1', { x: 40 }); });
  await waitFor(() => expect(studioOf().tracks[0].mute).toBe(true));
  expect(screen.getByTestId('studio')).toBeTruthy();
});

test('effects can be added from the effects tab and show on the mixer strip', async () => {
  render(<Host id="s1" />);
  await waitFor(() => expect(studioOf()).toBeTruthy());
  fireEvent.click(screen.getByTestId('studio-tab-fx'));
  fireEvent.change(screen.getByTestId('studio-add-fx'), { target: { value: 'delay' } });
  await waitFor(() => expect(studioOf().tracks[0].fx.map(f => f.type)).toContain('delay'));
  fireEvent.click(screen.getByTestId('studio-tab-mixer'));
  expect(within(screen.getAllByTestId('studio-strip')[0]).getByText('Delay')).toBeTruthy();
});

test('double-clicking a synth clip opens its notes in the piano roll', async () => {
  render(<Host id="s1" />);
  await waitFor(() => expect(studioOf()).toBeTruthy());
  fireEvent.doubleClick(screen.getAllByTestId('studio-clip')[0]);
  expect(screen.getByTestId('studio-piano-roll').textContent).toContain('12 notes');
});
