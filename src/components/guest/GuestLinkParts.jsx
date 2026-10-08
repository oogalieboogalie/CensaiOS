// Pieces of the Share settings for guest links: option lists, styles, the
// per-browser token memory, a copyable link field and the "who joined" list.

import React from 'react';
import { api } from '../../lib/api.js';

// The raw token is only returned when a link is created. Keep a copy in this
// browser so the owner can copy it again later; other devices see "Copy"
// greyed out and can make a new link instead.
export const TOKEN_STORAGE_KEY = 'homebase.shareTokens.v1';

export function readTokens() {
  try { return JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}

export function rememberToken(linkId, token) {
  try {
    const tokens = readTokens();
    tokens[linkId] = token;
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch { /* storage unavailable: the link still works, it just can't be re-copied here */ }
}

export const ROLE_LABELS = { view: 'Can view', comment: 'Can comment', edit: 'Can edit' };
export const EXPIRY_OPTIONS = [
  { value: '', label: 'Never expires' },
  { value: '1', label: 'Expires in 1 hour' },
  { value: '24', label: 'Expires in 24 hours' },
  { value: '168', label: 'Expires in 7 days' },
];
export const BUDGET_OPTIONS = [
  { value: '0', label: 'Agents off' },
  { value: '20000', label: 'Agents: 20k tokens' },
  { value: '100000', label: 'Agents: 100k tokens' },
];

export const fieldStyle = {
  minWidth: 0, width: '100%', boxSizing: 'border-box', padding: '7px 9px',
  borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)',
  background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--text-xs)',
};
export const ghostButton = {
  border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '6px 9px',
  background: 'var(--surface-2)', color: 'var(--ink-soft)', font: 'inherit', fontSize: 'var(--text-xs)',
  fontWeight: 600, cursor: 'pointer',
};
export const primaryButton = { ...ghostButton, border: 0, background: 'var(--accent)', color: 'var(--on-fill)' };
export const labelStyle = { fontSize: 'var(--text-xs)', fontWeight: 650, color: 'var(--ink)' };
export const hintStyle = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' };

export function scopeLabel(link, wins, groups) {
  if (link.scopeKind === 'window') {
    const win = wins.find((entry) => String(entry.id) === String(link.scopeId));
    return `Window: ${win?.title || win?.kind || 'removed'}`;
  }
  if (link.scopeKind === 'group') {
    const group = groups.find((entry) => String(entry.id) === String(link.scopeId));
    return `Group: ${group?.title || group?.name || 'removed'}`;
  }
  return 'Whole board';
}

export function statusOf(link) {
  if (link.revokedAt) return 'Turned off';
  if (!link.active) return 'Expired';
  return 'Active';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyField({ url, testId }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input aria-label="Share link" data-testid={testId} readOnly value={url} onFocus={(event) => event.target.select()} style={{ ...fieldStyle, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }} />
      <button type="button" onClick={async () => { setCopied(await copyText(url)); setTimeout(() => setCopied(false), 1500); }} style={primaryButton}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function JoinList({ workspaceId, linkId }) {
  const [joins, setJoins] = React.useState(null);
  React.useEffect(() => {
    api.listShareLinkJoins(workspaceId, linkId).then((result) => setJoins(result.joins || [])).catch(() => setJoins([]));
  }, [workspaceId, linkId]);
  if (!joins) return <div style={hintStyle}>Loading…</div>;
  if (joins.length === 0) return <div style={hintStyle}>Nobody has joined through this link yet.</div>;
  return (
    <div data-testid="share-link-joins" style={{ display: 'grid', gap: 3 }}>
      {joins.map((join) => (
        <div key={`${join.guestId}-${join.joinedAt}`} style={{ display: 'flex', gap: 8, fontSize: 'var(--text-xs)' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, marginTop: 4, borderRadius: 'var(--radius-full)', background: join.color || 'var(--accent)' }} />
          <span style={{ color: 'var(--ink)' }}>{join.name}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>{new Date(join.joinedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Share dialog (spec 5): links with a role and a scope, expiry, passcode and
 * agent budget; the list of links with who joined; and Go live for shows.
 */
