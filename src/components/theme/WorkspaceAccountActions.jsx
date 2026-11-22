import React from 'react';
import { SettingsButton, SettingsRow, SettingsRows, SettingsSection } from './settingsKit.jsx';

/** Settings > Canvas: the two big ones, kept apart from everyday settings. */
export function WorkspaceAccountActions({ onResetWorkspace, onLogout, note }) {
  if (!onResetWorkspace && !onLogout) return null;
  return (
    <SettingsSection title="This board and your account" data-testid="workspace-account">
      <SettingsRows>
        {onResetWorkspace && (
          <SettingsRow label="Reset this board" hint="Takes every window and every designed agent off this board. censaiOS asks first.">
            <SettingsButton variant="danger" onClick={onResetWorkspace}>Reset board</SettingsButton>
          </SettingsRow>
        )}
        {onLogout && (
          <SettingsRow label="Log out" hint="Signs you out of censaiOS on this device.">
            <SettingsButton onClick={onLogout}>Log out</SettingsButton>
          </SettingsRow>
        )}
      </SettingsRows>
      {note}
    </SettingsSection>
  );
}
