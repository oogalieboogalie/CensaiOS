/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import {
  FREE_AI_STATUS_UNAVAILABLE,
  getFreeAiAllowanceStatus,
} from '../../lib/api/freeAiAllowance.js';

const normalizeWorkspaceId = value => String(value ?? '').trim();

function allowanceSummary(status) {
  const bands = ['user', 'shared', 'minute']
    .map(name => ({ name, ...status?.allowance?.[name] }))
    .filter(band => Number.isSafeInteger(band.remaining) && band.remaining >= 0);
  if (bands.length !== 3) return null;

  const remaining = Math.min(...bands.map(band => band.remaining));
  const limiting = bands.filter(band => band.remaining === remaining);
  const resetTimes = limiting
    .map(band => new Date(band.resetsAt).getTime())
    .filter(Number.isFinite);
  if (resetTimes.length === 0) return null;

  return {
    remaining,
    userRemaining: bands.find(band => band.name === 'user')?.remaining,
    resetAt: new Date(remaining === 0 ? Math.max(...resetTimes) : Math.min(...resetTimes)),
  };
}

function formatUtc(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(value);
}

function providerLabel(provider) {
  return String(provider || '').toLowerCase() === 'openrouter' ? 'OpenRouter' : String(provider || '');
}

export function FreeAiAllowanceNotice({ workspaceId, refreshKey }) {
  const scope = normalizeWorkspaceId(workspaceId);
  const [view, setView] = React.useState(null);

  React.useEffect(() => {
    if (!scope) return;
    let current = true;
    getFreeAiAllowanceStatus(scope)
      .then(status => {
        if (current) setView({ workspaceId: scope, status, unavailable: false });
      })
      .catch(() => {
        if (current) setView({ workspaceId: scope, status: null, unavailable: true });
      });
    return () => { current = false; };
  }, [scope, refreshKey]);

  if (!scope || view?.workspaceId !== scope) return null;
  if (view.unavailable) {
    return <Notice>{FREE_AI_STATUS_UNAVAILABLE}</Notice>;
  }
  if (view.status?.enabled === false) return null;

  const summary = allowanceSummary(view.status);
  if (!summary) return <Notice>{FREE_AI_STATUS_UNAVAILABLE}</Notice>;

  const byok = view.status?.byok?.provider === 'openrouter' &&
    view.status?.byok?.configured === true;
  const model = String(view.status?.model || '');
  const provider = providerLabel(view.status?.provider);
  const reset = formatUtc(summary.resetAt);
  const atCapacity = summary.remaining === 0 && summary.userRemaining > 0;
  const requestLabel = summary.remaining === 1 ? 'request' : 'requests';

  let headline = `${summary.remaining} free AI ${requestLabel} available`;
  if (atCapacity) headline = 'Free AI is temporarily at capacity';
  if (summary.remaining === 0 && !atCapacity) headline = '0 free AI requests left today';

  let guidance = `No OpenRouter key is saved for this account. Resets ${reset}. Add your OpenRouter key in Settings to bypass the shared allowance.`;
  if (summary.remaining === 0 && !byok) {
    guidance = `No OpenRouter key is saved for this account. Add an OpenRouter key in Settings to keep working, or try again after ${reset}.`;
  } else if (byok) {
    guidance = `Your OpenRouter key is saved for this account and bypasses the shared allowance. Free fallback resets ${reset}.`;
  }

  return (
    <Notice>
      <strong style={{ color: 'var(--ink)', fontWeight: 650 }}>{headline}</strong>
      <span>{guidance}</span>
      <span style={{ color: 'var(--ink-faint)' }}>{provider} · {model}</span>
    </Notice>
  );
}

function Notice({ children }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="free-ai-allowance"
      style={{
        margin: '0 10px 8px',
        padding: '7px 10px',
        border: '1px solid var(--hairline)',
        borderRadius: 9,
        background: 'var(--surface-2)',
        color: 'var(--ink-soft)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '3px 8px',
        font: '11px/1.35 var(--font-sans)',
      }}
    >
      {children}
    </div>
  );
}
