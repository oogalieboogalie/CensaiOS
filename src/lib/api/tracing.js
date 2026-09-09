const BASE = '/api/operational-intelligence';

function requireWorkspaceId(workspaceId) {
  const value = String(workspaceId ?? '').trim();
  if (!value) {
    const error = new Error('Open a workspace to use agent tracing.');
    error.code = 'workspace_required';
    throw error;
  }
  return value;
}

function tracePath(traceId, suffix) {
  const value = String(traceId ?? '').trim();
  if (!value) throw new Error('Trace id is required.');
  return `/traces/${encodeURIComponent(value)}${suffix}`;
}

function scopedUrl(path, workspaceId) {
  const separator = path.includes('?') ? '&' : '?';
  const query = new URLSearchParams({ workspaceId: requireWorkspaceId(workspaceId) });
  return `${BASE}${path}${separator}${query.toString()}`;
}

async function requestTracing(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `Tracing request failed (${response.status})`);
    error.status = response.status;
    if (payload?.code) error.code = payload.code;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function getTraces(workspaceId) {
  return requestTracing(scopedUrl('/traces', workspaceId));
}

export function getTraceEvents(workspaceId, traceId) {
  return requestTracing(scopedUrl(tracePath(traceId, '/events'), workspaceId));
}

export function convertTraceToTest(workspaceId, traceId) {
  return requestTracing(scopedUrl(tracePath(traceId, '/convert-to-test'), workspaceId), {
    method: 'POST',
  });
}
