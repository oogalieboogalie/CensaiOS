/**
 * @jest-environment jsdom
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useWorkspaceStore } from '../src/lib/store.js';
// eslint-disable-next-line no-unused-vars
import { HumBeatWindow } from '../src/components/windows/humBeat/index.jsx';

// eslint-disable-next-line no-unused-vars
function Host({ id }) {
  const win = useWorkspaceStore((state) => state.wins.find((w) => w.id === id));
  const onUpdate = (patch) => useWorkspaceStore.getState().onUpdate(id, patch);
  return win ? <HumBeatWindow win={win} onUpdate={onUpdate} /> : null;
}

const humOf = () => useWorkspaceStore.getState().wins.find((w) => w.id === 'h1').hum;

beforeEach(() => {
  useWorkspaceStore.setState({ workspaceId: 'ws1', wins: [{ id: 'h1', kind: 'humBeat', x: 0, y: 0, w: 900, h: 620 }], links: [] });
});

test('a new window explains itself and offers an example instead of an empty roll', () => {
  render(<Host id="h1" />);
  expect(screen.getByText(/writes down each note you hummed/)).toBeTruthy();
  expect(screen.queryByTestId('hum-notes')).toBeNull();
  expect(screen.getByTestId('hum-play').disabled).toBe(true);
});

test('the example hum shows its notes by name and is saved on the window for teammates', async () => {
  render(<Host id="h1" />);
  fireEvent.click(screen.getByTestId('hum-example'));
  await waitFor(() => expect(screen.getByTestId('hum-notes')).toBeTruthy());
  expect(humOf().heard.length).toBeGreaterThan(12);
  expect(screen.getAllByText('A4').length).toBeGreaterThan(2);
  expect(screen.getByTestId('hum-play').disabled).toBe(false);
});

test('picking a beat style changes the shared settings and its tempo', async () => {
  render(<Host id="h1" />);
  fireEvent.click(screen.getByTestId('hum-example'));
  fireEvent.click(screen.getByTestId('hum-beat-trap'));
  await waitFor(() => expect(humOf().settings).toMatchObject({ style: 'trap', bpm: 140 }));
  fireEvent.click(screen.getByTestId('hum-bass'));
  await waitFor(() => expect(humOf().settings.bass).toBe(false));
  fireEvent.change(screen.getByTestId('hum-instrument'), { target: { value: 'pluck' } });
  await waitFor(() => expect(humOf().settings.instrument).toBe('pluck'));
});

test('Open in Studio puts the same song in a new Studio window next to it', async () => {
  render(<Host id="h1" />);
  fireEvent.click(screen.getByTestId('hum-example'));
  fireEvent.click(await screen.findByText('Open in Studio'));
  const studio = useWorkspaceStore.getState().wins.find(w => w.kind === 'studio');
  expect(studio).toBeTruthy();
  expect(studio.studio.tracks.map(t => t.name)).toEqual(['Melody', 'Drums', 'Bass']);
  expect(studio.x).toBeGreaterThan(900);
});
