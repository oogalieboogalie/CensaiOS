import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';

function normalizedOrigin(value) {
  try {
    return new URL(String(value)).origin;
  } catch {
    return String(value || '').replace(/\/$/, '');
  }
}

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedBrowserOrigin(origin, {
  appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173',
  runtimeMode = getRuntimeMode(),
} = {}) {
  if (!origin) return true;
  if (normalizedOrigin(origin) === normalizedOrigin(appOrigin)) return true;
  if (runtimeMode !== RUNTIME_MODES.LOCAL_DESKTOP) return false;
  return isLoopbackOrigin(origin) || String(origin).startsWith('tauri://');
}

export function getProxyTrustSetting(env = process.env) {
  const raw = String(env.CENSAI_TRUST_PROXY_HOPS || '').trim();
  if (!raw || raw === '0') return false;
  if (!/^\d+$/.test(raw)) {
    throw new Error('CENSAI_TRUST_PROXY_HOPS must be an integer from 0 to 10.');
  }
  const hops = Number(raw);
  if (hops < 1 || hops > 10) {
    throw new Error('CENSAI_TRUST_PROXY_HOPS must be an integer from 0 to 10.');
  }
  return hops;
}
