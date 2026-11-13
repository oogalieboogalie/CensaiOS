import { createLogger, redactUrl } from '../logger.js';

// What the app itself asks over and over (health checks, its saved state,
// restart notices, and every few seconds a Files window's open folders and
// its project's versions): logged below info when answered, so the log keeps
// what people did. Only reads: saving the board's state stays at info.
const QUIET_PATHS = [
  /^\/api\/health$/, /^\/api\/client-state/, /^\/api\/local-dev-restarts/,
  /^\/api\/files\/relist$/, /^\/api\/project-git\/status$/,
];

// One line per request. The address is logged with only its plain query
// values (ids, counts, switches; redactUrl in server/logger.js): the app log
// is a file on disk, codes sign people in, and a file or folder someone asked
// for, a repo or their words are theirs.
export function requestLogger(log = createLogger('http')) {
  return (req, res, next) => {
    const start = Date.now();
    // Read before the routers: one mounted on /api takes it off req.path.
    const quiet = (req.method === 'GET' || req.method === 'HEAD') && QUIET_PATHS.some((re) => re.test(req.path));
    res.on('finish', () => {
      const ms = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : (quiet ? 'debug' : 'info');
      log[level](`${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${ms}ms`);
    });
    next();
  };
}
