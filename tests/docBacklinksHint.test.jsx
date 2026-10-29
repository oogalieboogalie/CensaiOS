/**
 * @jest-environment jsdom
 */
// A note nothing links to yet says how [[links]] work; once another note
// links to it, the hint gives way to the backlink. Made-up notes only.
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { DocWindow } from '../src/components/DocWindow.jsx';
import { canHaveBacklinks } from '../src/components/doc/BacklinksBox.jsx';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';

const HINT = /Type \[\[ and a note's name to link it\. Notes that link to this one show here\./;

function openNote(name, backlinks, { ok = true } = {}) {
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/api/files/backlinks')) return { ok, status: ok ? 200 : 404, json: async () => (ok ? { results: backlinks, capped: false } : { error: 'nope' }) };
    if (String(url).includes('/api/files/content')) return { ok: true, status: 200, json: async () => ({ content: `# ${name}\n\nTomatoes by the fence.` }) };
    return { ok: true, status: 200, json: async () => [] };
  });
  render(<DocWindow
    win={{ id: `doc-${name}`, kind: 'doc', fileName: `${name}.md`, filePath: `/notes/${name}.md`, annotations: [], showComments: true }}
    onUpdate={jest.fn()} onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1"
  />);
}

test('a note with no links shows the hint', async () => {
  openNote('Garden plan', []);
  await waitFor(() => expect(screen.getByTestId('backlinks-hint')).toHaveTextContent(HINT));
  expect(screen.queryByText('Backlinks')).not.toBeInTheDocument();
});

test('once another note links to it, the backlink replaces the hint', async () => {
  openNote('Garden plan', [{ name: 'Shopping list.md', path: '/notes/Shopping list.md' }]);
  await waitFor(() => expect(screen.getByText('Shopping list.md')).toBeInTheDocument());
  expect(screen.getByText('Backlinks')).toBeInTheDocument();
  expect(screen.queryByTestId('backlinks-hint')).not.toBeInTheDocument();
});

test('no hint when censaiOS could not look, or where links do not work', async () => {
  openNote('Garden plan', [], { ok: false });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/files/backlinks')));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.queryByTestId('backlinks-hint')).not.toBeInTheDocument();
  expect(pendingAppLog()).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'warn', message: 'backlinks not loaded', where: 'doc' })]));
  expect(canHaveBacklinks({ filePath: '/notes/Garden plan.md' })).toBe(true);
  expect(canHaveBacklinks({ filePath: 'Garden plan.md', isGithub: true })).toBe(false);
  expect(canHaveBacklinks({ filePath: '/notes/photo.png' })).toBe(false);
  expect(canHaveBacklinks({ text: 'a note with no file' })).toBe(false);
});
