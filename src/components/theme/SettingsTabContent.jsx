import React from 'react';
import { ThemeAppearanceContent } from './ThemeAppearanceContent.jsx';
import { WorkspaceSection } from './ThemeWorkspaceSection.jsx';
import { WorkspaceSharingSection } from './WorkspaceSharingSection.jsx';
import { VaultSection } from './VaultSection.jsx';
import { KeySharingSection } from './KeySharingSection.jsx';
import { OpenAnywhereSection } from './openAnywhereLazy.js';
import { MarketplaceWindow } from '../MarketplaceWindow.jsx';
import { YorSecurityCard } from '../yorware/YorSecurity.jsx';
import { TrustModeSection } from './TrustModeSection.jsx';
import { SpeakUpSection } from './SpeakUpSection.jsx';
import { WakeUpSection } from './WakeUpSection.jsx';
import { SelfFixSection } from './SelfFixSection.jsx';
import { HotkeysSection } from './HotkeysSection.jsx';

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

  // Trust mode: agents act on their own unless the board or one agent asks first.
  if (tab === 'agents') {
    return (
      <div style={scrollStyle}>
        <TrustModeSection />
        <div style={{ height: 12 }} />
        <SpeakUpSection />
        <div style={{ height: 12 }} />
        <WakeUpSection />
        <div style={{ height: 12 }} />
        <SelfFixSection />
      </div>
    );
  }

  // Alt keys that open a coding agent terminal (Claude Code, Codex, Copilot…).
  if (tab === 'hotkeys') {
    return (
      <div style={scrollStyle}>
        <HotkeysSection />
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

  // Web OS: other computers open this board by address; install as an app.
  if (tab === 'anywhere') {
    return (
      <div style={scrollStyle}>
        <React.Suspense fallback={<p style={{ margin: 0, color: 'var(--ink-faint)', fontSize: 'var(--text-sm)' }}>Loading...</p>}>
          <OpenAnywhereSection />
        </React.Suspense>
        <YorSecurityCard />
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
      <KeySharingSection />
    </div>
  );
}
