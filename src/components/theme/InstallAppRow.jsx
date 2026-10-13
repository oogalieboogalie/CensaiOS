import React from 'react';
import { canOfferInstall, installApp, onInstallOffer, runningAsInstalledApp } from '../../lib/webOs.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };

// "Install as an app": the browser's own offer to give censaiOS its own
// window and taskbar icon, full screen with no browser bars.
export function InstallAppRow() {
  const [offer, setOffer] = React.useState(canOfferInstall());
  const installed = runningAsInstalledApp();

  React.useEffect(() => onInstallOffer(setOffer), []);

  return (
    <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--hairline)', paddingTop: 12 }} data-testid="install-app">
      <div style={{ fontWeight: 650, color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>Its own window</div>
      {installed ? (
        <p style={muted}>You are using censaiOS as an installed app.</p>
      ) : offer ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => installApp()}
            style={{ border: 0, borderRadius: 'var(--radius-md)', padding: '8px 12px', background: 'var(--accent-line)', color: 'var(--surface)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
          >
            Install as an app
          </button>
          <span style={muted}>Opens full screen with its own taskbar icon.</span>
        </div>
      ) : (
        <p style={muted}>
          To give censaiOS its own window, use your browser's menu: Install censaiOS, or Add to Home Screen on a phone.
          Browsers offer this on this computer's own address; on other computers a bookmark works the same way.
        </p>
      )}
    </div>
  );
}
