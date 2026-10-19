import { createLogger } from '../logger.js';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { startLogCleanup } from '../logRetention.js';
import { startTaskWorker } from '../taskWorker.js';
import { startSchedulerWorker } from '../schedulerWorker.js';
import { startIdeaFoundryWorker } from '../skillSets/worker.js';
import { startAgentWakeupWorker } from '../agent-wakeups/worker.js';
import { startAgentCardRunWorker } from '../agent-card-runs/worker.js';
import { startOsvMirrorWorker } from '../osvMirror/worker.js';
import { startWorkflowTriggerWorker } from '../workflows/triggers.js';
import { startAuctionWatcherWorker } from '../auctionWatcher/worker.js';
import { checkDb } from './database.js';
import { tickJulesWatcher } from './julesWatcher.js';
import { attachTerminalServer } from '../terminal/index.js';
import { attachAgentRegistryWs } from '../ws/agentRegistry.js';
import { attachWorkspaceCollaborationWs } from '../ws/workspaceCollaboration.js';
import { attachHocuspocusWs } from '../collab/hocuspocus.js';
import { startDevServerReaper, stopAllDevServers } from '../devServers/reaper.js';
import { stopAllCliAgents } from '../cli-agents/index.js';
import { startSelfFix } from '../selfFix/index.js';
import { closeAll as closeOutsideTools } from '../outsideTools/connections.js';
import { initializeDynamicTools, initializeMcpTools, shutdownMcpTools } from '../tools.js';
import { startOutsideListener } from '../agentEndpoints/outsideListener.js';
import { startRelayLink } from '../agentNetwork/relayLink.js';
import { startDoorListener } from '../webOs/doorListener.js';

const log = createLogger('server-lifecycle');

/**
 * Where the main port listens. censaiOS on the owner's computer answers that
 * computer only (127.0.0.1); other computers use the Open anywhere port. In
 * Docker it listens on the container's network and docker-compose.yml
 * publishes it on 127.0.0.1 only. Cloud and private servers listen everywhere.
 */
export function defaultListenHost(env = process.env, runtimeMode = getRuntimeMode()) {
  if (env.CENSAI_LISTEN_HOST) return env.CENSAI_LISTEN_HOST;
  if (env.CENSAI_IN_CONTAINER === '1') return undefined;
  return runtimeMode === RUNTIME_MODES.LOCAL_DESKTOP ? '127.0.0.1' : undefined;
}

// The compose file from before the front door was locked publishes the main
// port to the whole network, and inside Docker the server can't tell.
function warnAboutOldComposeFile(env = process.env) {
  if (env.CENSAI_IN_CONTAINER !== '1' || env.CENSAI_DOOR_PORT || getRuntimeMode() !== RUNTIME_MODES.LOCAL_DESKTOP) return;
  log.warn('Older docker-compose.yml: if it says "3002:3001", change it to "127.0.0.1:3002:3001" so only this computer can sign in (SELF_HOSTING_GUIDE.md, "Who can reach your copy").');
}

export async function startServer(app, options = {}) {
  const port = options.port ?? process.env.PORT ?? 3001;
  const shouldStartWorkers = options.startWorkers ?? process.env.NODE_ENV !== 'test';
  const shouldStartWatchers = options.startWatchers ?? shouldStartWorkers;

  await checkDb();
  // Self-fix: save error reports, and apply fixes the owner's switch let through.
  if (shouldStartWorkers && getRuntimeMode() !== RUNTIME_MODES.CLOUD_SAAS) {
    await startSelfFix().catch((err) => log.warn('self-fix did not start', { error: err.message }));
  }
  await initializeDynamicTools();
  await initializeMcpTools();

  // Register shutdown handlers
  const handleShutdown = async () => {
    log.info('Shutdown signal received, cleaning up resources...');
    shutdownMcpTools();
    closeOutsideTools();
    // Run dev containers go with the app (capped so exit never hangs).
    if (shouldStartWorkers) await stopAllDevServers().catch(() => {});
    // So do coding agents (Agent Console) and every command they started.
    stopAllCliAgents();
    process.exit(0);
  };
  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  const host = options.host ?? defaultListenHost();
  const listenArgs = host ? [port, host] : [port];

  return new Promise((resolve, reject) => {
    const server = app.listen(...listenArgs, () => {
      log.info('Homebase API server started', {
        url: `http://localhost:${port}`,
        mode: getRuntimeMode(),
      });

      const wsAuth = { sessionStore: app.get('sessionStore'), sessionSecret: app.get('sessionSecret') };
      attachTerminalServer(server, { ...wsAuth });
      attachAgentRegistryWs(server, { ...wsAuth });
      attachWorkspaceCollaborationWs(server, { ...wsAuth });
      attachHocuspocusWs(server, { ...wsAuth });
      // Open anywhere: other computers' own port (docker-compose.yml, 3004).
      if (shouldStartWorkers) startDoorListener(server, app);
      warnAboutOldComposeFile();

      if (shouldStartWorkers) {
        startLogCleanup();
        startTaskWorker();
        startSchedulerWorker();
        startAgentWakeupWorker();
        startAgentCardRunWorker();
        startOsvMirrorWorker();
        startWorkflowTriggerWorker();
        startIdeaFoundryWorker();
        startAuctionWatcherWorker();
        startDevServerReaper();
        // Agent endpoints' own port, the one a tunnel points at.
        startOutsideListener();
        // Collect calls a relay queued while this computer was off (off unless configured).
        startRelayLink().catch(() => {});
      }

      if (shouldStartWatchers) {
        setInterval(tickJulesWatcher, 15_000);
      }

      resolve(server);
    });

    server.on('error', (err) => {
      log.error('Failed to start server', { error: err.message });
      reject(err);
    });
  });
}
