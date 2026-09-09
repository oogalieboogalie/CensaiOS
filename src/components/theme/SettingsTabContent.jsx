import React from 'react';
import { ThemeAppearanceContent } from './ThemeAppearanceContent.jsx';
import { WorkspaceSection } from './ThemeWorkspaceSection.jsx';
import { WorkspaceSharingSection } from './WorkspaceSharingSection.jsx';
import { VaultSection } from './VaultSection.jsx';

const scrollStyle = { overflowY: 'auto', flex: 1 };

export function SettingsTabContent({
  tab,
  panel,
  focusMode,
  setFocusMode,
  penMode,
  setPenMode,
  onResetWorkspace,
  onLogout,
  resetError = '',
}) {
  if (tab === 'appearance') return <ThemeAppearanceContent panel={panel} />;

  if (tab === 'workspace') {
    return (
      <div style={scrollStyle}>
        {resetError && <div role="alert" style={{ marginBottom: 10, color: 'var(--ps-red)', fontSize: 11 }}>{resetError}</div>}
        <WorkspaceSection
          focusMode={focusMode}
          setFocusMode={setFocusMode}
          penMode={penMode}
          setPenMode={setPenMode}
          onResetWorkspace={onResetWorkspace}
          onLogout={onLogout}
        />
      </div>
    );
  }

  if (tab === 'sharing') {
    return (
      <div style={scrollStyle}>
        <WorkspaceSharingSection />
      </div>
    );
  }

  return (
    <div style={scrollStyle}>
      <VaultSection />
    </div>
  );
}
