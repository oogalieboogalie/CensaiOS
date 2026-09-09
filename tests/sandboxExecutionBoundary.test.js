import { jest } from '@jest/globals';
import { ROUTE_MOUNTS, sandboxLocalFilesystem } from '../server/boot/routeMap.js';
import { requireLocalFilesystem } from '../server/middleware/runtimeMode.js';
import { assertSystemAdmin } from '../server/security/systemAdmin.js';
import { sandboxRouter } from '../server/routes/sandbox.js';

describe('sandbox execution route boundary', () => {
  test('the sandbox router is mounted behind the local-filesystem guard', () => {
    const entries = ROUTE_MOUNTS.filter(entry => entry.router === sandboxRouter);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ method: 'use', path: '/api' });
    expect(entries[0].middleware).toContain(sandboxLocalFilesystem);
    expect(sandboxLocalFilesystem).toBe(requireLocalFilesystem);
  });

  test('system administrator status is revalidated from the database', async () => {
    const adminDb = { query: jest.fn(async () => ({ rows: [{ role: 'admin' }] })) };
    await expect(assertSystemAdmin({ session: { userId: 7, userRole: 'user' } }, { db: adminDb }))
      .resolves.toEqual({ userId: 7, role: 'admin' });
    expect(adminDb.query).toHaveBeenCalledWith('SELECT role FROM users WHERE id = $1', [7]);

    const userDb = { query: jest.fn(async () => ({ rows: [{ role: 'user' }] })) };
    await expect(assertSystemAdmin({ session: { userId: 8, userRole: 'admin' } }, { db: userDb }))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(assertSystemAdmin({ session: {} }, { db: adminDb }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  test('every command-running or mutating sandbox route includes the admin guard', () => {
    const guardedPaths = new Set();
    for (const layer of sandboxRouter.stack) {
      if (!layer.route || !layer.route.methods.post) continue;
      if (layer.route.stack.some(item => item.handle.name === 'requireSystemAdmin')) {
        guardedPaths.add(layer.route.path);
      }
    }
    expect(guardedPaths).toEqual(new Set([
      '/sandbox/toolchains',
      '/sandbox/rebuild-cancel',
      '/sandbox/toolchains/detect',
      '/sandbox/toolchains/install',
    ]));
  });
});
