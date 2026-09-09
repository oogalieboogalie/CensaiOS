// src/components/registry/InstalledTab.jsx
// D4 RegistryWindow tab 2 — list of installed cards with Call / Uninstall.

import React from 'react';

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function InstalledTab({
  installed, onUninstall, onCall, canCall = true, canManage = true, busyIds = new Set(),
}) {
  const ids = Object.keys(installed);
  if (ids.length === 0) {
    return (
      <div data-testid="registry-installed-empty" style={{ padding: 18, color: 'var(--ink-faint)', fontSize: 12, textAlign: 'center', border: '1px dashed var(--hairline)', borderRadius: 8, margin: 12 }}>
        Nothing installed yet — install from Browse.
      </div>
    );
  }
  return (
    <div style={{ padding: 12, display: 'grid', gap: 8, flex: 1, minHeight: 0, overflow: 'auto' }} data-testid="registry-installed-list">
      {ids.map((cardId) => {
        const meta = installed[cardId];
        return (
          <div key={cardId} data-testid="registry-installed-row" data-card-id={cardId} style={{ border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)', padding: 10, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{cardId}</strong>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>installed {fmtTime(meta?.installedAt)}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" data-testid="registry-call" disabled={!canCall} title={!canCall ? 'Open a workspace to call AgentCards.' : undefined} onClick={() => onCall(cardId)} style={{ all: 'unset', cursor: canCall ? 'pointer' : 'default', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--hairline)', background: canCall ? 'var(--accent-soft)' : 'var(--surface)', color: canCall ? 'var(--accent-ink)' : 'var(--ink-faint)', fontSize: 11.5, fontWeight: 600 }}>
                Call
              </button>
              <button
                type="button"
                data-testid="registry-uninstall"
                disabled={!canManage || busyIds.has(cardId)}
                onClick={() => onUninstall(cardId)}
                style={{ all: 'unset', cursor: canManage ? 'pointer' : 'default', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface)', color: canManage ? 'var(--ink)' : 'var(--ink-faint)', fontSize: 11.5 }}
              >
                {busyIds.has(cardId) ? 'Removing…' : 'Remove pin'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
