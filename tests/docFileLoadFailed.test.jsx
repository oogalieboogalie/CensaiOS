/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { DocWindow } from '../src/components/DocWindow.jsx';
import { noteWords } from '../src/components/doc/anchorNotes.js';

const SAVED = 'Made-up plan: we meet at noon by the old mill.';
const at = SAVED.indexOf('old mill');
const note = { id: 'n1', kind: 'comment', start: at, end: at + 8, quote: 'old mill', body: 'Made-up comment', ...noteWords(SAVED, at, at + 8) };

function openFailedFile(path) {
  global.fetch = jest.fn(async (url) => (String(url).startsWith('/api/files/content')
    ? { ok: false, status: 500, json: async () => ({ error: 'made-up failure' }) }
    : { ok: true, status: 200, json: async () => [] }));
  render(<DocWindow win={{ id: 'file-doc', kind: 'doc', fileName: 'plan.md', filePath: path, annotations: [note], showComments: true }}
    onUpdate={jest.fn()} onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
}

test('a file that failed to load does not invite typing that Save could never keep', async () => {
  openFailedFile('/made/up/one.md');
  expect(await screen.findByTestId('file-load-error')).toHaveTextContent('This file could not be opened just now.');
  expect(screen.queryByText('Click anywhere to start writing')).not.toBeInTheDocument();
  fireEvent.mouseUp(document.querySelector('[data-doc-body]'));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  const edit = screen.getByRole('button', { name: 'Edit' });
  expect(edit).toBeDisabled();
  expect(edit).toHaveAttribute('title', 'Editing stays off until the file loads');
});

test('comments on a file that failed to load do not claim their words were deleted', async () => {
  openFailedFile('/made/up/two.md');
  await screen.findByTestId('file-load-error');
  expect(screen.getByText('Made-up comment')).toBeVisible();
  expect(screen.queryByText('Its words were deleted from the page.')).not.toBeInTheDocument();
});
