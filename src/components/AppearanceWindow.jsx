import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useThemePanel } from './theme/useThemePanel.js';
import { SettingsTabContent } from './theme/SettingsTabContent.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { api } from '../lib/api.js';
import { resetWorkspaceAndReload } from './theme/workspaceReset.js';

export function AppearanceWindow({ win, onUpdate, workspaceRevision }) {
  const panel = useThemePanel(win.settingsTab, win.settingsRequestId);
  const { tab, setTab, tabs } = panel;
  const [resetError, setResetError] = React.useState('');

  const { focusMode, setFocusMode, penMode, setPenMode } = useWorkspaceStore();

  const onResetWorkspace = async () => {
    if (!confirm('Clear all windows + designed agents?')) return;
    setResetError('');
    try {
      await resetWorkspaceAndReload({
        expectedRevision: workspaceRevision,
        resetWorkspace: api.resetWorkspace,
        reload: () => window.location.reload(),
      });
    } catch (error) {
      setResetError(error.message || 'Workspace reset failed.');
    }
  };

  const onLogout = async () => {
    if (confirm('Log out from Censai?')) {
      await api.logout();
      window.location.reload();
    }
  };

  return (
    <>
      <WindowTitle
        accent="var(--accent)"
        icon={<Icon.Gear size={14} />}
        label={win.title || 'Settings'}
        subtitle={win.subtitle || 'Appearance, canvas, sharing, and AI keys'}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 650,
                color: tab === t.id ? 'var(--accent-ink)' : 'var(--ink-soft)',
                background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
                transition: 'background 0.15s, color 0.15s'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <SettingsTabContent
            tab={tab}
            panel={panel}
            focusMode={focusMode}
            setFocusMode={setFocusMode}
            penMode={penMode}
            setPenMode={setPenMode}
            onResetWorkspace={onResetWorkspace}
            onLogout={onLogout}
            resetError={resetError}
          />
        </div>
      </div>
    </>
  );
}

export default AppearanceWindow;
