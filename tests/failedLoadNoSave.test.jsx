/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const logToApp = jest.fn();
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logFailure: () => {},
  logToApp,
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const { CodeEditorWindow } = await import('../src/components/CodeEditorWindow.jsx');
const { DocWindow } = await import('../src/components/DocWindow.jsx');

const SECRET = 'SECRET_FILE_BODY';

function failedLoadFetch() {
  return jest.fn(async (url, options) => {
    if (options?.method === 'PUT') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    const target = String(url);
    if (target.includes('/api/files/content') || target.includes('/api/github/file')) {
      return { ok: false, status: 503, json: async () => ({ error: SECRET, content: SECRET }) };
    }
    if (target.includes('/api/files/backlinks')) {
      return { ok: true, status: 200, json: async () => ({ results: [], capped: false }) };
    }
    return { ok: true, status: 200, json: async () => [] };
  });
}

function expectLoadWarning(kind) {
  expect(logToApp).toHaveBeenCalledWith(
    'warn',
    `${kind}: file failed to load (status 503)`,
    expect.objectContaining({ where: kind }),
  );
  for (const call of logToApp.mock.calls) {
    expect(JSON.stringify(call)).not.toContain(SECRET);
  }
}

function expectNoPut(fetchMock) {
  expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PUT')).toEqual([]);
}

beforeEach(() => {
  logToApp.mockClear();
});

test('a code editor that fails to load shows the error and will not save it', async () => {
  const fetchMock = failedLoadFetch();
  global.fetch = fetchMock;
  render(React.createElement(CodeEditorWindow, {
    win: {
      id: 'code-failed',
      fileName: 'notes.txt',
      filePath: 'D:\\Repos\\notes.txt',
      language: 'plaintext',
      code: 'KEEP_THIS',
    },
    onUpdate: jest.fn(),
  }));

  expect(await screen.findByRole('alert')).toHaveTextContent('This file could not be opened just now.');
  expect(screen.getByDisplayValue('KEEP_THIS')).toBeInTheDocument();
  expect(screen.queryByDisplayValue(/could not be opened/)).not.toBeInTheDocument();

  const save = screen.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();
  fireEvent.click(save);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 's', ctrlKey: true });

  await waitFor(() => expectLoadWarning('code_editor'));
  expectNoPut(fetchMock);
});

function renderFailedDoc(id, extra = {}) {
  render(React.createElement(DocWindow, {
    win: {
      id,
      kind: 'doc',
      fileName: 'notes.md',
      filePath: `/notes/${id}.md`,
      annotations: [],
      ...extra,
    },
    onUpdate: jest.fn(),
    onSpawn: jest.fn(),
    onSelect: jest.fn(),
    wins: [],
    onAssign: jest.fn(),
    workspaceId: 'workspace-1',
  }));
}

async function expectSaveStaysOff(fetchMock) {
  const save = screen.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();
  fireEvent.click(save);
  await waitFor(() => expectLoadWarning('doc'));
  expectNoPut(fetchMock);
}

test('a document that fails to load shows the error and will not edit or save it', async () => {
  const fetchMock = failedLoadFetch();
  global.fetch = fetchMock;
  renderFailedDoc('doc-failed');

  expect(await screen.findByRole('alert')).toHaveTextContent('This file could not be opened just now.');
  const edit = screen.getByRole('button', { name: 'Edit' });
  expect(edit).toBeDisabled();
  fireEvent.click(edit);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain(SECRET);

  await expectSaveStaysOff(fetchMock);
});

test('a document already open for editing keeps the error out of its editor and takes no typing', async () => {
  const fetchMock = failedLoadFetch();
  global.fetch = fetchMock;
  renderFailedDoc('doc-failed-editing', { isEditing: true });

  expect(await screen.findByRole('alert')).toHaveTextContent('This file could not be opened just now.');
  const box = screen.getByRole('textbox');
  expect(box.value).toBe('');
  expect(box.value).not.toContain(SECRET);
  expect(box).toHaveAttribute('readonly');

  await expectSaveStaysOff(fetchMock);
});
