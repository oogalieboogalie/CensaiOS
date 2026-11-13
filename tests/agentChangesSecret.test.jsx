/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ChangesPanel } from '../src/components/agentConsole/ChangesPanel.jsx';
import { GitDiffWindow } from '../src/components/windows/gitDiff/index.jsx';
import { SECRET_CHANGES } from '../shared/files/fileProblems.js';

// A coding agent's changes as the server sends them: what changed in a file
// that holds keys is left out (server/security/secretFiles.js), so the
// Changes tab and the Git Diff Viewer say so in plain words. All made up.
const changes = {
  loaded: true,
  files: [
    { path: '.env', change: 'added', additions: 1, deletions: 0 },
    { path: 'notes.md', change: 'modified', additions: 1, deletions: 1 },
  ],
  patch: [
    'diff --git a/.env b/.env',
    SECRET_CHANGES,
    'diff --git a/notes.md b/notes.md',
    '--- a/notes.md',
    '+++ b/notes.md',
    '@@ -1 +1 @@',
    '-Made-up note',
    '+Made-up note, changed',
    '',
  ].join('\n'),
};

test('the Changes tab says a file that holds keys changed, without what changed, and shows the rest', () => {
  render(<ChangesPanel changes={changes} onOpenFile={jest.fn()} />);
  expect(screen.getByTestId('changes-secret')).toHaveTextContent(SECRET_CHANGES);
  expect(screen.getAllByText('Made-up note, changed').length).toBeGreaterThan(0);
});

test('the Git Diff Viewer says the same for that file, and shows an ordinary one line by line', async () => {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).endsWith('/changes') ? changes : { tasks: [{ id: 'made-up-task', title: 'Made-up task' }] }),
  }));
  function Harness() {
    const [win, setWin] = React.useState({ id: 'gd-secret', taskId: 'made-up-task', filePath: '.env' });
    return <GitDiffWindow win={win} onUpdate={(p) => setWin((w) => ({ ...w, ...p }))} />;
  }
  render(<Harness />);
  expect(await screen.findByTestId('gdv-secret')).toHaveTextContent(SECRET_CHANGES);
  await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /notes\.md/ })); });
  expect(screen.queryByTestId('gdv-secret')).toBeNull();
  expect(screen.getAllByText(/Made-up note, changed/).length).toBeGreaterThan(0);
});
