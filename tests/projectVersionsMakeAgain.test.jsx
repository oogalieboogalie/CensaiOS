/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// When Send to GitHub is refused because earlier versions hold a file that
// can hold keys, the version bar offers to make those versions again without
// it, and asks first. All names are made up.
const { ProjectVersions } = await import('../src/components/files/ProjectVersions.jsx');
const { MAKE_AGAIN, madeAgainLine, makeAgainQuestion, sendRefusal } = await import('../shared/files/versionWords.js');

const FOLDER = '/made/up/project';
const STATUS = {
  tracked: true, root: FOLDER, partOfBigger: false, branch: 'main',
  changes: [], keptOut: ['.env', 'certs/server.key'],
  versions: [{ id: 'abc1234', when: '1 minute ago', message: 'Made-up first version' }],
  remote: null, githubRepo: null, unsent: null,
};
const HELD = ['.env', 'certs/server.key'];
const REFUSED = [409, { error: sendRefusal(HELD), keptOut: HELD, versions: 2 }];

/** The server's answers, by "METHOD /path": each [status, body], or a function that gives one. */
function server(answers) {
  global.fetch = jest.fn(async (url, options = {}) => {
    const answer = answers[`${options.method || 'GET'} ${String(url).split('?')[0]}`] || [404, { error: 'Made-up: not here' }];
    const [status, body] = typeof answer === 'function' ? answer(options) : answer;
    return { ok: status < 400, status, json: async () => body };
  });
}
const posted = (path) => global.fetch.mock.calls.filter(([url, options]) => url === path && options?.method === 'POST');

async function send() {
  fireEvent.click(await screen.findByRole('button', { name: 'Send to GitHub' }));
  fireEvent.change(screen.getByTestId('project-versions-text'), { target: { value: 'Made-up change' } });
  fireEvent.click(screen.getByTestId('project-versions-go'));
  await screen.findByTestId('project-versions-error');
}

afterEach(() => { cleanup(); delete global.fetch; });

test('a send refused over files that hold keys offers to make the versions again, and asks before it does', async () => {
  server({ 'GET /api/project-git/status': [200, STATUS], 'POST /api/project-git/send': REFUSED });
  render(<ProjectVersions dirPath={FOLDER} />);
  await send();
  expect(screen.getByTestId('project-versions-error')).toHaveTextContent(sendRefusal(HELD));
  fireEvent.click(screen.getByTestId('project-versions-make-again'));
  expect(screen.getByTestId('project-versions-make-again-question')).toHaveTextContent(makeAgainQuestion(HELD, 2));
  expect(posted('/api/project-git/make-again')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(screen.queryByTestId('project-versions-make-again-question')).toBeNull();
  expect(screen.getByRole('button', { name: MAKE_AGAIN })).toBeEnabled();
  expect(posted('/api/project-git/make-again')).toHaveLength(0);
});

test('yes makes them again for this folder and says Send to GitHub can send them now', async () => {
  server({
    'GET /api/project-git/status': [200, STATUS],
    'POST /api/project-git/send': REFUSED,
    'POST /api/project-git/make-again': [200, { made: 2, files: HELD, status: STATUS }],
  });
  render(<ProjectVersions dirPath={FOLDER} />);
  await send();
  fireEvent.click(screen.getByTestId('project-versions-make-again'));
  fireEvent.click(screen.getByTestId('project-versions-make-again-yes'));
  expect(await screen.findByTestId('project-versions-made-again')).toHaveTextContent(madeAgainLine(HELD, 2));
  expect(JSON.parse(posted('/api/project-git/make-again')[0][1].body)).toEqual({ path: FOLDER });
  expect(screen.queryByTestId('project-versions-error')).toBeNull();
  expect(screen.queryByTestId('project-versions-make-again')).toBeNull();
  expect(screen.queryByTestId('project-versions-make-again-question')).toBeNull();
});

test('the question also names the files the versions GitHub has hold, which GitHub keeps, and the ones merging takes out of its main branch', async () => {
  const refusal = { error: sendRefusal(['.env']), keptOut: ['.env'], githubHas: ['.env', 'server.crt', 'feature.pem'], onMain: ['.env', 'server.crt'], versions: 1 };
  server({ 'GET /api/project-git/status': [200, STATUS], 'POST /api/project-git/send': [409, refusal] });
  render(<ProjectVersions dirPath={FOLDER} />);
  await send();
  fireEvent.click(screen.getByTestId('project-versions-make-again'));
  const question = screen.getByTestId('project-versions-make-again-question');
  expect(question).toHaveTextContent(makeAgainQuestion(refusal.keptOut, 1, refusal.githubHas, refusal.onMain));
  expect(question).toHaveTextContent('without .env, server.crt and feature.pem?');
  expect(question).toHaveTextContent('GitHub keeps the copies its own versions already hold, and merging the next pull request takes .env and server.crt out of its main branch.');
});

test("a refusal that comes in after the window moved to another folder offers nothing there, so that folder's versions are never made again", async () => {
  const OTHER = '/made/up/other-project';
  let refused = false;
  let answerStatus;
  global.fetch = jest.fn(async (url, options = {}) => {
    const answer = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (options.method === 'POST' && url === '/api/project-git/send') {
      refused = true;
      return answer(...REFUSED);
    }
    if (options.method === 'POST') return answer(200, { made: 2, files: HELD, status: STATUS });
    const root = decodeURIComponent(String(url).split('path=')[1]);
    // The status the refused send asks for comes only after the window has moved on.
    if (root === FOLDER && refused) await new Promise((resolve) => { answerStatus = resolve; });
    return answer(200, { ...STATUS, root });
  });
  const { rerender } = render(<ProjectVersions dirPath={FOLDER} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send to GitHub' }));
  fireEvent.change(screen.getByTestId('project-versions-text'), { target: { value: 'Made-up change' } });
  fireEvent.click(screen.getByTestId('project-versions-go'));
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  await act(async () => {
    rerender(<ProjectVersions dirPath={OTHER} />);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  await act(async () => {
    answerStatus();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  expect(await screen.findByTestId('project-versions')).toBeInTheDocument();
  expect(screen.queryByTestId('project-versions-error')).toBeNull();
  expect(screen.queryByTestId('project-versions-make-again')).toBeNull();
  expect(posted('/api/project-git/make-again')).toHaveLength(0);
});

test('a send refused for any other reason offers nothing to make again', async () => {
  server({ 'GET /api/project-git/status': [200, STATUS], 'POST /api/project-git/send': [401, { error: 'Made-up: connect GitHub first.' }] });
  render(<ProjectVersions dirPath={FOLDER} />);
  await send();
  expect(screen.getByTestId('project-versions-error')).toHaveTextContent('Made-up: connect GitHub first.');
  expect(screen.queryByTestId('project-versions-make-again')).toBeNull();
});

test('when making them again stops, the bar says why and the offer stays to try again', async () => {
  const meanwhile = 'A version was saved meanwhile, so nothing was made again. Try again.';
  server({
    'GET /api/project-git/status': [200, STATUS],
    'POST /api/project-git/send': REFUSED,
    'POST /api/project-git/make-again': [409, { error: meanwhile }],
  });
  render(<ProjectVersions dirPath={FOLDER} />);
  await send();
  fireEvent.click(screen.getByTestId('project-versions-make-again'));
  fireEvent.click(screen.getByTestId('project-versions-make-again-yes'));
  expect(await screen.findByText(meanwhile)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: MAKE_AGAIN })).toBeEnabled();
  expect(screen.queryByTestId('project-versions-made-again')).toBeNull();
});

test('a new send takes the old offer away', async () => {
  let sends = 0;
  server({
    'GET /api/project-git/status': [200, STATUS],
    'POST /api/project-git/send': () => { sends += 1; return sends === 1 ? REFUSED : [200, { kind: 'created', repo: 'made-up/project', url: 'https://github.example.invalid/made-up/project' }]; },
  });
  render(<ProjectVersions dirPath={FOLDER} />);
  await send();
  expect(screen.getByTestId('project-versions-make-again')).toBeInTheDocument();
  // The send form stays open after a refusal.
  fireEvent.change(screen.getByTestId('project-versions-text'), { target: { value: 'Made-up change' } });
  fireEvent.click(screen.getByTestId('project-versions-go'));
  expect(await screen.findByTestId('project-versions-sent')).toHaveTextContent('made-up/project');
  expect(screen.queryByTestId('project-versions-make-again')).toBeNull();
});
