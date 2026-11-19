import React from 'react';
import { DeviceRows } from './tailnet/DeviceRows.jsx';
import { NearbyCopies } from './tailnet/NearbyCopies.jsx';
import { PhoneCode } from './tailnet/PhoneCode.jsx';
import { getTailnet, saveTailnet, whyNotConnected } from '../../lib/tailnet/index.js';

import { SettingsButton, SettingsGroup, SettingsNote, SettingsSection, SwitchRow } from './settingsKit.jsx';

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
    <SettingsSection
      title="My Tailscale devices"
      hint="Your own phone, tablet and other computers on Tailscale open this censaiOS in one click, at home or away, with no code to type. Only the devices you switch on here get in."
      data-testid="tailnet-section"
    >
      <SettingsNote tone="error">{error}</SettingsNote>
      {!card.connected ? (
        <SettingsNote data-testid="tailnet-not-connected">{whyNotConnected(card.reason)}</SettingsNote>
      ) : (
        <>
          <SwitchRow
            label="Let my Tailscale devices open censaiOS"
            hint={card.on
              ? `On. ${switchedOn === 0 ? 'No device is switched on yet.' : switchedOn === 1 ? '1 device is switched on.' : `${switchedOn} devices are switched on.`} A switched-on device opens the board as you.`
              : 'Off. No Tailscale device gets in without a code.'}
            checked={card.on}
            disabled={busy}
            onChange={(on) => save({ on })}
          />
          {card.on && (
            <>
              {PORT_PROBLEMS[card.portProblem] ? <SettingsNote tone="error">{PORT_PROBLEMS[card.portProblem]}</SettingsNote> : null}
              <SettingsGroup title="Devices on your tailnet">
                <DeviceRows devices={card.devices} disabled={busy} onSwitch={switchDevice} />
              </SettingsGroup>
              {card.address ? (
                <SettingsGroup
                  title="Open on a phone or tablet"
                  hint={card.thisComputer?.name ? `This computer on Tailscale: ${card.thisComputer.name}` : undefined}
                >
                  <div className="hb-set-actions">
                    <SettingsButton aria-expanded={showCode} onClick={() => setShowCode((shown) => !shown)}>
                      {showCode ? 'Hide the code' : 'Open on a phone or tablet'}
                    </SettingsButton>
                  </div>
                  {showCode && (
                    <PhoneCode link={`${card.address}/`}>
                      <p className="hb-set-hint">
                        Scan this with a device that is switched on above, with Tailscale on. The board opens. Nothing to type, and the code never runs out.
                      </p>
                    </PhoneCode>
                  )}
                </SettingsGroup>
              ) : null}
              <NearbyCopies />
            </>
          )}
        </>
      )}
    </SettingsSection>
  );
}
