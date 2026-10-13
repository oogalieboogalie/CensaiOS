import { getSecret } from '../secrets.js';

export const JULES_BASE = 'https://jules.googleapis.com/v1alpha';
export const ACTIVE_SESSION_STATUSES = ['QUEUED', 'PLANNING', 'IN_PROGRESS', 'AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK'];
export const TERMINAL_SESSION_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'CANCELED'];

export async function fetchJules(endpoint, options = {}) {
  const key = getSecret('JULES_API_KEY');
  if (!key) throw new Error('JULES_API_KEY not configured in .env');
  const needsContentType = options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase());
  const res = await fetch(`${JULES_BASE}${endpoint}`, {
    ...options,
    headers: {
      'X-Goog-Api-Key': key,
      'Accept': 'application/json',
      ...(needsContentType ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jules ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
