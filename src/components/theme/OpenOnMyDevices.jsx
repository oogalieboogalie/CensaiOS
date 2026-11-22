import React from 'react';
import { PhoneCode } from './tailnet/PhoneCode.jsx';
import { boardLinkAt, getTailnet } from '../../lib/tailnet/index.js';

import { SettingsButton, SettingsSection } from './settingsKit.jsx';

/**
 * Share panel: "Open on my phone or tablet". Shows a code that opens this
 * exact board on one of the owner's own switched-on Tailscale devices.
 * Nothing shows until My Tailscale devices is set up on this censaiOS.
 */
export function OpenOnMyDevices({ workspaceId }) {
  const [card, setCard] = React.useState(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    getTailnet()
      .then((data) => { if (live) setCard(data); })
      .catch(() => { /* no Tailscale answer: the row stays hidden */ });
    return () => { live = false; };
  }, []);

  if (!card?.canManage || card.usable !== true || !card.connected) return null;
  const link = card.on ? boardLinkAt(card.address, workspaceId) : '';
  const switchedOn = (card.devices || []).filter((device) => device.on).length;

  const ready = link && switchedOn > 0;
  return (
    <SettingsSection
      title="Open this board on my own devices"
      hint={ready
        ? 'Your phone, tablet and other computers on Tailscale open this board in one click.'
        : `Your phone, tablet and other computers on Tailscale can open this board in one click. ${link ? 'Switch a device on' : 'Turn it on'} in Open anywhere, under My Tailscale devices.`}
      data-testid="open-on-my-devices"
    >
      {ready && (
        <>
          <div className="hb-set-actions">
            <SettingsButton aria-expanded={shown} onClick={() => setShown((value) => !value)}>
              {shown ? 'Hide the code' : 'Open on my phone or tablet'}
            </SettingsButton>
          </div>
          {shown && (
            <PhoneCode link={link}>
              <p className="hb-set-hint">
                Scan with {switchedOn === 1 ? 'your switched-on device' : `one of your ${switchedOn} switched-on devices`}, with Tailscale on.
                This board opens, signed in as you. Any other device is refused.
              </p>
            </PhoneCode>
          )}
        </>
      )}
    </SettingsSection>
  );
}
