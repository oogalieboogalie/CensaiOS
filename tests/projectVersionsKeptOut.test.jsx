/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// The Files window's version bar names the files saved versions leave out
// (they can hold keys or passwords) and says in plain words why Send to
// GitHub sent nothing. All names are made up.
const { ProjectVersions } = await import('../src/components/files/ProjectVersions.jsx');
const { githubKeepsLine, keptOutLine, sendRefusal } = await import('../shared/files/versionWords.js');

const FOLDER = '/made/up/project';
const STATUS = {
  tracked: true, root: FOLDER, partOfBigger: false, branch: 'main',
  changes: [{ file: 'index.html', status: 'changed' }],
  keptOut: ['.env', 'certs/server.key'],
  versions: [{ id: 'abc1234', when: '1 minute ago', message: 'Made-up first version' }],
  remote: null, githubRepo: null, unsent: null,
};

/** The server's answers, by "METHOD /path": each [status, body], or a function that gives one. */
function server(answers) {
  global.fetch = jest.fn(async (url, options = {}) => {
    const answer = answers[`${options.method || 'GET'} ${String(url).split('?')[0]}`] || [404, { error: 'Made-up: not here' }];
    const [status, body] = typeof answer === 'function' ? answer() : answer;
    return { ok: status < 400, status, json: async () => body };
  });
}

afterEach(() => { cleanup(); delete global.fetch; });

test('the bar names the files saved versions leave out, apart from the changes a version saves', async () => {
  server({ 'GET /api/project-git/status': [200, STATUS] });
  render(<ProjectVersions dirPath={FOLDER} />);
  expect(await screen.findByTestId('project-versions-kept-out')).toHaveTextContent(keptOutLine(['.env', 'certs/server.key']));
  expect(screen.getByTestId('project-versions-changes')).toHaveTextContent('1 unsaved change');
  expect(screen.getByText('changed · index.html')).toBeInTheDocument();
});

test('with nothing left out the bar has no such line', async () => {
  server({ 'GET /api/project-git/status': [200, { ...STATUS, changes: [], keptOut: [] }] });
  render(<ProjectVersions dirPath={FOLDER} />);
  expect(await screen.findByTestId('project-versions-changes')).toHaveTextContent('Everything is saved');
  expect(screen.queryByTestId('project-versions-kept-out')).toBeNull();
});

test('when GitHub already has a file that holds keys, the bar names it and says to make new keys', async () => {
  const onGithub = { ...STATUS, remote: 'https://github.com/made-up/project.git', githubRepo: 'made-up/project', unsent: 0 };
  server({ 'GET /api/project-git/status': [200, { ...onGithub, githubKeeps: ['.env'] }] });
  render(<ProjectVersions dirPath={FOLDER} />);
  const line = await screen.findByTestId('project-versions-github-keeps');
  expect(line).toHaveTextContent(githubKeepsLine(['.env']));
  expect(line).toHaveTextContent("GitHub already has an earlier copy of .env, and keeps it. If it held keys or passwords, make new ones where you got them and turn the old ones off, then put the new ones in .env: censaiOS cannot take GitHub's copy back.");
  cleanup();

  server({ 'GET /api/project-git/status': [200, { ...onGithub, githubKeeps: ['.env', 'certs/server.key'] }] });
  render(<ProjectVersions dirPath={FOLDER} />);
  expect(await screen.findByTestId('project-versions-github-keeps')).toHaveTextContent("GitHub already has earlier copies of .env and certs/server.key, and keeps them. If they held keys or passwords, make new ones where you got them and turn the old ones off, then put the new ones in those files: censaiOS cannot take GitHub's copies back.");
});

test('a project GitHub has no such file for has no such line', async () => {
  server({ 'GET /api/project-git/status': [200, { ...STATUS, remote: 'https://github.com/made-up/project.git', githubRepo: 'made-up/project', unsent: 0, githubKeeps: [] }] });
  render(<ProjectVersions dirPath={FOLDER} />);
  expect(await screen.findByTestId('project-versions-kept-out')).toBeInTheDocument();
  expect(screen.queryByTestId('project-versions-github-keeps')).toBeNull();
});

test('a Send to GitHub that sent nothing says why in plain words', async () => {
  const words = sendRefusal(['.env']);
  server({ 'GET /api/project-git/status': [200, STATUS], 'POST /api/project-git/send': [409, { error: words }] });
  render(<ProjectVersions dirPath={FOLDER} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send to GitHub' }));
  fireEvent.change(screen.getByTestId('project-versions-text'), { target: { value: 'Made-up change' } });
  fireEvent.click(screen.getByTestId('project-versions-go'));
  expect(await screen.findByTestId('project-versions-error')).toHaveTextContent(words);
  expect(screen.queryByTestId('project-versions-sent')).toBeNull();
});

test('after a send that sent nothing, the bar shows the version the send saved first', async () => {
  const saved = { ...STATUS, changes: [], versions: [{ id: 'def5678', when: 'just now', message: 'Made-up change' }, ...STATUS.versions] };
  let sends = 0;
  server({
    'GET /api/project-git/status': () => [200, sends ? saved : STATUS],
    'POST /api/project-git/send': () => { sends += 1; return [409, { error: sendRefusal(['.env']) }]; },
  });
  render(<ProjectVersions dirPath={FOLDER} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send to GitHub' }));
  fireEvent.change(screen.getByTestId('project-versions-text'), { target: { value: 'Made-up change' } });
  fireEvent.click(screen.getByTestId('project-versions-go'));
  expect(await screen.findByTestId('project-versions-error')).toHaveTextContent(sendRefusal(['.env']));
  expect(screen.getByTestId('project-versions-changes')).toHaveTextContent('Everything is saved');
  expect(screen.getByTestId('project-versions-last')).toHaveTextContent('Made-up change');
});

test('an answer about one folder that comes after the window moved to another is dropped', async () => {
  const OTHER = '/made/up/other-project';
  let answerSend;
  global.fetch = jest.fn((url, options = {}) => {
    if (options.method === 'POST') {
      return new Promise((resolve) => { answerSend = () => resolve({ ok: false, status: 409, json: async () => ({ error: sendRefusal(['.env']) }) }); });
    }
    const root = decodeURIComponent(String(url).split('path=')[1]);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...STATUS, root, keptOut: root === FOLDER ? ['.env'] : [], versions: [{ id: 'abc1234', when: 'now', message: `Made-up first version of ${root}` }] }) });
  });
  const { rerender } = render(<ProjectVersions dirPath={FOLDER} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send to GitHub' }));
  fireEvent.change(screen.getByTestId('project-versions-text'), { target: { value: 'Made-up change' } });
  fireEvent.click(screen.getByTestId('project-versions-go'));
  await act(async () => {
    rerender(<ProjectVersions dirPath={OTHER} />);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  expect(screen.getByTestId('project-versions-last')).toHaveTextContent(`Made-up first version of ${OTHER}`);
  expect(screen.queryByTestId('project-versions-kept-out')).toBeNull();
  expect(screen.getByRole('button', { name: 'Send to GitHub' })).toBeEnabled();
  await act(async () => {
    answerSend();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  expect(screen.queryByTestId('project-versions-error')).toBeNull();
  expect(screen.getByTestId('project-versions-last')).toHaveTextContent(`Made-up first version of ${OTHER}`);
});

/** A status for `root`, naming its own first version, and a made-up .env only for FOLDER. */
const statusOf = (root) => ({ ...STATUS, root, keptOut: root === FOLDER ? ['.env'] : [], versions: [{ id: 'abc1234', when: 'now', message: `Made-up first version of ${root}` }] });
const answered = (root) => ({ ok: true, status: 200, json: async () => statusOf(root) });
const rootOf = (url) => decodeURIComponent(String(url).split('path=')[1]);

test("a folder's status that comes after the window moved to another is dropped", async () => {
  const OTHER = '/made/up/other-project';
  let answerFirst;
  global.fetch = jest.fn((url) => (rootOf(url) === FOLDER
    ? new Promise((resolve) => { answerFirst = () => resolve(answered(FOLDER)); })
    : Promise.resolve(answered(rootOf(url)))));
  const { rerender } = render(<ProjectVersions dirPath={FOLDER} />);
  await act(async () => {
    rerender(<ProjectVersions dirPath={OTHER} />);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  expect(screen.getByTestId('project-versions-last')).toHaveTextContent(`Made-up first version of ${OTHER}`);
  await act(async () => {
    answerFirst();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  expect(screen.getByTestId('project-versions-last')).toHaveTextContent(`Made-up first version of ${OTHER}`);
  expect(screen.queryByTestId('project-versions-kept-out')).toBeNull();
});

test('while the new folder is asked about, the bar shows nothing of the last one', async () => {
  const OTHER = '/made/up/other-project';
  global.fetch = jest.fn((url) => (rootOf(url) === OTHER ? new Promise(() => {}) : Promise.resolve(answered(FOLDER))));
  const { rerender } = render(<ProjectVersions dirPath={FOLDER} />);
  expect(await screen.findByTestId('project-versions-kept-out')).toBeInTheDocument();
  await act(async () => {
    rerender(<ProjectVersions dirPath={OTHER} />);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  expect(screen.queryByTestId('project-versions')).toBeNull();
});

test('what the bar said about one folder does not stay when the window moves to another', async () => {
  const words = sendRefusal(['.env']);
  server({ 'GET /api/project-git/status': [200, STATUS], 'POST /api/project-git/send': [409, { error: words }] });
  const { rerender } = render(<ProjectVersions dirPath={FOLDER} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send to GitHub' }));
  fireEvent.change(screen.getByTestId('project-versions-text'), { target: { value: 'Made-up change' } });
  fireEvent.click(screen.getByTestId('project-versions-go'));
  await screen.findByTestId('project-versions-error');
  await act(async () => {
    rerender(<ProjectVersions dirPath="/made/up/other-project" />);
    await new Promise((resolve) => { setTimeout(resolve, 0); }); // the other folder's status comes in
  });
  expect(global.fetch).toHaveBeenLastCalledWith(`/api/project-git/status?path=${encodeURIComponent('/made/up/other-project')}`, undefined);
  expect(screen.queryByTestId('project-versions-error')).toBeNull();
  expect(screen.queryByTestId('project-versions-text')).toBeNull();
});
