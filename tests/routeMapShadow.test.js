import {
  ROUTE_MOUNTS,
  windowImportFeatureFlag,
  windowImportLocalFilesystem,
} from '../server/boot/routeMap.js';

function directRouteSignature(entry) {
  const paths = (entry.router?.stack || [])
    .map(layer => layer.route?.path)
    .filter(Boolean);
  return paths.length > 0
    ? paths.join('|')
    : `layers:${entry.router?.stack?.length || 0}`;
}

describe('route map shadow contract', () => {
  test('does not duplicate an exact path and router mount', () => {
    const seen = new Map();
    for (const entry of ROUTE_MOUNTS) {
      const key = `${entry.method || 'use'} ${entry.path}`;
      const routers = seen.get(key) || [];
      expect(routers).not.toContain(entry.router);
      routers.push(entry.router);
      seen.set(key, routers);
    }
  });

  test('broad /api mounts are intentionally allowlisted', () => {
    const allowedBroadMounts = new Set([
      '/context/feed|/context/search',
      '/current-project|/projects|/current-project|/projects/open|/project-ideas|/project-handoffs',
      // filesRouter: clientState + browser + mkdir sub-routers, no direct routes.
      'layers:3',
      '/keys|/keys|/keys/:provider',
      '/tool-approvals|/tool-approvals/:id/decision',
      '/workspaces/:workspaceId/members|/workspaces/:workspaceId/members|/workspaces/personal|/workspaces/:workspaceId/members/me',
      '/image|/ideas/expand|/chat|/group-chat',
      // agentsRouter: 15 sub-routers (incl. communication + sales-leads + scout).
      'layers:15',
      '/local-dev-restarts/notifications',
      '/window-sdk/scaffold|/window-sdk/new|/window-sdk/validate',
      '/jules/queue|/jules/sessions',
      '/schedules|/schedules|/schedules/:id|/schedules/:id',
      '/overseer/status|/overseer/start|/overseer/stop|/overseer/run',
      '/containers|/containers/:id/logs|/containers/:id/restart|/containers/:id',
      '/kubernetes/status',
      '/sandbox/toolchains|/sandbox/toolchains|/sandbox/rebuild-status|/sandbox/rebuild-cancel|/sandbox/toolchains/detect|/sandbox/toolchains/install',
      '/commands|/commands/:commandId/execute',
      '/canvas/cards',
    ]);

    const broadSignatures = ROUTE_MOUNTS
      .filter(entry => entry.path === '/api')
      .map(directRouteSignature);

    expect(broadSignatures).toHaveLength(allowedBroadMounts.size);
    for (const signature of broadSignatures) {
      expect(allowedBroadMounts).toContain(signature);
    }
  });

  test('/api/windows keeps its local filesystem and feature-flag policy gate', () => {
    const windowsMount = ROUTE_MOUNTS.find(entry => entry.path === '/api/windows');

    expect(windowsMount).toBeDefined();
    expect(windowsMount.middleware).toEqual([
      windowImportLocalFilesystem,
      windowImportFeatureFlag,
    ]);
    expect(typeof windowsMount.router).toBe('function');
  });

  test('/api/windows remains before broad command catchalls', () => {
    const windowsIndex = ROUTE_MOUNTS.findIndex(entry => entry.path === '/api/windows');
    const commandsIndex = ROUTE_MOUNTS.findIndex(entry => (
      entry.path === '/api'
      && directRouteSignature(entry) === '/commands|/commands/:commandId/execute'
    ));

    expect(windowsIndex).toBeGreaterThanOrEqual(0);
    expect(commandsIndex).toBeGreaterThanOrEqual(0);
    expect(windowsIndex).toBeLessThan(commandsIndex);
  });

  test('mlops and reliability stay explicit data-plane routes', () => {
    expect(ROUTE_MOUNTS.find(entry => entry.path === '/api/mlops')).toBeDefined();
    expect(ROUTE_MOUNTS.find(entry => entry.path === '/api/reliability')).toBeDefined();
    expect(ROUTE_MOUNTS.filter(entry => entry.path === '/api/mlops')).toHaveLength(1);
    expect(ROUTE_MOUNTS.filter(entry => entry.path === '/api/reliability')).toHaveLength(1);
  });
});
