/**
 * @jest-environment jsdom
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { jest } from '@jest/globals';
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

test('key, scale and key lock are saved on the song', async () => {
  render(<Host id="s1" />);
  await waitFor(() => expect(studioOf()).toBeTruthy());
  expect(screen.getByLabelText('Key').value).toBe('9');
  fireEvent.change(screen.getByLabelText('Key'), { target: { value: '2' } });
  fireEvent.click(screen.getByTestId('studio-key-lock'));
  await waitFor(() => expect(studioOf()).toMatchObject({ key: 2, scale: 'minor', scaleLock: true }));
  fireEvent.doubleClick(screen.getAllByTestId('studio-clip')[0]);
  expect(screen.getByTestId('studio-pr-fit').textContent).toBe('Fit to D minor');
});

test('the model box applies effects to the selected track and Undo puts the old chain back', async () => {
  const realFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ say: 'Added a gritty delay.', fx: [{ type: 'saturation', params: { drive: 24 } }, { type: 'delay', params: { feedback: 55 } }], model: 'test-model' }) }));
  try {
    render(<Host id="s1" />);
    await waitFor(() => expect(studioOf()).toBeTruthy());
    const before = studioOf().tracks[0].fx.map(f => f.type);
    const box = screen.getByTestId('studio-assist');
    expect(within(box).getByText('Keys')).toBeTruthy();
    fireEvent.change(within(box).getByLabelText('Ask your model to change this track'), { target: { value: 'Build a gritty delay' } });
    fireEvent.click(screen.getByTestId('studio-assist-send'));
    await waitFor(() => expect(studioOf().tracks[0].fx.map(f => f.type)).toEqual([...before, 'saturation', 'delay']));
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.prompt).toBe('Build a gritty delay');
    expect(sent.context).toContain('Chosen track: "Keys"');
    expect(within(box).getByRole('status').textContent).toContain('Added Saturation, Delay');
    fireEvent.click(within(box).getByText('Undo'));
    await waitFor(() => expect(studioOf().tracks[0].fx.map(f => f.type)).toEqual(before));
  } finally { global.fetch = realFetch; }
});

test('a hummed take becomes a synth track on the grid, in the key when the lock is on', async () => {
  const { humToTrack } = await import('../src/components/windows/studio/useHumTrack.js');
  const { normalizeProject, starterProject } = await import('../src/lib/studio/project.js');
  const song = normalizeProject({ ...starterProject(), bpm: 120, snap: '1/8', scaleLock: true });
  const heard = [{ p: 57, s: 1.0, d: 0.45, v: 0.8 }, { p: 61, s: 1.52, d: 0.4, v: 0.8 }, { p: 64, s: 2.01, d: 0.9, v: 0.8 }];
  const track = humToTrack(heard, song, 8);
  expect(track).toMatchObject({ name: 'Hummed melody', synth: { preset: 'lead' } });
  expect(track.clips[0]).toMatchObject({ start: 8, len: 8 });
  expect(track.clips[0].notes.map(n => [n.p, n.t])).toEqual([[57, 0], [60, 1], [64, 2]]);
  expect(humToTrack([], song)).toBeNull();
});

test('Undo after a model bassline removes only that clip and keeps later edits', async () => {
  const realFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ notes: [{ p: 45, t: 0, d: 1 }], len: 4 }) }));
  try {
    render(<Host id="s1" />);
    await waitFor(() => expect(studioOf()).toBeTruthy());
    fireEvent.pointerDown(screen.getAllByText('Bass')[0]);
    const box = screen.getByTestId('studio-assist');
    fireEvent.change(within(box).getByLabelText('Ask your model to change this track'), { target: { value: 'bassline' } });
    fireEvent.click(screen.getByTestId('studio-assist-send'));
    await waitFor(() => expect(studioOf().tracks[1].clips).toHaveLength(2));
    const fxBefore = studioOf().tracks[1].fx.map(f => f.type);
    fireEvent.click(within(screen.getByTestId('studio-mixer')).getAllByTitle('Mute')[1]);
    await waitFor(() => expect(studioOf().tracks[1].mute).toBe(true));
    fireEvent.click(within(box).getByText('Undo'));
    await waitFor(() => expect(studioOf().tracks[1].clips).toHaveLength(1));
    expect(studioOf().tracks[1].mute).toBe(true);
    expect(studioOf().tracks[1].fx.map(f => f.type)).toEqual(fxBefore);
  } finally { global.fetch = realFetch; }
});
