import { describe, expect, test } from '@jest/globals';
import {
  actionForMessage,
  agentPrincipal,
  can,
  guestPrincipal,
  memberPrincipal,
  memberRolesFor,
  syncMode,
} from '../server/access/policy.js';
import { capabilitiesForRole, usesProjection } from '../server/shareLinks/access.js';

const link = (role, extra = {}) => ({ role, scope_kind: 'board', mode: 'link', ...extra });

describe('one policy for people, guests and agents', () => {
  test('people: owner and admin manage, members edit, viewers look', () => {
    expect(can(memberPrincipal('owner'), 'links.manage')).toBe(true);
    expect(can(memberPrincipal('member'), 'links.manage')).toBe(false);
    expect(can(memberPrincipal('member'), 'board.edit')).toBe(true);
    expect(can(memberPrincipal('viewer'), 'board.edit')).toBe(false);
    expect(can(memberPrincipal('viewer'), 'board.view')).toBe(true);
    expect(can(memberPrincipal('stranger'), 'board.view')).toBe(false);
    expect(memberRolesFor('links.manage')).toEqual(['owner', 'admin']);
    expect(memberRolesFor('comment.write')).toEqual(['owner', 'admin', 'member']);
  });

  test('guests: look, comment or edit, as the link says', () => {
    expect(can(guestPrincipal(link('view')), 'board.view')).toBe(true);
    expect(can(guestPrincipal(link('view')), 'comment.write')).toBe(false);
    expect(can(guestPrincipal(link('view')), 'board.edit')).toBe(false);
    expect(can(guestPrincipal(link('comment')), 'comment.write')).toBe(true);
    expect(can(guestPrincipal(link('comment')), 'board.edit')).toBe(false);
    expect(can(guestPrincipal(link('edit')), 'board.edit')).toBe(true);
    expect(can(guestPrincipal(link('bogus')), 'board.view')).toBe(false);
  });

  test('guests never reach the owner\'s keys, vault, memory, history or links, even on an edit link', () => {
    const editGuest = guestPrincipal(link('edit'));
    for (const action of ['owner.private', 'board.history', 'links.manage']) {
      expect(can(editGuest, action)).toBe(false);
    }
    expect(can(memberPrincipal('member'), 'owner.private')).toBe(true);
  });

  test('Go live audiences watch: no cursor, but reactions are fine', () => {
    const spectator = guestPrincipal(link('view', { mode: 'live' }));
    expect(can(spectator, 'presence.cursor')).toBe(false);
    expect(can(spectator, 'presence.react')).toBe(true);
    expect(can(guestPrincipal(link('view')), 'presence.cursor')).toBe(true);
  });

  test('an agent gets the lower of its own level and the person it acts for', () => {
    const forViewGuest = agentPrincipal(guestPrincipal(link('view')), { role: 'comment' });
    expect(can(forViewGuest, 'comment.write')).toBe(false);
    const forCommentGuest = agentPrincipal(guestPrincipal(link('comment')), { role: 'comment' });
    expect(can(forCommentGuest, 'comment.write')).toBe(true);
    expect(can(forCommentGuest, 'board.edit')).toBe(false);
    const forEditGuest = agentPrincipal(guestPrincipal(link('edit')));
    expect(can(forEditGuest, 'board.edit')).toBe(true);
    expect(can(forEditGuest, 'owner.private')).toBe(false);
    expect(can(agentPrincipal(memberPrincipal('owner')), 'owner.private')).toBe(true);
    expect(can(agentPrincipal(null), 'board.view')).toBe(false);
  });

  test('only whole-board edit guests and members get the live replica', () => {
    expect(syncMode(memberPrincipal('member'))).toBe('replica');
    expect(syncMode(memberPrincipal('viewer'))).toBe('replica-readonly');
    expect(syncMode(guestPrincipal(link('edit')))).toBe('replica');
    expect(syncMode(guestPrincipal(link('edit', { scope_kind: 'group' })))).toBe('projection');
    expect(syncMode(guestPrincipal(link('edit', { mode: 'live' })))).toBe('projection');
    expect(syncMode(guestPrincipal(link('edit', { scope_kind: undefined })))).toBe('projection');
    expect(syncMode(guestPrincipal(link('view')))).toBe('projection');
    expect(usesProjection(link('edit'))).toBe(false);
    expect(usesProjection(link('comment'))).toBe(true);
    expect(usesProjection(null)).toBe(true);
  });

  test('socket messages: presence for everyone who can look, anything else needs edit', () => {
    expect(actionForMessage('cursor.move')).toBe('presence.cursor');
    expect(actionForMessage('hand')).toBe('presence.react');
    expect(actionForMessage('window.preview')).toBe('board.edit');
    expect(actionForMessage('something-new')).toBe('board.edit');
  });

  test('share link capabilities come from the policy', () => {
    expect(capabilitiesForRole('view')).toMatchObject({ canView: true, canComment: false, canEdit: false });
    expect(capabilitiesForRole('edit')).toMatchObject({ canView: true, canComment: true, canEdit: true });
    expect(capabilitiesForRole('nope')).toMatchObject({ canView: false, canComment: false, canEdit: false });
  });
});

describe('collaboration socket asks the policy', () => {
  const socket = () => {
    const sent = [];
    return { sent, ws: { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) } };
  };
  const context = (principal, ws) => ({ ws, workspaceId: 'w1', clientId: 'c1', actor: { type: principal.kind }, principal });

  test('a viewer member can point but not drag windows', async () => {
    const { handleWorkspaceCollaborationMessage } = await import('../server/ws/workspaceCollaboration.js');
    const { sent, ws } = socket();
    handleWorkspaceCollaborationMessage({ type: 'window.preview', windowId: 'a', x: 1, y: 1 }, context(memberPrincipal('viewer'), ws));
    expect(sent.at(-1)).toMatchObject({ type: 'error', reason: 'read-only' });
    handleWorkspaceCollaborationMessage({ type: 'cursor.move', x: 1, y: 1 }, context(memberPrincipal('viewer'), ws));
    expect(sent.filter((m) => m.type === 'error')).toHaveLength(1);
  });
});
