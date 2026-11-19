import React from 'react';

import { SettingsButton, SettingsNote } from '../settingsKit.jsx';

/**
 * A code to scan with a phone or tablet, next to the same link as text.
 * The link is this computer's Tailscale address, so it never runs out and
 * holds no secret: a device that is not switched on is refused anyway.
 * The QR library loads when the code is first shown.
 */
export function PhoneCode({ link, children }) {
  const [picture, setPicture] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    setPicture('');
    setFailed(false);
    if (!link) return undefined;
    import('qrcode')
      .then((mod) => (mod.default || mod).toDataURL(link, { margin: 1, width: 232 }))
      .then((url) => { if (live) setPicture(url); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [link]);

  async function copy() {
    try {
      await globalThis.navigator?.clipboard?.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!link) return null;
  return (
    <div data-testid="tailnet-phone-code" className="hb-set-inline hb-set-qr">
      <span className="hb-set-qr-box">
        {picture
          ? <img src={picture} alt="Code to scan with your phone or tablet" width={132} height={132} />
          : <span className="hb-set-hint">{failed ? 'No code' : '...'}</span>}
      </span>
      <div className="hb-set-group">
        {children}
        <span data-testid="tailnet-phone-link" className="hb-set-mono">{link}</span>
        <span><SettingsButton small onClick={copy}>{copied ? 'Copied' : 'Copy link'}</SettingsButton></span>
        {failed ? <SettingsNote tone="warn">The code could not be drawn. Open the link above on the device instead.</SettingsNote> : null}
      </div>
    </div>
  );
}
