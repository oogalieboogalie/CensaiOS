/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const api = { getToolApprovals: jest.fn(), decideToolApproval: jest.fn() };
jest.unstable_mockModule('../src/lib/api.js', () => ({ api }));
const { useApprovalInbox } = await import('../src/components/approvals/useApprovalInbox.js');
const { useWorkspaceStore } = await import('../src/lib/store.js');
const originalWorkspaceId = useWorkspaceStore.getState().workspaceId;

function Harness() {
  const inbox = useApprovalInbox();
  const first = inbox.approvals[0];
  return <>
    <div data-testid="ready">{String(inbox.ready)}</div>
    <div data-testid="items">{inbox.approvals.map(item => item.tool_name).join(',')}</div>
    <div data-testid="error">{inbox.error}</div>
    {first && <button type="button" onClick={() => inbox.decide(first, 'approve')}>Approve</button>}
  </>;
}

beforeEach(() => {
  jest.clearAllMocks();
  api.getToolApprovals.mockResolvedValue({ approvals: [], canDecide: true });
  api.decideToolApproval.mockResolvedValue({ ok: true });
  act(() => useWorkspaceStore.setState({ workspaceId: null }));
});
afterEach(() => cleanup());
afterAll(() => act(() => useWorkspaceStore.setState({ workspaceId: originalWorkspaceId })));

test('locks without a workspace', async () => {
  render(<Harness />);
  expect(await screen.findByText('Open a workspace to review agent actions.')).toBeInTheDocument();
  expect(api.getToolApprovals).not.toHaveBeenCalled();
});

test('rejects a stale response from the previous workspace', async () => {
  let releaseFirst;
  api.getToolApprovals.mockImplementation(workspaceId => workspaceId === 'workspace-1'
    ? new Promise(resolve => { releaseFirst = resolve; })
    : Promise.resolve({ canDecide: true, approvals: [{ id: 'b', tool_name: 'project_edit', revision: 0 }] }));
  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-1' }));
  render(<Harness />);
  await waitFor(() => expect(releaseFirst).toEqual(expect.any(Function)));
  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-2' }));
  await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('project_edit'));
  await act(async () => releaseFirst({ canDecide: true,
    approvals: [{ id: 'a', tool_name: 'project_write', revision: 0 }] }));
  expect(screen.getByTestId('items')).toHaveTextContent('project_edit');
  expect(screen.getByTestId('items')).not.toHaveTextContent('project_write');
});

test('waits for the server before refreshing visual state and keeps failures visible', async () => {
  const pending = { id: 'a', tool_name: 'project_write', revision: 2 };
  api.getToolApprovals.mockResolvedValue({ canDecide: true, approvals: [pending] });
  let rejectDecision;
  api.decideToolApproval.mockImplementation(() => new Promise((_resolve, reject) => { rejectDecision = reject; }));
  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-1' }));
  render(<Harness />);
  await screen.findByRole('button', { name: 'Approve' });
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(screen.getByTestId('items')).toHaveTextContent('project_write');
  await act(async () => rejectDecision(new Error('stale revision')));
  await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('stale revision'));
  expect(screen.getByTestId('items')).toHaveTextContent('project_write');
});
