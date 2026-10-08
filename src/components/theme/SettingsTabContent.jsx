import React from 'react';
import { ThemeAppearanceContent } from './ThemeAppearanceContent.jsx';
import { WorkspaceSection } from './ThemeWorkspaceSection.jsx';
import { WorkspaceSharingSection } from './WorkspaceSharingSection.jsx';
import { VaultSection } from './VaultSection.jsx';
import { MarketplaceWindow } from '../MarketplaceWindow.jsx';

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
        {resetError && <div role="alert" style={{ marginBottom: 10, color: 'var(--ps-red)', fontSize: 'var(--text-xs)' }}>{resetError}</div>}
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

  // Spec 6: which modules a board offers. Adding them lives in the Add palette.
  if (tab === 'modules') {
    return (
      <div style={{ ...scrollStyle, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-settings-modules>
        <MarketplaceWindow />
      </div>
    );
  }

  return (
    <div style={scrollStyle}>
      <VaultSection />
    </div>
  );
}
