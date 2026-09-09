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

  test('requires explicit workspace scope and an executing membership role', async () => {
    const db = { query: jest.fn(async () => ({ rows: [{ id: 'workspace-a', role: 'member' }] })) };
    await expect(authorizeTerminalConnection(url(), { userId: '7' }, {
      db, mode: RUNTIME_MODES.LOCAL_DESKTOP,
    })).rejects.toMatchObject({ statusCode: 400, code: 'TERMINAL_WORKSPACE_REQUIRED' });
    await expect(authorizeTerminalConnection(url('workspace-a'), { userId: '7' }, {
      db, mode: RUNTIME_MODES.LOCAL_DESKTOP,
    })).resolves.toEqual({ userId: '7', workspaceId: 'workspace-a', role: 'member' });
  });

  test.each(['viewer', null])('denies non-executing membership role %s', async (role) => {
    const db = { query: jest.fn(async () => ({
      rows: role ? [{ id: 'workspace-a', role }] : [],
    })) };
    await expect(authorizeTerminalConnection(url('workspace-a'), { userId: '7' }, {
      db, mode: RUNTIME_MODES.LOCAL_DESKTOP,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('same client id is isolated by signed actor and workspace', () => {
    const base = { userId: '7', workspaceId: 'workspace-a', sessionId: 'window-1' };
    const key = terminalSessionKey(base);
    expect(terminalSessionKey(base)).toBe(key);
    expect(terminalSessionKey({ ...base, userId: '8' })).not.toBe(key);
    expect(terminalSessionKey({ ...base, workspaceId: 'workspace-b' })).not.toBe(key);
  });
});
