// Where a share link should point. A public domain this copy already has
// wins. The quick tunnel is off unless CENSAI_QUICK_TUNNEL is on.

import { hostIsReachableByAnyone, originFromRequest } from './boardDoorRules.js';

const ON = new Set(['1', 'true', 'on', 'yes']);

function publicOrigin(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !hostIsReachableByAnyone(url.host)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** Origin from CENSAI_DOMAIN or APP_ORIGIN, or '' when neither is a public address. */
export function publicDomainOrigin(env = process.env) {
  return publicOrigin(env.CENSAI_DOMAIN) || publicOrigin(env.APP_ORIGIN);
}

export function quickTunnelOptedIn(env = process.env) {
  return ON.has(String(env.CENSAI_QUICK_TUNNEL || '').trim().toLowerCase());
}

/**
 * @returns {{ kind: 'domain', origin: string } | { kind: 'tunnel' } | { kind: 'refused' }}
 */
export function shareOriginChoice(req, env = process.env) {
  const configured = publicDomainOrigin(env);
  if (configured) return { kind: 'domain', origin: configured };
  const fromRequest = originFromRequest(req);
  if (fromRequest) return { kind: 'domain', origin: fromRequest };
  if (quickTunnelOptedIn(env)) return { kind: 'tunnel' };
  return { kind: 'refused' };
}
