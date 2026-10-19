/** @jest-environment jsdom */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const getWorkspaceMembers = jest.fn();
const inviteWorkspaceMember = jest.fn();
const getPersonalWorkspace = jest.fn();
const leaveWorkspace = jest.fn();

const listShareLinks = jest.fn();
const inviteToBoard = jest.fn();
const addressForOthers = jest.fn();

jest.unstable_mockModule('../src/lib/invites/index.js', () => ({
  inviteToBoard,
  addressForOthers,
  inviteLink: (address, code) => `${address}/?invite=${code}`,
}));

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { getWorkspaceMembers, inviteWorkspaceMember, getPersonalWorkspace, leaveWorkspace, listShareLinks },
}));
jest.unstable_mockModule('../src/lib/store.js', () => ({
  useWorkspaceStore: (selector) => selector({ workspaceId: 'workspace-a', wins: [], canvasGroups: [] }),
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
    listShareLinks.mockResolvedValue({ links: [], spectators: 0 });
    getPersonalWorkspace.mockResolvedValue({ workspace: { id: 'user-7-default', role: 'owner' } });
    leaveWorkspace.mockResolvedValue({ workspace: { id: 'user-7-default', role: 'owner' } });
    inviteToBoard.mockResolvedValue({
      kind: 'account',
      member: { id: 8, email: 'peer@example.com', name: 'Peer' },
      alreadyMember: false,
      notified: true,
    });
    addressForOthers.mockResolvedValue({ address: 'http://192.168.1.50:3004', doorClosed: false });
  });

  test('shows existing members and produces an invite receipt', async () => {
    render(<WorkspaceSharingSection />);
    expect(await screen.findByText('Owner · owner@example.com')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Their email, if they have an account here'), {
      target: { value: 'peer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(inviteToBoard).toHaveBeenCalledWith(
      'workspace-a', 'peer@example.com',
    ));
    expect(await screen.findByText('Peer can open this board now. The invite is in their Inbox.')).toBeTruthy();
    expect(screen.getByText('Peer · peer@example.com')).toBeTruthy();
    // Owners get the guest-link manager instead of a raw workspace address.
    expect(screen.getByTestId('guest-link-manager')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go live' })).toBeTruthy();
  });

  test('with no email, makes a one-time join link at the address other devices use', async () => {
    inviteToBoard.mockResolvedValue({ kind: 'link', code: 'c'.repeat(32), expiresAt: '2026-10-25T00:00:00.000Z' });
    render(<WorkspaceSharingSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Make a link' }));
    await waitFor(() => expect(inviteToBoard).toHaveBeenCalledWith('workspace-a', ''));
    expect((await screen.findByLabelText('Join link')).value).toBe(`http://192.168.1.50:3004/?invite=${'c'.repeat(32)}`);
    expect(screen.getByText(/It works once, for 7 days/)).toBeTruthy();
    expect(screen.queryByText(/Turn on Settings, Open anywhere/)).toBeNull();
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
    expect(screen.queryByLabelText('Their email, if they have an account here')).toBeNull();
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
