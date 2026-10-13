// Pure helpers for the AutomationWindow row. No React, no DOM, no network.
// Imported by AutomationRow.jsx and the focused test in tests/automationWindowStatus.test.jsx.

/**
 * Map a raw automation entry to one of the five row statuses.
 * Pure: no side effects, no exceptions.
 * @param {{ state?: string, lastTaskResult?: number | null, pending?: number, dispatched?: number }} info
 * @returns {'queued'|'running'|'done'|'error'|'unknown'}
 */
export function mapStatus(info = {}) {
  const state = typeof info.state === 'string' ? info.state : '';
  const result = info.lastTaskResult;
  const pending = Number(info.pending) || 0;

  if (state === 'Running') return 'running';
  if (result !== null && result !== undefined && result !== 0) return 'error';
  if (pending > 0) return 'queued';
  if (state === 'Ready' && result === 0) return 'done';
  if (state === 'Disabled') return 'done';
  return 'unknown';
}

/**
 * Format a next-run timestamp as a relative string for human display.
 *   - ISO string in the future → "in 2h 15m" / "in 45m" / "in 30s" / "in 3d"
 *   - ISO string in the past   → "overdue 5m" (or "overdue 2h 15m")
 *   - now/within ±5s           → "now"
 *   - null / undefined / unparseable → "—"
 * Never throws.
 * @param {unknown} input
 * @returns {string}
 */
export function formatRelativeNextRun(input) {
  if (input === null || input === undefined || input === '') return '—';
  if (typeof input !== 'string' && typeof input !== 'number') return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  if (absSec < 5) return 'now';
  let body;
  if (absSec < 60) body = `${Math.round(absSec)}s`;
  else if (absSec < 3600) body = `${Math.round(absSec / 60)}m`;
  else if (absSec < 86400) {
    const h = Math.floor(absSec / 3600);
    const m = Math.round((absSec % 3600) / 60);
    body = `${h}h ${m}m`;
  } else body = `${Math.round(absSec / 86400)}d`;
  return diffMs < 0 ? `overdue ${body}` : `in ${body}`;
}

/**
 * Resolve the human-readable "what is it doing" label for a row.
 * @param {{ currentStep?: string, metadata?: { current?: string }, pending?: number, dispatched?: number, state?: string }} info
 * @returns {string}
 */
export function resolveCurrentStep(info = {}) {
  if (info.currentStep && typeof info.currentStep === 'string') return info.currentStep;
  const md = info.metadata;
  if (md && typeof md === 'object' && typeof md.current === 'string' && md.current) return md.current;
  const pending = Number(info.pending) || 0;
  const dispatched = Number(info.dispatched) || 0;
  if (info.state === 'Running' && dispatched > 0) return `Dispatching (${dispatched} in flight)`;
  if (pending > 0) return `Idle — ${pending} pending`;
  if (info.state === 'Disabled') return 'Disabled';
  return '—';
}
