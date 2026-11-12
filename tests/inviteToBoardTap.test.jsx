/** @jest-environment jsdom */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const invitePerson = jest.fn();
jest.unstable_mockModule('../src/lib/invites/index.js', () => ({
  inviteToBoard: jest.fn(), addressForOthers: jest.fn(), inviteLink: () => '',
  knownPeople: async () => [{ id: 2, name: 'Dana' }], invitePerson,
}));
jest.unstable_mockModule('../src/lib/webOs.js', () => ({ saveOpenAnywhere: jest.fn() }));
const { InviteToBoard } = await import('../src/components/theme/InviteToBoard.jsx');

afterEach(cleanup);

test('one tap on a name invites them and says it pops up for them', async () => {
  invitePerson.mockResolvedValue({ kind: 'account', member: { id: 2, name: 'Dana' }, notified: true });
  const onMember = jest.fn();
  render(<InviteToBoard workspaceId="board-a" onMember={onMember} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Invite Dana' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Dana got the invite/));
  expect(invitePerson).toHaveBeenCalledWith('board-a', 2);
  expect(onMember).toHaveBeenCalledWith({ id: 2, name: 'Dana' });
});
