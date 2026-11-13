/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import { jest } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FolderPicker } from '../src/components/windows/FolderPicker.jsx';

// The "Mount to" picker on a teammate's screen: the server offers them only
// the projects open on the board (tests/filesFoldersPicker.test.js), and the
// picker says so. All folders are made up.
const PROJECT = { name: 'garden-plan', path: '/made-up/garden-plan', mountPath: '/made-up/garden-plan' };
const REFUSAL = "Only this computer's owner can look in that folder.";
const listing = (place, extra = {}) => ({ path: place.path, mountPath: place.mountPath, name: place.name, parent: null, folders: [], ...extra });

let asked;
function serve(answer) {
  asked = [];
  global.fetch = jest.fn(async (url) => {
    const folder = new URL(url, 'http://made-up.invalid').searchParams.get('path') || '';
    asked.push(folder);
    const [status, body] = answer(folder);
    return { ok: status < 400, status, json: async () => body };
  });
}

const picker = () => screen.getByRole('dialog', { name: 'Mount to a folder' });
const foot = () => picker().querySelector('.hb-folder-picker-foot');
const footNote = () => foot().querySelector('.hb-folder-picker-note');

test('a teammate is shown only the projects open on the board, and told so', async () => {
  const about = { places: [PROJECT], openProjectsOnly: true };
  let answer;
  const answered = new Promise((resolve) => { answer = resolve; });
  serve((folder) => [200, folder ? { ...about, ...listing(PROJECT) } : about]);
  const served = global.fetch;
  global.fetch = jest.fn(async (url) => { await answered; return served(url); });
  render(<FolderPicker onClose={jest.fn()} onPick={jest.fn()} />);
  // Until the server says what it offers, the note says nothing (never the owner's words).
  expect(footNote()).toBeEmptyDOMElement();
  answer();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mount here' })).toBeEnabled());
  expect(picker()).toHaveTextContent(PROJECT.mountPath);
  expect(foot()).toHaveTextContent('Only projects open on this board are shown.');
  expect(foot()).not.toHaveTextContent('Only folders censaiOS can reach');
});

test("a window in a folder the teammate may not use opens the picker on an open project instead", async () => {
  const about = { places: [PROJECT], openProjectsOnly: true };
  serve((folder) => (folder === PROJECT.path
    ? [200, { ...about, ...listing(PROJECT) }]
    : [403, { error: REFUSAL, reason: 'owner-only', code: 'computer_owner_only', ...about }]));
  render(<FolderPicker startPath="/made-up/owners-folder" onClose={jest.fn()} onPick={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mount here' })).toBeEnabled());
  expect(asked).toEqual(['/made-up/owners-folder', PROJECT.path]);
  expect(picker()).toHaveTextContent(PROJECT.mountPath);
  expect(picker()).not.toHaveTextContent(REFUSAL);
  expect(foot()).toHaveTextContent('Only projects open on this board are shown.');
});

test('with no project open, a teammate is told so in plain words', async () => {
  const about = { places: [], openProjectsOnly: true };
  serve((folder) => (folder ? [403, { error: REFUSAL, reason: 'owner-only', code: 'computer_owner_only', ...about }] : [200, about]));
  const { unmount } = render(<FolderPicker onClose={jest.fn()} onPick={jest.fn()} />);
  await waitFor(() => expect(picker()).toHaveTextContent('No open projects to show.'));
  expect(screen.getByRole('button', { name: 'Mount here' })).toBeDisabled();
  unmount();

  // Opened from a window in a folder that is the owner's: the refusal, and the same note below it.
  render(<FolderPicker startPath="/made-up/owners-folder" onClose={jest.fn()} onPick={jest.fn()} />);
  await waitFor(() => expect(picker()).toHaveTextContent(REFUSAL));
  expect(foot()).toHaveTextContent('Only projects open on this board are shown.');
  expect(screen.getByRole('button', { name: 'Mount here' })).toBeDisabled();
});

test('a listing that fails without saying what is offered keeps the places and the note', async () => {
  const about = { places: [PROJECT], openProjectsOnly: true };
  let calls = 0;
  serve((folder) => {
    calls += 1;
    if (!folder) return [200, about];
    // The second look in the project fails the way a dropped connection or an old server does.
    return calls > 2 ? [500, { error: 'censaiOS couldn\'t list that folder right now.' }] : [200, { ...about, ...listing(PROJECT) }];
  });
  render(<FolderPicker onClose={jest.fn()} onPick={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mount here' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: PROJECT.name }));
  await waitFor(() => expect(picker()).toHaveTextContent("censaiOS couldn't list that folder right now."));
  expect(screen.getByRole('button', { name: PROJECT.name })).toBeInTheDocument();
  expect(foot()).toHaveTextContent('Only projects open on this board are shown.');
});

test("the owner's picker keeps its own note", async () => {
  const places = [PROJECT, { name: 'Projects folder', path: '/made-up', mountPath: '/made-up' }];
  serve((folder) => [200, folder ? { places, ...listing(PROJECT) } : { places }]);
  render(<FolderPicker onClose={jest.fn()} onPick={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mount here' })).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Projects folder' })).toBeInTheDocument();
  expect(foot()).toHaveTextContent('Only folders censaiOS can reach are shown.');
});
