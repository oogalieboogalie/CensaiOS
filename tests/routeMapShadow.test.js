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
      '/current-project|/projects|/open-projects|/current-project|/projects/open|/project-ideas|/project-handoffs',
      // filesRouter: clientState + browser + mkdir + folders sub-routers, no direct routes.
      'layers:4',
      '/keys|/keys|/keys/:provider',
      '/tool-approvals|/tool-approvals/:id/decision|/agent-trust|/agent-trust|/agent-speak-up|/agent-speak-up|/agent-wake-ups|/agent-wake-ups',
      '/workspaces/:workspaceId/members|/workspaces/:workspaceId/members|/workspaces/personal|/workspaces/:workspaceId/members/me',
      '/workspaces/:workspaceId/history|/workspaces/:workspaceId/history/:seq|/workspaces/:workspaceId/history/:seq/restore',
      '/workspaces/:workspaceId/workflows/:windowId/run|/workspaces/:workspaceId/workflows/:windowId/review|/workspaces/:workspaceId/workflows/:windowId/stop|/workspaces/:workspaceId/workflows/:windowId/trigger|/workspaces/:workspaceId/workflows/:windowId/trigger|/workspaces/:workspaceId/workflows/:windowId/runs',
      '/workspaces/:workspaceId/share-links|/workspaces/:workspaceId/share-links|/workspaces/:workspaceId/share-links/:linkId|/workspaces/:workspaceId/share-links/:linkId/joins|/workspaces/:workspaceId/live|/workspaces/:workspaceId/windows/:windowId/public|/workspaces/:workspaceId/comments|/workspaces/:workspaceId/comments|/workspaces/:workspaceId/comments/:commentId/resolve',
      '/workspaces/:workspaceId/classes|/workspaces/:workspaceId/classes|/classes/:classId/roster|/classes/:classId/invite-codes|/classes/:classId/students/:enrollmentId/checkpoints/:checkpointId|/classes/:classId/students/:enrollmentId/hand|/classes/:classId/students/:enrollmentId/remove|/classes/:classId/end',
      '/image|/ideas/expand|/chat|/chat/capabilities|/chat/transcribe|/chat/speech|/group-chat',
      // agentsRouter: 23 sub-routers (incl. sub-agent helper +  communication + sales-leads + scout + leadhound + research + board templates + skill sets + blueprints + message router + Censai's plans).
      'layers:23',
      '/local-dev-restarts/notifications',
      '/window-sdk/scaffold|/window-sdk/new|/window-sdk/validate',
      '/jules/queue|/jules/sessions',
      '/schedules|/schedules|/schedules/:id|/schedules/:id',
      '/overseer/status|/overseer/start|/overseer/stop|/overseer/run',
      '/containers|/containers/:id/logs|/containers/:id/restart|/containers/:id',
      '/kubernetes/status',
      // The sandbox router is no longer broad: it mounts at /api/sandbox
      // (see sandboxExecutionBoundary.test.js and the test below).
      '/commands|/commands/:commandId/execute',
    ]);

    const broadSignatures = ROUTE_MOUNTS
      .filter(entry => entry.path === '/api')
      .map(directRouteSignature);

    expect(broadSignatures).toHaveLength(allowedBroadMounts.size);
    for (const signature of broadSignatures) {
      expect(allowedBroadMounts).toContain(signature);
    }
  });

  test('no broad /api mount sits behind the local-files guard', () => {
    // A guard on all of /api refuses every route mounted after it (even
    // /api/ready) on a computer whose files are switched off.
    const guarded = ROUTE_MOUNTS.filter(entry => (
      entry.path === '/api'
      && (entry.middleware || []).includes(windowImportLocalFilesystem)
    ));
    expect(guarded).toEqual([]);
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
