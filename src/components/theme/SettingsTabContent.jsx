import React from 'react';
import { ThemeAppearanceContent } from './ThemeAppearanceContent.jsx';
import { WorkspaceSection } from './ThemeWorkspaceSection.jsx';
import { WorkspaceSharingSection } from './WorkspaceSharingSection.jsx';
import { FriendsSection } from './FriendsSection.jsx';
import { SignInDomainsSection } from './SignInDomainsSection.jsx';
import { VaultSection } from './VaultSection.jsx';
import { KeySharingSection } from './KeySharingSection.jsx';
import { OpenAnywhereSection, TailnetSection } from './openAnywhereLazy.js';
import { MarketplaceWindow } from '../MarketplaceWindow.jsx';
import { YorSecurityCard } from '../yorware/YorSecurity.jsx';
import { TrustModeSection } from './TrustModeSection.jsx';
import { SpeakUpSection } from './SpeakUpSection.jsx';
import { WakeUpSection } from './WakeUpSection.jsx';
import { SelfFixSection } from './SelfFixSection.jsx';
import { HotkeysSection } from './HotkeysSection.jsx';
import { DesktopServerCard } from './DesktopServerCard.jsx';
import { SettingsNote, SettingsPage, SettingsSection } from './settingsKit.jsx';
import { settingsTabIntro } from './settingsTabs.js';

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
  const intro = settingsTabIntro(tab);

  if (tab === 'appearance') return <ThemeAppearanceContent panel={panel} intro={intro} />;

  if (tab === 'workspace') {
    return (
      <SettingsPage intro={intro}>
        <WorkspaceSection
          focusMode={focusMode}
          setFocusMode={setFocusMode}
          penMode={penMode}
          setPenMode={setPenMode}
          onResetWorkspace={onResetWorkspace}
          onLogout={onLogout}
          accountNote={resetError ? <SettingsNote tone="error">{resetError}</SettingsNote> : null}
        />
      </SettingsPage>
    );
  }

  if (tab === 'agents') {
    return (
      <SettingsPage intro={intro}>
        <TrustModeSection />
        <SpeakUpSection />
        <WakeUpSection />
        <SelfFixSection />
      </SettingsPage>
    );
  }

  if (tab === 'hotkeys') {
    return (
      <SettingsPage intro={intro}>
        <HotkeysSection />
      </SettingsPage>
    );
  }

  if (tab === 'sharing') {
    return (
      <SettingsPage intro={intro}>
        <WorkspaceSharingSection />
        <FriendsSection />
        <SignInDomainsSection />
      </SettingsPage>
    );
  }

  if (tab === 'anywhere') {
    return (
      <SettingsPage intro={intro}>
        <React.Suspense fallback={<SettingsNote>Loading...</SettingsNote>}>
          <OpenAnywhereSection />
          <TailnetSection />
        </React.Suspense>
        <DesktopServerCard />
        <YorSecurityCard />
      </SettingsPage>
    );
  }

  if (tab === 'modules') {
    return (
      <SettingsPage intro={intro} data-settings-modules>
        <SettingsSection className="hb-set-section--flush">
          <MarketplaceWindow />
        </SettingsSection>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage intro={intro}>
      <VaultSection />
      <KeySharingSection />
    </SettingsPage>
  );
}
