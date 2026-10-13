const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(value) {
  if (!value) return '';
  return String(value).trim().replace(/\/$/, '').toLowerCase();
}

export function createCsrfOriginGuard({ appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173' } = {}) {
  const configuredOrigin = normalizeOrigin(appOrigin);

  return function csrfOriginGuard(req, res, next) {
    if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next();

    const fetchSite = String(req.get?.('sec-fetch-site') || '').toLowerCase();
    if (fetchSite === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site request rejected.' });
    }

    const origin = normalizeOrigin(req.get?.('origin'));
    if (!origin) {
      // Native clients and server-to-server callers do not send Origin. A
      // browser-driven CSRF request does, and is rejected above/below.
      return next();
    }

    const requestOrigin = normalizeOrigin(`${req.protocol}://${req.get('host')}`);
    const localDevelopmentOrigin = process.env.NODE_ENV !== 'production'
      && /^(?:http:\/\/localhost|http:\/\/127\.0\.0\.1)(?::\d+)?$/.test(origin);
    if (origin === configuredOrigin || origin === requestOrigin || localDevelopmentOrigin) {
      return next();
    }

    return res.status(403).json({ error: 'Request origin is not allowed.' });
  };
}
