import React from 'react';
import { canOfferInstall, installApp, onInstallOffer, runningAsInstalledApp } from '../../lib/webOs.js';
import { SettingsButton, SettingsRow, SettingsSection } from './settingsKit.jsx';

// "Install as an app": the browser's own offer to give censaiOS its own
// window and taskbar icon, full screen with no browser bars.
export function InstallAppRow() {
  const [offer, setOffer] = React.useState(canOfferInstall());
  const installed = runningAsInstalledApp();

  React.useEffect(() => onInstallOffer(setOffer), []);

  return (
    <SettingsSection title="Its own window" data-testid="install-app">
      {installed ? (
        <p className="hb-set-hint">You are using censaiOS as an installed app.</p>
      ) : offer ? (
        <SettingsRow label="Install as an app" hint="Opens full screen with its own taskbar icon.">
          <SettingsButton variant="primary" onClick={() => installApp()}>Install as an app</SettingsButton>
        </SettingsRow>
      ) : (
        <p className="hb-set-hint">
          To give censaiOS its own window, use your browser&apos;s menu: Install censaiOS, or Add to Home Screen on a phone.
          Browsers offer this on this computer&apos;s own address. On other computers a bookmark works the same way.
        </p>
      )}
    </SettingsSection>
  );
}
