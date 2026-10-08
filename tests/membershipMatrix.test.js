// tests/membershipMatrix.test.js
//
// Phase 0 collab pre-flight: workspace membership role matrix.
// Exercises the REAL `requireWorkspaceMember` (+ `listWorkspaceMembers`
// read path) with a mocked db pool — the helpers themselves are NOT mocked.
// Read = default roles (owner/admin/member/viewer); write = owner/admin/member
// (mirrors `workspace.state.write` + canvas tools). Stranger has no row,
// so both read and write reject with 403 (Hocuspocus upgrade reject shape).

import { jest } from '@jest/globals';
import { requireWorkspaceMember } from '../server/workspaces/context.js';
import { listWorkspaceMembers } from '../server/workspaces/members.js';

const WORKSPACE_ID = 'ws-collab-1';
const WRITE_ROLES = ['owner', 'admin', 'member'];

function makeDb(rolesByUser) {
  return {
    query: jest.fn(async (sql, params) => {
      if (String(sql).includes('JOIN users')) return { rows: [] };
      const role = rolesByUser[String(params[1])];
      if (!role) return { rows: [] };
      return { rows: [{ id: WORKSPACE_ID, name: 'Collab WS', role }] };
    }),
  };
}

async function expectAllowed(promise) {
  await expect(promise).resolves.toMatchObject({ id: WORKSPACE_ID });
}

async function expectDenied(promise) {
  const error = await promise.then(() => null, (err) => err);
  expect(error).toBeInstanceOf(Error);
  expect(error.statusCode).toBe(403);
  return error;
}

const MATRIX = [
  { role: 'owner', userId: 'u-owner', read: true, write: true },
  { role: 'admin', userId: 'u-admin', read: true, write: true },
  { role: 'member', userId: 'u-member', read: true, write: true },
  { role: 'viewer', userId: 'u-viewer', read: true, write: false },
  { role: 'stranger', userId: 'u-stranger', read: false, write: false },
];

function rolesByUserFor(role) {
  if (role === 'stranger') return {};
  return { [`u-${role}`]: role };
}

describe('requireWorkspaceMember role matrix (Hocuspocus pre-flight)', () => {
  for (const { role, userId, read, write } of MATRIX) {
    test(`${role} read ${read ? 'allowed' : 'denied with 403'}`, async () => {
      const db = makeDb(rolesByUserFor(role));
      if (read) {
        await expectAllowed(requireWorkspaceMember(db, { userId, workspaceId: WORKSPACE_ID }));
      } else {
        const err = await expectDenied(requireWorkspaceMember(db, { userId, workspaceId: WORKSPACE_ID }));
        expect(err.message).toBe('Workspace access denied');
      }
    });

    test(`${role} write ${write ? 'allowed' : 'denied with 403'}`, async () => {
      const db = makeDb(rolesByUserFor(role));
      const args = { userId, workspaceId: WORKSPACE_ID, roles: WRITE_ROLES };
      if (write) {
        const workspace = await requireWorkspaceMember(db, args);
        expect(workspace.role).toBe(role);
      } else {
        const err = await expectDenied(requireWorkspaceMember(db, args));
        expect(err.message).toMatch(/Workspace (access denied|role does not allow)/);
      }
    });
  }

  test('viewer write denial is a role error (still a member)', async () => {
    const db = makeDb({ 'u-viewer': 'viewer' });
    const err = await expectDenied(requireWorkspaceMember(db, {
      userId: 'u-viewer',
      workspaceId: WORKSPACE_ID,
      roles: WRITE_ROLES,
    }));
    expect(err.message).toBe('Workspace role does not allow this operation');
  });

  test('missing workspaceId throws before db lookup', async () => {
    const db = makeDb({ 'u-owner': 'owner' });
    await expect(requireWorkspaceMember(db, { userId: 'u-owner', workspaceId: '  ' }))
      .rejects.toThrow('workspaceId is required');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('listWorkspaceMembers read path', () => {
  test('viewer can list (read), stranger gets 403', async () => {
    await expect(listWorkspaceMembers(
      makeDb({ 'u-viewer': 'viewer' }),
      { workspaceId: WORKSPACE_ID, userId: 'u-viewer' },
    )).resolves.toMatchObject({ workspace: { id: WORKSPACE_ID } });
    const err = await expectDenied(listWorkspaceMembers(
      makeDb({}),
      { workspaceId: WORKSPACE_ID, userId: 'u-stranger' },
    ));
    expect(err.message).toBe('Workspace access denied');
  });
});
