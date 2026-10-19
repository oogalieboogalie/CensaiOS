import { jest } from '@jest/globals';
import { RUNTIME_MODES } from '../server/middleware/runtimeMode.js';
import {
  authorizeTerminalConnection,
  terminalRuntimeAccess,
  terminalSessionKey,
} from '../server/terminal/access.js';

const url = workspaceId => new URL(
  `/api/terminal${workspaceId ? `?workspaceId=${workspaceId}` : ''}`,
  'http://localhost',
);

describe('terminal execution access boundary', () => {
  test('local is available, private is explicit, and cloud is always denied', () => {
    expect(terminalRuntimeAccess({ mode: RUNTIME_MODES.LOCAL_DESKTOP }).allowed).toBe(true);
    expect(terminalRuntimeAccess({ mode: RUNTIME_MODES.PRIVATE_SERVER, env: {} }).allowed).toBe(false);
    expect(terminalRuntimeAccess({
      mode: RUNTIME_MODES.PRIVATE_SERVER, env: { HOMEBASE_ALLOW_LOCAL_FILES: 'true' },
    }).allowed).toBe(true);
    expect(terminalRuntimeAccess({
      mode: RUNTIME_MODES.CLOUD_SAAS, env: { HOMEBASE_ALLOW_LOCAL_FILES: 'true' },
    }).allowed).toBe(false);
  });

  // Pretend people: 7 owns this computer (admin), 8 is a teammate.
  const fakeDb = (membership, userRole = 'admin') => ({ query: jest.fn(async (sql) => (
    sql.startsWith('SELECT role FROM users')
      ? { rows: [{ role: userRole }] }
      : { rows: membership ? [membership] : [] }
  )) });

  test('requires explicit workspace scope and an executing membership role', async () => {
    const db = fakeDb({ id: 'workspace-a', role: 'member' });
    await expect(authorizeTerminalConnection(url(), { userId: '7' }, {
      db, mode: RUNTIME_MODES.LOCAL_DESKTOP,
    })).rejects.toMatchObject({ statusCode: 400, code: 'TERMINAL_WORKSPACE_REQUIRED' });
    await expect(authorizeTerminalConnection(url('workspace-a'), { userId: '7' }, {
      db, mode: RUNTIME_MODES.LOCAL_DESKTOP,
    })).resolves.toEqual({ userId: '7', workspaceId: 'workspace-a', role: 'member' });
  });

  test.each(['viewer', null])('denies non-executing membership role %s', async (role) => {
    const db = fakeDb(role ? { id: 'workspace-a', role } : null);
    await expect(authorizeTerminalConnection(url('workspace-a'), { userId: '7' }, {
      db, mode: RUNTIME_MODES.LOCAL_DESKTOP,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("a teammate who isn't the computer's owner can't open a terminal, even as a board member", async () => {
    const db = fakeDb({ id: 'workspace-a', role: 'owner' }, 'user');
    await expect(authorizeTerminalConnection(url('workspace-a'), { userId: '8' }, {
      db, mode: RUNTIME_MODES.LOCAL_DESKTOP,
    })).rejects.toMatchObject({ statusCode: 403, code: 'TERMINAL_OWNER_ONLY' });
  });

  test('same client id is isolated by signed actor and workspace', () => {
    const base = { userId: '7', workspaceId: 'workspace-a', sessionId: 'window-1' };
    const key = terminalSessionKey(base);
    expect(terminalSessionKey(base)).toBe(key);
    expect(terminalSessionKey({ ...base, userId: '8' })).not.toBe(key);
    expect(terminalSessionKey({ ...base, workspaceId: 'workspace-b' })).not.toBe(key);
  });
});
