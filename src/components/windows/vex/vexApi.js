// Shared helpers for VexWindow

export const API_BASE = '/api/vex';

export async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function getVerdictColor(verdict) {
  if (verdict === 'critical') return 'var(--danger)';
  if (verdict === 'warn') return 'var(--warning)';
  return 'var(--success)';
}
