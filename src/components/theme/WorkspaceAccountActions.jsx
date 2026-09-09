import React from 'react';
import { Icon } from '../Icons.jsx';
import { ThemePanelCard } from './ThemeControls.jsx';

export function WorkspaceAccountActions({ onResetWorkspace, onLogout }) {
  if (!onResetWorkspace && !onLogout) return null;

  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 11 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--ink)' }}>Workspace & account</div>
        <div style={{ marginTop: 3, fontSize: 11, color: 'var(--ink-faint)' }}>Recovery and sign-in actions live here, away from everyday canvas controls.</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {onResetWorkspace && (
          <button onClick={onResetWorkspace} style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--surface)', color: 'var(--ps-red)', border: '1px solid var(--ps-red)' }}>
            <Icon.Close size={13} />
            Reset workspace
          </button>
        )}
        {onLogout && (
          <button onClick={onLogout} style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--surface)', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}>
            <Icon.NewWindow size={13} />
            Log out
          </button>
        )}
      </div>
    </ThemePanelCard>
  );
}
