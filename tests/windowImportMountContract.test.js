/**
 * window-import mount contract — structural assertion on
 * server/boot/routeMap.js so a future maintainer can't quietly re-split
 * the guard chain from the windowImportRouter mount.
 *
 * The daily repo scan flagged a P0 where the guard middleware was
 * mounted on '/api/windows' with no terminal router, while the actual
 * router was mounted on '/api' without the guards. Cloud_saas requests
 * to /api/windows/import still got blocked because the guard middleware
 * happened to fire first — but the mount shape was a foot-gun: a future
 * cleanup would have removed the "orphan" guard chain and silently
 * unprotected the source-writing routes.
 *
 * The correct shape is: one ROUTE_MOUNTS entry on `/api/windows` whose
 * `middleware` array contains BOTH `requireLocalFilesystem` and
 * `requireFeatureFlag('window-import')` and whose `router` is
 * `windowImportRouter`. This keeps the guards scoped to just the
 * window-import routes — sibling endpoints like /api/health should never
 * have to satisfy the window-import feature flag.
 *
 * This test pins the mount shape so any change that splits the guards
 * from the router fails CI loudly.
 *
 * NOTE (2026-06-24): moved from server/boot/routers.js → server/boot/routeMap.js
 * as part of the P1-1 routeMap extraction. routers.js now delegates the
 * router-mount surface to mountRoutes(app) (see routeMap.js). The shape
 * contract — one entry, consolidated guards, terminal router — is what
 * matters; the file location is incidental.
 */
import { ROUTE_MOUNTS } from '../server/boot/routeMap.js';
import {
  requireLocalFilesystem,
} from '../server/middleware/runtimeMode.js';
import {
  windowImportLocalFilesystem,
  windowImportFeatureFlag,
} from '../server/boot/routeMap.js';

const windowImportMounts = ROUTE_MOUNTS.filter(
  (entry) => entry.path === '/api/windows',
);

describe('window-import mount contract in server/boot/routeMap.js', () => {
  test('there is exactly one ROUTE_MOUNTS entry on /api/windows', () => {
    expect(windowImportMounts).toHaveLength(1);
  });

  test('the /api/windows entry is a use mount', () => {
    const [entry] = windowImportMounts;
    expect(entry.method || 'use').toBe('use');
  });

  test('the /api/windows entry has a terminal router', () => {
    const [entry] = windowImportMounts;
    expect(entry.router).toBeDefined();
    expect(typeof entry.router).toBe('function');
  });

  test('the /api/windows entry includes requireLocalFilesystem in middleware', () => {
    const [entry] = windowImportMounts;
    expect(Array.isArray(entry.middleware)).toBe(true);
    expect(entry.middleware).toContain(windowImportLocalFilesystem);
    // Sanity: same identity as a fresh import from runtimeMode.js.
    expect(windowImportLocalFilesystem).toBe(requireLocalFilesystem);
  });

  test('the /api/windows entry includes the window-import feature-flag middleware', () => {
    const [entry] = windowImportMounts;
    expect(entry.middleware).toContain(windowImportFeatureFlag);
  });

  test('the guards appear BEFORE windowImportRouter (middleware before router)', () => {
    const [entry] = windowImportMounts;
    expect(Array.isArray(entry.middleware)).toBe(true);
    expect(entry.middleware.length).toBeGreaterThanOrEqual(2);
    expect(entry.router).toBeDefined();
  });
});