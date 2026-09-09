/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

const badge = {
  border: '1px solid var(--hairline)', borderRadius: 999, padding: '2px 7px',
  fontSize: 10, color: 'var(--ink-soft)', whiteSpace: 'nowrap',
};

export function ToolPackagesTab({ packages, ready, canManage, busyIds, onInstall, onRemove }) {
  if (!ready) return <div role="status" style={{ padding: 18, color: 'var(--ink-soft)' }}>Loading add-ons…</div>;
  return (
    <div data-testid="registry-packages" style={{ padding: 10, display: 'grid', gap: 8, overflow: 'auto' }}>
      <div style={{ color: 'var(--ink-soft)', fontSize: 11, padding: '2px 2px 6px' }}>
        Install makes a reviewed add-on available to this workspace. It grants no agent tools until equipped.
      </div>
      {packages.map(pkg => {
        const busy = busyIds.has(pkg.id);
        const module = pkg.module || {};
        return (
          <div key={pkg.id} data-testid="registry-package-row" data-package-id={pkg.id}
            style={{ border: '1px solid var(--hairline)', borderRadius: 9, padding: 10, background: 'var(--surface-2)', display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <strong style={{ fontSize: 12.5 }}>{pkg.name}</strong>
              <code style={{ color: 'var(--ink-faint)', fontSize: 9.5 }}>v{pkg.version}</code>
              <span style={{ ...badge, marginLeft: 'auto', color: pkg.installed ? 'var(--accent)' : 'var(--ink-soft)' }}>
                {pkg.installed ? 'installed' : 'available'}
              </span>
            </div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{pkg.description}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <span style={badge}>{pkg.publisher?.name}</span>
              <span style={badge}>{module.risk}</span>
              <span style={badge}>{module.mode?.replaceAll('_', ' ')}</span>
              <span style={badge}>{module.tools?.length || 0} tools</span>
            </div>
            <div>
              <button type="button" data-testid={pkg.installed ? 'registry-package-remove' : 'registry-package-install'}
                disabled={!canManage || busy}
                onClick={() => pkg.installed ? onRemove(pkg.id) : onInstall(pkg.id)}
                style={{ all: 'unset', cursor: canManage && !busy ? 'pointer' : 'default', padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--hairline)', background: pkg.installed ? 'var(--surface)' : 'var(--accent-soft)',
                  color: canManage ? (pkg.installed ? 'var(--ink)' : 'var(--accent-ink)') : 'var(--ink-faint)', fontSize: 11.5 }}>
                {busy ? 'Saving…' : pkg.installed ? 'Remove' : 'Install'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
