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
    if (!confirm('Clear every window and every designed agent from this board?')) return;
    setResetError('');
    try {
      await resetWorkspaceAndReload({
        expectedRevision: workspaceRevision,
        resetWorkspace: api.resetWorkspace,
        reload: () => window.location.reload(),
      });
    } catch (error) {
      setResetError(error.message || 'The board was not reset. Try again.');
    }
  };

  const onLogout = async () => {
    if (!confirm('Log out of censaiOS on this device?')) return;
    setResetError('');
    try {
      await api.logout();
      window.location.reload();
    } catch (error) {
      setResetError(error.message || 'You are still signed in. Try again.');
    }
  };

  return (
    <>
      <WindowTitle
        accent="var(--accent)"
        icon={<Icon.Gear size={14} />}
        label={win.title || 'Settings'}
        subtitle={win.subtitle}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
        <nav className="hb-set-tabs" aria-label="Settings sections">
          {tabs.map(t => (
            <button key={t.id} type="button" className="hb-set-tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
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
    </>
  );
}

export default AppearanceWindow;
