// Board invites waiting for you, one Inbox line each ("Alex invited you to
// Family board"). Opening the board from the Inbox marks the invite opened.

import { registerInboxSource } from '../inbox/sources.js';

let lister = async (userId) => {
  const [{ default: pool }, { listMyInvites }] = await Promise.all([import('../db.js'), import('./store.js')]);
  return listMyInvites(pool, userId);
};
export function setInviteLister(fn) { lister = fn; }

/** One waiting invite as an Inbox report. */
export function inviteReport(invite) {
  return {
    id: invite.id,
    invite: true,
    title: `${invite.byName} invited you to ${invite.boardName}`,
    detail: 'Open the board to join them. Everyone on it sees each other live.',
    boardId: invite.workspaceId,
    by: invite.byName,
    count: 1,
    lastHour: null,
    firstSeen: invite.createdAt,
    lastSeen: invite.createdAt,
    repo: invite.boardName,
    fixable: false,
  };
}

export function registerInviteInboxSource() {
  return registerInboxSource('board-invites', {
    async list({ userId }) {
      if (!userId) return [];
      return (await lister(userId)).map(inviteReport);
    },
  });
}
