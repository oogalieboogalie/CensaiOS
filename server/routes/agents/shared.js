import { dbReady } from '../../dbState.js';

export function requireDb(req, res, next) {
  if (!dbReady()) {
    return res.status(503).json({
      error: 'Database not connected',
      degradedState: 'database_unavailable',
      databaseStatus: {
        ready: false,
        degraded: true,
        degradedReason: 'database_unavailable',
      },
      taskWorker: {
        ready: false,
        degraded: true,
        degradedReason: 'database_unavailable',
        message: 'Agent task worker: disabled (database unavailable)',
      },
    });
  }
  next();
}
