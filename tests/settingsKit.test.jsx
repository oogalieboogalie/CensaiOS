/**
 * @jest-environment jsdom
 */
// Settings is one system (src/components/theme/settingsKit.jsx): one switch,
// one way to say "Saved." or what went wrong, and one preview for every choice.
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { SettingsNote, SwitchRow, useSaveNote, useSavedNote } from '../src/components/theme/settingsKit.jsx';
import { HEADER_MODE_HINTS, WindowsSection } from '../src/components/theme/ThemeWindowsSection.jsx';
import { LookSection } from '../src/components/theme/ThemeLookSection.jsx';
import { LOOKS } from '../src/lib/theme/looks.js';

afterEach(cleanup);

test('a switch row is a real switch and hands back on or off', () => {
  const onChange = jest.fn();
  render(<SwitchRow label="Pen mode" hint="A pen draws." checked={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('switch', { name: 'Pen mode' }));
  expect(onChange).toHaveBeenCalledWith(true);
});

function SaveHarness({ work }) {
  const { note, run } = useSaveNote();
  return (
    <>
      <button type="button" onClick={() => run(work)}>Go</button>
      <SettingsNote note={note} />
    </>
  );
}

test('a save says Saved. when it works and the reason when it fails', async () => {
  const { unmount } = render(<SaveHarness work={() => Promise.resolve()} />);
  await act(async () => { fireEvent.click(screen.getByText('Go')); });
  expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  unmount();
  render(<SaveHarness work={() => Promise.reject(new Error('The server is away.'))} />);
  await act(async () => { fireEvent.click(screen.getByText('Go')); });
  expect(screen.getByRole('alert')).toHaveTextContent('The server is away.');
});

function FlagHarness({ saving, error }) {
  return <SettingsNote note={useSavedNote(saving, error)} />;
}

test('a section that saves by itself shows Saving..., then Saved.', () => {
  const view = render(<FlagHarness saving error="" />);
  expect(screen.getByText('Saving...')).toBeInTheDocument();
  view.rerender(<FlagHarness saving={false} error="" />);
  expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  view.rerender(<FlagHarness saving={false} error="No access." />);
  expect(screen.getByRole('alert')).toHaveTextContent('No access.');
});

test('every title bar style is a choice with its own picture and words', () => {
  const setShape = jest.fn();
  render(<WindowsSection theme={{ headerMode: 'strip', groupGap: 2 }} setTheme={jest.fn()} setShape={setShape} />);
  const choices = screen.getAllByRole('radio');
  expect(choices.map((c) => c.textContent)).toEqual(['Strip', 'Ghost', 'Bare', 'Edge']);
  for (const choice of choices) expect(choice.querySelectorAll('.hb-pv-win')).toHaveLength(1);
  expect(screen.getByText(HEADER_MODE_HINTS.strip)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Edge' }));
  expect(setShape).toHaveBeenCalledWith({ headerMode: 'edge' });
});

test('the group gap picture shows the gap the slider sets', () => {
  const setShape = jest.fn();
  render(<WindowsSection theme={{ groupGap: 8 }} setTheme={jest.fn()} setShape={setShape} />);
  const gapGroup = screen.getByTestId('look-group-gap');
  expect(gapGroup.querySelector('.hb-pv-group').style.gap).toBe('8px');
  fireEvent.change(gapGroup.querySelector('input[type="range"]'), { target: { value: '12' } });
  expect(setShape).toHaveBeenCalledWith({ groupGap: 12 });
});

test('each look card shows one window, not two', () => {
  render(<LookSection theme={{ mood: 'censai' }} applyLook={jest.fn()} setShape={jest.fn()} setCustomColors={jest.fn()} />);
  for (const id of Object.keys(LOOKS)) {
    expect(screen.getByTestId(`look-${id}`).querySelectorAll('.hb-pv-win')).toHaveLength(1);
  }
});
