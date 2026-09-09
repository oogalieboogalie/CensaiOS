import { createLogger } from '../logger.js';
import { getRuntimeMode } from '../middleware/runtimeMode.js';
import { startLogCleanup } from '../logRetention.js';
import { startTaskWorker } from '../taskWorker.js';
import { startSchedulerWorker } from '../schedulerWorker.js';
import { startAgentWakeupWorker } from '../agent-wakeups/worker.js';
import { startAgentCardRunWorker } from '../agent-card-runs/worker.js';
import { checkDb } from './database.js';
import { tickJulesWatcher } from './julesWatcher.js';
import { attachTerminalServer } from '../terminal/index.js';
import { attachAgentRegistryWs } from '../ws/agentRegistry.js';
import { attachWorkspaceCollaborationWs } from '../ws/workspaceCollaboration.js';
import { initializeDynamicTools, initializeMcpTools, shutdownMcpTools } from '../tools.js';

const log = createLogger('server-lifecycle');

export async function startServer(app, options = {}) {
  const port = options.port ?? process.env.PORT ?? 3001;
  const shouldStartWorkers = options.startWorkers ?? process.env.NODE_ENV !== 'test';
  const shouldStartWatchers = options.startWatchers ?? shouldStartWorkers;

  await checkDb();
  await initializeDynamicTools();
  await initializeMcpTools();

  // Register shutdown handlers
  const handleShutdown = () => {
    log.info('Shutdown signal received, cleaning up resources...');
    shutdownMcpTools();
    process.exit(0);
  };
  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      log.info('Homebase API server started', {
        url: `http://localhost:${port}`,
        mode: getRuntimeMode(),
      });

      attachTerminalServer(server, { sessionStore: app.get('sessionStore') });
      attachAgentRegistryWs(server, { sessionStore: app.get('sessionStore') });
      attachWorkspaceCollaborationWs(server, { sessionStore: app.get('sessionStore') });

      if (shouldStartWorkers) {
        startLogCleanup();
        startTaskWorker();
        startSchedulerWorker();
        startAgentWakeupWorker();
        startAgentCardRunWorker();
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
