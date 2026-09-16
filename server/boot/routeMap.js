/**
 * routeMap.js — declarative mount table for every API route mounted by the
 * Express app. Extracted from server/boot/routers.js so a maintainer can see
 * the full routing surface in one place, and so any change to a mount's
 * shape (path, middleware, router, method) is data, not buried in a chain
 * of inline `app.use(...)` calls.
 *
 * Why this exists: the daily-scan P0 ("mis-mounted window import guard")
 * was a direct symptom of inline router mounting. A future maintainer split
 * a guard from its router without realizing it. A data-driven mount makes
 * the structure visible in one place and forces every mount to declare its
 * shape.
 *
 * What is NOT here:
 *   - /api/auth — mounted INLINE in routers.js BEFORE the auth-guard so the
 *     login endpoint itself never sees the guard (chicken-and-egg). This
 *     is a bootstrap concern, not data.
 *   - The auth-guard middleware (`req.session.userId` check) — bootstrap.
 *   - /api/health and /api/ready — bootstrap probes, not data routes.
 *
 * Constraints:
 *   - ROUTE_MOUNTS order matches the previous inline chain order so
 *     middleware precedence is identical (Express matches routes in
 *     declaration order).
 *   - The /api/windows mount keeps the consolidated-guard shape — the two
 *     guards (`requireLocalFilesystem`, `requireFeatureFlag('window-import')`)
 *     and the terminal `windowImportRouter` live in the SAME entry, so a
 *     future maintainer cannot split them. tests/windowImportMountContract
 *     pins this shape.
 */

import { sovereignTestRouter } from '../sovereignTest.js';
import { calendarRouter } from '../calendar.js';
import { sheetsRouter } from '../sheets.js';
import { youtubeRouter } from '../youtube.js';
import { contextRouter } from '../routes/context.js';
import { filesRouter } from '../routes/files/index.js';
import { projectsRouter } from '../routes/projects/index.js';
import { githubRouter } from '../routes/github/index.js';
import { chatRouter } from '../routes/chat/index.js';
import { imagesRouter } from '../routes/images/index.js';
import { agentsRouter } from '../routes/agents/index.js';
import { localDevRouter } from '../routes/localDev.js';
import { mailcowRouter } from '../routes/mailcow.js';
import { providersRouter } from '../routes/providers.js';
import { windowSdkRouter } from '../routes/windowSdk.js';
import { julesRouter } from '../routes/jules.js';
import { schedulesRouter } from '../routes/schedules.js';
import { overseerRouter } from '../routes/overseer.js';
import { vexRouter } from '../routes/vex/index.js';
import { containersRouter } from '../routes/containers.js';
import { systemStatusRouter } from '../routes/systemStatus.js';
import { automationRouter } from '../routes/automation.js';
import { kubernetesRouter } from '../routes/kubernetes.js';
import { sandboxRouter } from '../routes/sandbox.js';
import { windowImportRouter } from '../routes/windowImport.js';
import { operationalIntelligenceRouter } from '../routes/operationalIntelligence.js';
import { mlopsRouter } from '../routes/mlops.js';
import { reliabilityRouter } from '../routes/reliability.js';
import { agentRegistryRouter } from '../routes/agentRegistry/index.js';
import { commandsRouter } from '../routes/commands.js';
import { keysRouter } from '../routes/keys.js';
import { freeTierStatusRouter } from '../routes/freeTierStatus.js';
import { approvalsRouter } from '../routes/approvals.js';
import { workspaceMembersRouter } from '../routes/workspaceMembers.js';
import { agentIconsRouter } from '../routes/agentIcons.js';
import { canvasRouter } from '../routes/canvas.js';
import {
  requireFeatureFlag,
  requireLocalFilesystem,
} from '../middleware/runtimeMode.js';

/**
 * Pre-built middleware references for the consolidated /api/windows guard
 * chain. Exported separately so tests can assert reference equality
 * (`requireFeatureFlag('window-import')` returns a fresh function on every
 * call, so the test must compare against the same instance the routeMap
 * installed). See tests/windowImportMountContract.test.js.
 */
export const windowImportLocalFilesystem = requireLocalFilesystem;
export const windowImportFeatureFlag = requireFeatureFlag('window-import');
export const sandboxLocalFilesystem = requireLocalFilesystem;

/**
 * Every entry is one of:
 *   { method: 'use', path, router }                       — single router mount
 *   { method: 'use', path, middleware: [...], router }   — guard chain + router
 *   { method: 'use', path, middleware: [...] }           — pure middleware mount
 *   { method: 'get',  path, handler }                     — single-method handler
 *
 * `method` defaults to 'use'. `middleware` runs before `router`; both are
 * optional. Order matters — Express matches in declaration order.
 */
export const ROUTE_MOUNTS = Object.freeze([
  // ----- data routes (auth-guard is mounted separately in routers.js) -----
  { method: 'use', path: '/api/sovereignTest', router: sovereignTestRouter },
  { method: 'use', path: '/api/calendar', router: calendarRouter },
  { method: 'use', path: '/api/sheets', router: sheetsRouter },
  { method: 'use', path: '/api/youtube', router: youtubeRouter },
  { method: 'use', path: '/api', router: contextRouter },
  { method: 'use', path: '/api/github', router: githubRouter },
  { method: 'use', path: '/api', router: projectsRouter },
  { method: 'use', path: '/api', router: filesRouter },
  { method: 'use', path: '/api', router: keysRouter },
  { method: 'use', path: '/api/ai/free-tier', router: freeTierStatusRouter },
  { method: 'use', path: '/api', router: approvalsRouter },
  { method: 'use', path: '/api', router: workspaceMembersRouter },
  { method: 'use', path: '/api/agent-icons', router: agentIconsRouter },
  { method: 'use', path: '/api', router: chatRouter },
  { method: 'use', path: '/api/images', router: imagesRouter },
  { method: 'use', path: '/api', router: agentsRouter },
  { method: 'use', path: '/api', router: localDevRouter },
  { method: 'use', path: '/api/mailcow', router: mailcowRouter },
  { method: 'use', path: '/api/providers', router: providersRouter },
  { method: 'use', path: '/api', router: windowSdkRouter },
  { method: 'use', path: '/api', router: julesRouter },
  { method: 'use', path: '/api', router: schedulesRouter },
  { method: 'use', path: '/api', router: overseerRouter },
  { method: 'use', path: '/api/vex', router: vexRouter },
  { method: 'use', path: '/api', router: containersRouter },
  { method: 'use', path: '/api/system', router: systemStatusRouter },
  { method: 'use', path: '/api', router: kubernetesRouter },
  { method: 'use', path: '/api/automation', router: automationRouter },
  { method: 'use', path: '/api', middleware: [sandboxLocalFilesystem], router: sandboxRouter },

  // CONSOLIDATED GUARD CHAIN — must stay in one entry.
  // Window import writes to disk and runs window:sync. The local-filesystem
  // guard rejects cloud_saas (no FS write on cloud) and the window-import
  // feature flag lets us turn the route off without a code deploy. Mounting
  // the guards AND the router on the same `/api/windows` prefix means a
  // future maintainer cannot accidentally split them — if they remove the
  // guard chain they will also remove the router and tests will fail.
  // Pinned by tests/windowImportMountContract.test.js.
  {
    method: 'use',
    path: '/api/windows',
    middleware: [requireLocalFilesystem, windowImportFeatureFlag],
    router: windowImportRouter,
  },

  { method: 'use', path: '/api', router: commandsRouter },
  {
    method: 'use',
    path: '/api/operational-intelligence',
    router: operationalIntelligenceRouter,
  },
  { method: 'use', path: '/api/mlops', router: mlopsRouter },
  { method: 'use', path: '/api/reliability', router: reliabilityRouter },
  { method: 'use', path: '/api/agent-registry', router: agentRegistryRouter },
  { method: 'use', path: '/api', router: canvasRouter },
]);

/**
 * Walk ROUTE_MOUNTS and apply each entry to `app`. Default `method` is
 * 'use'. For 'use' entries the path + middleware + router are passed to
 * `app.use(...)`. For method-specific entries (`get`, `post`, etc.) the
 * path + middleware + handler/router are passed to `app.<method>(...)`.
 *
 * Returns `app` for chaining.
 */
export function mountRoutes(app) {
  for (const entry of ROUTE_MOUNTS) {
    const method = entry.method || 'use';
    const handlers = [];
    if (Array.isArray(entry.middleware)) {
      handlers.push(...entry.middleware);
    }
    if (entry.router) handlers.push(entry.router);
    if (entry.handler) handlers.push(entry.handler);

    if (method === 'get') {
      app.get(entry.path, ...handlers);
    } else if (method === 'post') {
      app.post(entry.path, ...handlers);
    } else if (method === 'put') {
      app.put(entry.path, ...handlers);
    } else if (method === 'delete') {
      app.delete(entry.path, ...handlers);
    } else if (method === 'patch') {
      app.patch(entry.path, ...handlers);
    } else {
      app.use(entry.path, ...handlers);
    }
  }
  return app;
}
