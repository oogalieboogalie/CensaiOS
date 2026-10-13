import { isSessionAuthorized } from './authPolicy.js';

export function requireAuthorizedSession(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  if (!isSessionAuthorized(req.session)) {
    return res.status(403).json({
      error: 'Access denied. This private beta requires an invitation.',
    });
  }
  return next();
}
