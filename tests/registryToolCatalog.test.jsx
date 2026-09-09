/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ToolCatalogTab } from '../src/components/registry/ToolCatalogTab.jsx';

const result = (agentId, label = 'Recall') => ({
  agentId,
  tools: [
    { name: 'recall', label, description: 'Recall workspace memory.', category: 'Memory', risk: 'read', mode: 'autonomous', source: 'intrinsic', status: 'active', module: null, approvalRequired: false },
    { name: 'project_write', label: 'Project Write', description: 'Propose a project write.', category: 'Project', risk: 'write', mode: 'execute_with_approval', source: 'module', status: 'attachable', module: { id: 'project-writer', name: 'Project Writer' }, approvalRequired: true },
  ],
  modules: [],
  counts: { active: 1, attachable: 1, equippedModules: 0 },
});

test('shows exact active, attachable, and approval state and switches agents', async () => {
  const client = { listTools: jest.fn(async agentId => result(agentId)) };
  render(<ToolCatalogTab client={client} />);
  await waitFor(() => expect(screen.getByTestId('tool-registry-counts')).toHaveTextContent('1 active'));
  expect(screen.getAllByTestId('tool-registry-row')).toHaveLength(2);
  expect(screen.getByText('owner approval')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('tool-registry-agent'), { target: { value: 'censai' } });
  await waitFor(() => expect(client.listTools).toHaveBeenLastCalledWith('censai'));
  fireEvent.change(screen.getByTestId('tool-registry-search'), { target: { value: 'no match' } });
  expect(screen.getByTestId('tool-registry-empty')).toBeInTheDocument();
});

test('rejects a stale agent response and keeps the newest result', async () => {
  const pending = {};
  const client = { listTools: jest.fn(agentId => new Promise(resolve => { pending[agentId] = resolve; })) };
  render(<ToolCatalogTab client={client} />);
  fireEvent.change(screen.getByTestId('tool-registry-agent'), { target: { value: 'censai' } });
  pending.censai(result('censai', 'Censai Recall'));
  await waitFor(() => expect(screen.getByText('Censai Recall')).toBeInTheDocument());
  pending.architect(result('architect', 'Stale Architect Recall'));
  await Promise.resolve();
  expect(screen.queryByText('Stale Architect Recall')).toBeNull();
});

test('rejects a stale workspace client response', async () => {
  let resolveOld;
  const oldClient = { listTools: jest.fn(() => new Promise(resolve => { resolveOld = resolve; })) };
  const newClient = { listTools: jest.fn(async () => result('architect', 'New Workspace Recall')) };
  const view = render(<ToolCatalogTab client={oldClient} />);
  view.rerender(<ToolCatalogTab client={newClient} />);
  await waitFor(() => expect(screen.getByText('New Workspace Recall')).toBeInTheDocument());
  resolveOld(result('architect', 'Stale Workspace Recall'));
  await Promise.resolve();
  expect(screen.queryByText('Stale Workspace Recall')).toBeNull();
});

test('shows a safe failure state', async () => {
  const client = { listTools: jest.fn(async () => { throw new Error('temporarily unavailable'); }) };
  render(<ToolCatalogTab client={client} />);
  await waitFor(() => expect(screen.getByTestId('tool-registry-error')).toHaveTextContent('temporarily unavailable'));
  expect(screen.queryByTestId('tool-registry-row')).toBeNull();
});
