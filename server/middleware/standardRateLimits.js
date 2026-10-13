import { rateLimit } from 'express-rate-limit';

function bypassEnabled(req) {
  if (process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLED === 'true') return true;
  if (process.env.NODE_ENV === 'production') return false;
  const raw = req?.headers?.['x-bypass-rate-limit'];
  if (raw === undefined || raw === null) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

export const authSecurityRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: bypassEnabled,
  message: { error: 'Too many authentication attempts. Please try again shortly.' },
});

export const resourceRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: bypassEnabled,
  message: { error: 'Too many requests. Please try again shortly.' },
});
