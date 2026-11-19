import React from 'react';
import { getNearbyCopies, openCopy } from '../../../lib/tailnet/index.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';

import { SettingsButton, SettingsGroup } from '../settingsKit.jsx';

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
    <SettingsGroup title="censaiOS on your other computers" data-testid="tailnet-nearby">
      <ul className="hb-set-list">
        {copies.map((copy) => (
          <li key={copy.id} className="hb-set-item">
            <span className="hb-set-item-main">
              <span className="hb-set-label">{copy.name}</span>
              <span className="hb-set-hint">
                {copy.ready
                  ? 'Open its board here. One click, no code.'
                  : `This computer is not switched on there yet. On ${copy.name}: Settings, Open anywhere, My Tailscale devices.`}
              </span>
            </span>
            {copy.ready ? (
              <SettingsButton variant="primary" disabled={opening === copy.id} onClick={() => open(copy)}>
                {opening === copy.id ? 'Opening...' : 'Open'}
              </SettingsButton>
            ) : null}
          </li>
        ))}
      </ul>
    </SettingsGroup>
  );
}
