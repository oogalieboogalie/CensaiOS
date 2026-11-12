import React from 'react';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '8px 12px', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' };

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
    <div data-testid="tailnet-phone-code" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: 132, height: 132, flexShrink: 0, borderRadius: 'var(--radius-sm)', background: 'var(--on-fill)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {picture
          ? <img src={picture} alt="Code to scan with your phone or tablet" width={132} height={132} />
          : <span style={{ ...muted, color: 'var(--scrim)' }}>{failed ? 'No code' : '…'}</span>}
      </div>
      <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 170 }}>
        {children}
        <div data-testid="tailnet-phone-link" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', wordBreak: 'break-all' }}>{link}</div>
        <div><button type="button" style={button} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div>
        {failed ? <p style={muted}>The code could not be drawn. Open the link above on the device instead.</p> : null}
      </div>
    </div>
  );
}
