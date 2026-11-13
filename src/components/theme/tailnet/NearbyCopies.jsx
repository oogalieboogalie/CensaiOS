import React from 'react';
import { getNearbyCopies, openCopy } from '../../../lib/tailnet/index.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const button = { border: 0, borderRadius: 'var(--radius-md)', padding: '7px 12px', background: 'var(--accent-line)', color: 'var(--surface)', font: 'inherit', fontWeight: 700, cursor: 'pointer' };

/** Other copies of censaiOS on the tailnet, each with an Open button. */
export function NearbyCopies() {
  const [copies, setCopies] = React.useState(null);
  const [opening, setOpening] = React.useState('');

  React.useEffect(() => {
    let live = true;
    getNearbyCopies({ fresh: true })
      .then((data) => { if (live) setCopies(Array.isArray(data?.copies) ? data.copies : []); })
      .catch(() => { if (live) setCopies([]); });
    return () => { live = false; };
  }, []);

  async function open(copy) {
    setOpening(copy.id);
    try {
      const how = await openCopy(copy);
      logToApp('info', 'tailnet: opened another copy', { where: 'tailnet', how });
    } finally {
      setOpening('');
    }
  }

  if (!copies?.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }} data-testid="tailnet-nearby">
      <div style={{ fontWeight: 650, color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>censaiOS on your other computers</div>
      {copies.map((copy) => (
        <div key={copy.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 650, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{copy.name}</div>
            <p style={muted}>
              {copy.ready
                ? 'Open its board here. One click, no code.'
                : `This computer is not switched on there yet. On ${copy.name}: Settings, Open anywhere, My Tailscale devices.`}
            </p>
          </div>
          {copy.ready ? (
            <button type="button" style={{ ...button, opacity: opening === copy.id ? 0.5 : 1 }} disabled={opening === copy.id} onClick={() => open(copy)}>
              {opening === copy.id ? 'Opening…' : 'Open'}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
