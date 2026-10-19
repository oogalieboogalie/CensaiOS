import { createLogger, redactUrl } from '../logger.js';

const QUIET_PATHS = [/^\/api\/health$/, /^\/api\/client-state/, /^\/api\/local-dev-restarts/];

// One line per request. The address is logged without the values of
// secret-looking query parts (invite, pair and join codes, tokens, keys):
// the app log is a file on disk and the codes sign people in.
export function requestLogger(log = createLogger('http')) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const quiet = QUIET_PATHS.some((re) => re.test(req.path));
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : (quiet ? 'debug' : 'info');
      log[level](`${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${ms}ms`);
    });
    next();
  };
}
