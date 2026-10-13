/**
 * routers.js — Express app-level mount glue.
 *
 * Owns the bootstrap concerns that don't belong in the data-driven
 * ROUTE_MOUNTS table:
 *   1. /api/auth router — mounted BEFORE the auth-guard so login itself is
 *      reachable. Without this, the auth-guard would block the very endpoint
 *      that establishes the session.
 *   2. The auth-guard middleware (`/api/*` session check).
 *   3. /api/health and /api/ready probe endpoints.
 *
 * Everything else (every other router mount, the consolidated window-import
 * guard chain, etc.) lives in routeMap.js — see ROUTE_MOUNTS there. Keeping
 * the mount table declarative means a maintainer can see the full routing
 * surface in one place and cannot accidentally split a guard chain from its
 * terminal router.
 */

import { mountRoutes } from './routeMap.js';
import { authRouter } from '../routes/auth.js';
import { hubAuthRouter } from '../routes/hubAuth.js';
import { guestRouter } from '../routes/shareLinks.js';
import { lessonGuestRouter } from '../routes/lessonsGuest.js';
import { lessonBillingRouter } from '../routes/lessonsBilling.js';
import { getSystemStatus } from '../health.js';
import { runnerClient } from '../runner/client.js';
import { requireAuthorizedSession } from '../security/sessionGuard.js';
import { agentEndpointPublicRouter } from '../routes/agentEndpointsPublic.js';
import { refuseEmailSignInFromAnotherComputer, webOsPublicRouter } from '../routes/webOs.js';
import { doorGuard } from '../webOs/doorListener.js';
import { socialPublicRouter } from '../routes/socialPublic.js';

export function mountRouters(app) {
  // Pre-guard: /api/auth and /api/hub-auth must come before the guard
  // so signup/login/confirm can be reached without a session.
  // Open anywhere: requests from other computers arrive on their own port and
  // pass this first (closed page while the switch is off, code-only sign-in).
  app.use(doorGuard);
  // Another computer signs in with a code, never an email or one click.
  app.post('/api/auth/developer', refuseEmailSignInFromAnotherComputer);
  app.post('/api/auth/local', refuseEmailSignInFromAnotherComputer);
  app.use('/api/web-os', webOsPublicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/hub-auth', hubAuthRouter);
  // Guest links (spec 5): people without an account open a share link and
  // join under a guest pass. Only the guest router serves them; every
  // route behind the guard below still requires a signed-in user.
  app.use('/api/guest/classes', lessonGuestRouter);
  app.use('/api/guest', guestRouter);
  // Live lessons (spec 12): Stripe's webhook carries its own signature.
  app.use('/api/billing', lessonBillingRouter);
  // Agent endpoints: apps outside censaiOS (MCP clients, scripts) call a
  // shared agent with an agent key instead of a sign-in.
  app.use('/api/mcp', agentEndpointPublicRouter);
  // Social canvas: another censaiOS reads a profile with a key its owner gave out.
  app.use('/api/social/v1', socialPublicRouter);

  // Authentication guard for all other API endpoints. Express matches in
  // declaration order, so every subsequent `app.use('/api/...')` mount
  // (including all entries from ROUTE_MOUNTS) sees this guard.
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path === '/ready') {
      return next();
    }
    // Bypass authentication in test environment and provide a mock session
    if (process.env.NODE_ENV === 'test') {
      req.session = req.session || {};
      req.session.userId = req.session.userId || 1;
      return next();
    }
    return requireAuthorizedSession(req, res, next);
  });

  // Data-driven mounts: every other router + the consolidated
  // /api/windows guard chain (see ROUTE_MOUNTS in routeMap.js).
  mountRoutes(app);

  app.get('/api/health', async (_req, res) => {
    const status = await getSystemStatus();
    const runnerStatus = await runnerClient.getHealth();
    res.json({
      ...status,
      hasKey: status.modelProvider.hasKey,
      provider: status.modelProvider.baseUrl,
      model: status.modelProvider.model,
      database: status.database.connected,
      databaseStatus: {
        ready: status.database.connected,
        degraded: !status.database.connected,
        degradedReason: status.degradedState,
        error: status.database.error,
      },
      runner: runnerStatus,
    });
  });

  app.get('/api/ready', async (_req, res) => {
    const status = await getSystemStatus();
    res.status(status.ready ? 200 : 503).json(status);
  });
}
