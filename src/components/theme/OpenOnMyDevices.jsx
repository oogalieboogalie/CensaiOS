import React from 'react';
import { PhoneCode } from './tailnet/PhoneCode.jsx';
import { boardLinkAt, getTailnet } from '../../lib/tailnet/index.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '9px 12px', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' };

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

  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="open-on-my-devices">
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>Open on my own devices</div>
      {!link || switchedOn === 0 ? (
        <p style={muted}>
          Your phone, tablet and other computers on Tailscale can open this board in one click.
          {link ? ' Switch a device on' : ' Turn it on'} in Settings, Open anywhere, My Tailscale devices.
        </p>
      ) : (
        <>
          <div>
            <button type="button" style={button} aria-expanded={shown} onClick={() => setShown((value) => !value)}>
              {shown ? 'Hide the code' : 'Open on my phone or tablet'}
            </button>
          </div>
          {shown && (
            <PhoneCode link={link}>
              <p style={muted}>
                Scan with {switchedOn === 1 ? 'your switched-on device' : `one of your ${switchedOn} switched-on devices`}, with Tailscale on.
                This board opens, signed in as you. Any other device is refused.
              </p>
            </PhoneCode>
          )}
        </>
      )}
    </div>
  );
}
