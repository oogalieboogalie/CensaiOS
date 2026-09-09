/** @jest-environment jsdom */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const getWorkspaceMembers = jest.fn();
const inviteWorkspaceMember = jest.fn();
const getPersonalWorkspace = jest.fn();
const leaveWorkspace = jest.fn();

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { getWorkspaceMembers, inviteWorkspaceMember, getPersonalWorkspace, leaveWorkspace },
}));
jest.unstable_mockModule('../src/lib/store.js', () => ({
  useWorkspaceStore: (selector) => selector({ workspaceId: 'workspace-a' }),
}));

const { WorkspaceSharingSection } = await import('../src/components/theme/WorkspaceSharingSection.jsx');

describe('workspace sharing settings', () => {
  afterEach(cleanup);

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceMembers.mockResolvedValue({
      workspace: { id: 'workspace-a', name: 'Launch', role: 'owner' },
      members: [{ id: 7, email: 'owner@example.com', name: 'Owner', role: 'owner' }],
    });
    getPersonalWorkspace.mockResolvedValue({ workspace: { id: 'user-7-default', role: 'owner' } });
    leaveWorkspace.mockResolvedValue({ workspace: { id: 'user-7-default', role: 'owner' } });
    inviteWorkspaceMember.mockResolvedValue({
      member: { id: 8, email: 'peer@example.com', name: 'Peer', role: 'member' },
      alreadyMember: false,
    });
  });

  test('shows existing members and produces an invite receipt', async () => {
    render(<WorkspaceSharingSection />);
    expect(await screen.findByText('Owner · owner@example.com')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Registered account email'), {
      target: { value: 'peer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(inviteWorkspaceMember).toHaveBeenCalledWith(
      'workspace-a', 'peer@example.com',
    ));
    expect(await screen.findByText('peer@example.com can now open this workspace.')).toBeTruthy();
    expect(screen.getByDisplayValue(/workspace=workspace-a/)).toBeTruthy();
  });

  test('lets an invited member return to their own workspace without leaving', async () => {
    getWorkspaceMembers.mockResolvedValue({
      workspace: { id: 'workspace-a', name: 'Launch', role: 'member' },
      members: [{ id: 7, email: 'member@example.com', name: 'Member', role: 'member' }],
    });
    const navigate = jest.fn();
    render(<WorkspaceSharingSection navigate={navigate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Go to my workspace' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('user-7-default'));
    expect(screen.queryByLabelText('Registered account email')).toBeNull();
  });

  test('lets an invited member remove their access and returns them home', async () => {
    getWorkspaceMembers.mockResolvedValue({
      workspace: { id: 'workspace-a', name: 'Launch', role: 'member' }, members: [],
    });
    const navigate = jest.fn();
    const confirmBefore = globalThis.confirm;
    globalThis.confirm = jest.fn(() => true);
    render(<WorkspaceSharingSection navigate={navigate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave shared workspace' }));
    await waitFor(() => expect(leaveWorkspace).toHaveBeenCalledWith('workspace-a'));
    expect(navigate).toHaveBeenCalledWith('user-7-default');
    globalThis.confirm = confirmBefore;
  });
});
