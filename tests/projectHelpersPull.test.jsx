/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectHelpersPull } from '../src/components/windows/agentDesigner/ProjectHelpersPull.jsx';

afterEach(cleanup);

const helper = (name, file) => ({ name, sourceFile: file, description: `Helper for Pat`, platform: 'claude', instructions: 'x', carried: [], notCarried: [] });

test('lists the project helpers, imports only the ticked ones, and reports them', async () => {
  const calls = [];
  global.fetch = jest.fn(async (url, opts) => {
    calls.push([url, JSON.parse(opts.body || '{}')]);
    if (url === '/api/agent-import/project') {
      return { ok: true, json: async () => ({ folder: 'D:\\Demo\\.claude\\agents', agents: [helper('code-reviewer', 'code-reviewer.md'), helper('notes-writer', 'notes-writer.md')], skipped: [{ file: 'broken.md', why: 'no header' }], capped: false }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const importAgent = jest.fn(async () => true);
  render(<ProjectHelpersPull importAgent={importAgent} />);
  fireEvent.click(screen.getByTestId('import-claude-project'));
  await screen.findByText('code-reviewer');
  expect(screen.getByTestId('project-pull-summary')).toHaveTextContent('Found 2 helpers');
  expect(screen.getByText(/Skipped broken\.md/)).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Import notes-writer'));
  fireEvent.click(screen.getByTestId('project-pull-import'));
  await waitFor(() => expect(importAgent).toHaveBeenCalledTimes(1));
  expect(importAgent.mock.calls[0][0].name).toBe('code-reviewer');
  await screen.findByText(/imported, opened in its own chat/);
  await waitFor(() => expect(calls.at(-1)).toEqual(['/api/agent-import/project/imported', { names: ['code-reviewer'] }]));
});

test('the owner-only refusal is shown in plain words', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Only this computer's owner can do this." }) }));
  render(<ProjectHelpersPull importAgent={jest.fn()} />);
  fireEvent.click(screen.getByTestId('import-claude-project'));
  expect(await screen.findByRole('alert')).toHaveTextContent("Only this computer's owner can do this.");
});
