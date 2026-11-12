import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { DeviceRows } from './tailnet/DeviceRows.jsx';
import { NearbyCopies } from './tailnet/NearbyCopies.jsx';
import { PhoneCode } from './tailnet/PhoneCode.jsx';
import { getTailnet, saveTailnet, whyNotConnected } from '../../lib/tailnet/index.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '8px 12px', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' };
const heading = { fontWeight: 650, color: 'var(--ink)', fontSize: 'var(--text-sm)' };

const PORT_PROBLEMS = {
  'port-busy': 'Another program on this computer is using the port censaiOS needs for your devices, so they can\'t connect yet. Close that program, or restart censaiOS.',
  'could-not-open': 'censaiOS could not open its port for your devices. If Windows asks whether to allow censaiOS on the network, choose Allow.',
};

function otherPersons(device) {
  return !device.mine && !device.shared;
}

/**
 * "My Tailscale devices" (Settings, Open anywhere): the owner's switch and
 * the list of devices on their tailnet. A switched-on device opens this
 * censaiOS in one click with no code; anything else is refused.
 */
export function TailnetSection() {
  const [card, setCard] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [showCode, setShowCode] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    getTailnet()
      .then((data) => { if (live) setCard(data); })
      .catch(() => { /* no answer: the card stays hidden */ });
    return () => { live = false; };
  }, []);

  async function save(patch) {
    setError('');
    setBusy(true);
    try {
      setCard(await saveTailnet(patch));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function switchDevice(device, on) {
    if (on && otherPersons(device)) {
      const who = device.owner || 'someone else';
      const sure = globalThis.confirm?.(`${device.name} is signed in to Tailscale as ${who}. Switched on, it opens this censaiOS as you. Switch it on?`);
      if (!sure) return;
    }
    save({ devices: { [device.id]: on } });
  }

  // A copy at its own web address has no use for this, and only the owner sees their devices.
  if (!card || card.usable !== true || !Array.isArray(card.devices) || !card.canManage) return null;

  const switchedOn = card.devices.filter((device) => device.on).length;
  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 14, marginTop: 12 }} data-testid="tailnet-section">
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>My Tailscale devices</div>
        <p style={{ ...muted, marginTop: 3 }}>
          Your own phone, tablet and other computers on Tailscale open this censaiOS in one click, at home or away, with no code to type.
          Only the devices you switch on here get in.
        </p>
      </div>
      {error && <p role="alert" style={{ ...muted, color: 'var(--ps-red)' }}>{error}</p>}
      {!card.connected ? (
        <p style={muted} data-testid="tailnet-not-connected">{whyNotConnected(card.reason)}</p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ ...row, cursor: busy ? 'default' : 'pointer', fontWeight: 650, color: 'var(--ink)' }}>
              <input type="checkbox" role="switch" checked={card.on} disabled={busy} onChange={(event) => save({ on: event.target.checked })} />
              Let my Tailscale devices open censaiOS
            </label>
            <p style={muted}>
              {card.on
                ? `On. ${switchedOn === 0 ? 'No device is switched on yet.' : switchedOn === 1 ? '1 device is switched on.' : `${switchedOn} devices are switched on.`} A switched-on device opens the board as you.`
                : 'Off. No Tailscale device gets in without a code.'}
            </p>
          </div>
          {card.on && (
            <>
              {PORT_PROBLEMS[card.portProblem] ? <p role="alert" style={{ ...muted, color: 'var(--ps-red)' }}>{PORT_PROBLEMS[card.portProblem]}</p> : null}
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={heading}>Devices on your tailnet</div>
                <DeviceRows devices={card.devices} disabled={busy} onSwitch={switchDevice} />
              </div>
              {card.address ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={row}>
                    <button type="button" style={button} aria-expanded={showCode} onClick={() => setShowCode((shown) => !shown)}>
                      {showCode ? 'Hide the code' : 'Open on a phone or tablet'}
                    </button>
                    <span style={muted}>{card.thisComputer?.name ? `This computer on Tailscale: ${card.thisComputer.name}` : ''}</span>
                  </div>
                  {showCode && (
                    <PhoneCode link={`${card.address}/`}>
                      <p style={muted}>
                        Scan this with a device that is switched on above, with Tailscale on. The board opens. Nothing to type, and the code never runs out.
                      </p>
                    </PhoneCode>
                  )}
                </div>
              ) : null}
              <NearbyCopies />
            </>
          )}
        </>
      )}
    </ThemePanelCard>
  );
}
