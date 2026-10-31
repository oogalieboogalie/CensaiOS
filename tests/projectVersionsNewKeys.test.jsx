/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// The version bar's "GitHub already has" line has a "Done, I made new keys"
// button for this computer's owner: it puts the line away for the files it
// names. A teammate sees the line without it. All names are made up.
const { ProjectVersions } = await import('../src/components/files/ProjectVersions.jsx');
const { NEW_KEYS_DONE, githubKeepsLine, newKeysLine } = await import('../shared/files/versionWords.js');

const FOLDER = '/made/up/project';
const STATUS = {
  tracked: true, root: FOLDER, partOfBigger: false, branch: 'main', changes: [], keptOut: ['.env'],
  versions: [{ id: 'abc1234', when: '1 minute ago', message: 'Made-up first version' }],
  remote: 'https://github.com/made-up/project.git', githubRepo: 'made-up/project', unsent: 0,
};
const OWNER = [200, { user: { role: 'admin' } }];
const TEAMMATE = [200, { user: { role: 'user' } }];

/** The server's answers, by "METHOD /path": each [status, body], or a function that gives one; returns the calls made, with their bodies. */
function server(answers) {
  const calls = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${String(url).split('?')[0]}`;
    calls.push([key, options.body ? JSON.parse(options.body) : null]);
    const answer = answers[key] || [404, { error: 'Made-up: not here' }];
    const [status, body] = typeof answer === 'function' ? answer() : answer;
    return { ok: status < 400, status, json: async () => body };
  });
  return calls;
}

const settle = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });

afterEach(() => { cleanup(); delete global.fetch; });

test("the owner's Done puts the line away for the files it names, and the bar says what brings it back", async () => {
  let done = false;
  const calls = server({
    'GET /api/auth/session': OWNER,
    'GET /api/project-git/status': () => [200, { ...STATUS, githubKeeps: done ? [] : ['.env', 'certs/server.key'] }],
    'POST /api/project-git/new-keys': () => { done = true; return [200, { ...STATUS, githubKeeps: [] }]; },
  });
  render(<ProjectVersions dirPath={FOLDER} />);
  expect(await screen.findByTestId('project-versions-github-keeps')).toHaveTextContent(githubKeepsLine(['.env', 'certs/server.key']));
  fireEvent.click(await screen.findByRole('button', { name: NEW_KEYS_DONE }));
  expect(await screen.findByTestId('project-versions-new-keys-done')).toHaveTextContent(newKeysLine(['.env', 'certs/server.key']));
  expect(screen.getByTestId('project-versions-new-keys-done')).toHaveTextContent('Put away for .env and certs/server.key. If GitHub gets a new copy of one of them, or another file like these, the line comes back.');
  expect(screen.queryByTestId('project-versions-github-keeps')).toBeNull();
  expect(calls.filter(([key]) => key === 'POST /api/project-git/new-keys').map(([, body]) => body)).toEqual([{ path: FOLDER, names: ['.env', 'certs/server.key'] }]);
});

test('a teammate sees the line without the button', async () => {
  const calls = server({ 'GET /api/auth/session': TEAMMATE, 'GET /api/project-git/status': [200, { ...STATUS, githubKeeps: ['.env'] }] });
  render(<ProjectVersions dirPath={FOLDER} />);
  expect(await screen.findByTestId('project-versions-github-keeps')).toHaveTextContent(githubKeepsLine(['.env']));
  await settle();
  expect(calls.some(([key]) => key === 'GET /api/auth/session')).toBe(true);
  expect(screen.queryByRole('button', { name: NEW_KEYS_DONE })).toBeNull();
});

test('a Done the server refuses keeps the line and says why', async () => {
  const words = "censaiOS couldn't read what GitHub's versions hold just now. Try again in a moment.";
  server({
    'GET /api/auth/session': OWNER,
    'GET /api/project-git/status': [200, { ...STATUS, githubKeeps: ['.env'] }],
    'POST /api/project-git/new-keys': [503, { error: words }],
  });
  render(<ProjectVersions dirPath={FOLDER} />);
  fireEvent.click(await screen.findByRole('button', { name: NEW_KEYS_DONE }));
  expect(await screen.findByTestId('project-versions-error')).toHaveTextContent(words);
  expect(screen.getByTestId('project-versions-github-keeps')).toHaveTextContent(githubKeepsLine(['.env']));
  expect(screen.queryByTestId('project-versions-new-keys-done')).toBeNull();
});

test('a file GitHub got meanwhile stays named, and only the ones put away are said to be', async () => {
  server({
    'GET /api/auth/session': OWNER,
    'GET /api/project-git/status': [200, { ...STATUS, githubKeeps: ['.env'] }],
    'POST /api/project-git/new-keys': [200, { ...STATUS, githubKeeps: ['made-up-new.key'] }],
  });
  render(<ProjectVersions dirPath={FOLDER} />);
  fireEvent.click(await screen.findByRole('button', { name: NEW_KEYS_DONE }));
  expect(await screen.findByTestId('project-versions-new-keys-done')).toHaveTextContent(newKeysLine(['.env']));
  expect(screen.getByTestId('project-versions-github-keeps')).toHaveTextContent(githubKeepsLine(['made-up-new.key']));
});
