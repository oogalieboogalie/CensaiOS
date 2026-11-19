import React from 'react';
import QRCode from 'qrcode';
import { YorName } from '../yorware/YorSecurity.jsx';
import {
  addressesFor,
  getOpenAnywhere,
  makePairCode,
  pairLink,
  saveOpenAnywhere,
} from '../../lib/webOs.js';
import { InstallAppRow } from './InstallAppRow.jsx';
import { SettingsButton, SettingsGroup, SettingsNote, SettingsSection, SwitchRow, useSaveNote } from './settingsKit.jsx';

// Browsers only offer the clipboard on https or this computer's own address,
// so on a plain Wi-Fi address there is none: say so instead of "Copied.".
async function copy(text) {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.writeText) throw new Error('No clipboard here.');
  await clipboard.writeText(text);
}

function AddComputer({ address, enabled }) {
  const [pair, setPair] = React.useState(null);
  const [error, setError] = React.useState('');

  async function make() {
    setError('');
    try {
      const result = await makePairCode();
      const link = pairLink(address, result.code);
      const qr = await QRCode.toDataURL(link, { margin: 1, width: 196 });
      setPair({ link, qr, expiresAt: result.expiresAt });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <SettingsGroup title="Add a computer" hint={enabled ? 'Makes a code the other device scans or opens to sign in as you.' : 'Turn on the switch above first.'} data-testid="add-computer">
      <div className="hb-set-actions">
        <SettingsButton variant="primary" disabled={!enabled} onClick={make}>{pair ? 'Make a new code' : 'Add a computer'}</SettingsButton>
      </div>
      <SettingsNote tone="error">{error}</SettingsNote>
      {pair && (
        <div className="hb-set-inline hb-set-qr">
          <img src={pair.qr} alt="Code to scan with the other device" width={140} height={140} />
          <div className="hb-set-group">
            <p className="hb-set-hint">Scan this with the other device, or open this link there. It works once, for ten minutes.</p>
            <span className="hb-set-mono" data-testid="pair-link">{pair.link}</span>
            <CopyButton text={pair.link} label="Copy link" />
          </div>
        </div>
      )}
    </SettingsGroup>
  );
}

function CopyButton({ text, label = 'Copy' }) {
  const { note, run } = useSaveNote();
  return (
    <span className="hb-set-inline">
      <SettingsButton small onClick={() => run(() => copy(text), 'Copied.')}>{label}</SettingsButton>
      <SettingsNote note={note?.tone === 'error' ? { tone: 'error', text: 'Copy did not work. Select the text and copy it.' } : note} />
    </span>
  );
}

function AddressList({ addresses, status, onSaveName }) {
  const [name, setName] = React.useState(status.address || '');
  return (
    <SettingsGroup title="Type one of these on the other computer" hint="On Windows the computer's name is in Settings, System, About, Device name.">
      {addresses.length === 0 && <SettingsNote>censaiOS can&apos;t see this computer&apos;s name from inside Docker. Type it below.</SettingsNote>}
      {addresses.length > 0 && (
        <ul className="hb-set-list">
          {addresses.map((address) => (
            <li key={address} className="hb-set-item">
              <span className="hb-set-item-main hb-set-mono" data-testid="open-anywhere-address">{address}</span>
              <CopyButton text={address} />
            </li>
          ))}
        </ul>
      )}
      {status.canManage && (
        <form className="hb-set-inline" onSubmit={(e) => { e.preventDefault(); onSaveName(name); }}>
          <input aria-label="This computer's name" className="hb-set-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="This computer's name, like officepc" />
          <SettingsButton type="submit">Save name</SettingsButton>
        </form>
      )}
    </SettingsGroup>
  );
}

export function OpenAnywhereSection() {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const { note, run } = useSaveNote();

  React.useEffect(() => {
    getOpenAnywhere().then(setStatus).catch((err) => setError(err.message));
  }, []);

  const save = (patch) => run(async () => setStatus(await saveOpenAnywhere(patch)));
  const addresses = status ? addressesFor(status.hosts, globalThis.location, status.port) : [];

  return (
    <>
      <SettingsSection
        title="Open anywhere"
        badge={<YorName id="thangorodrim" />}
        hint="Open this censaiOS from your other computers, tablet or phone on the same Wi-Fi, with nothing to install. Every device opens the same board where you left it, with your windows and agents. AI keys stay in the vault on this computer."
        data-testid="open-anywhere"
      >
        <SettingsNote tone="error">{error}</SettingsNote>
        {!status && !error && <SettingsNote>Loading...</SettingsNote>}
        {status?.thisComputerOnly && (
          <SettingsNote data-testid="open-anywhere-local-only">
            The desktop app keeps censaiOS on this computer only, so other computers on the Wi-Fi can&apos;t open it.
            Your own Tailscale devices can: see My Tailscale devices below. For any computer on the Wi-Fi,
            run the one-file install (docker compose up -d) on this computer.
          </SettingsNote>
        )}
        {status && !status.thisComputerOnly && !status.available && (
          <SettingsNote>This censaiOS already lives at its own web address. Open it from any browser and sign in.</SettingsNote>
        )}
        {status?.available && (
          <>
            <SwitchRow
              label="Let my other computers open censaiOS"
              hint="Off unless you turn it on. Another computer still needs a code from this one to sign in. Typing an email does not work from another computer."
              checked={status.open}
              disabled={!status.canManage}
              onChange={(open) => save({ open })}
            />
            <AddressList addresses={addresses} status={status} onSaveName={(address) => save({ address })} />
            <AddComputer address={addresses[0] || globalThis.location?.origin || ''} enabled={status.open} />
          </>
        )}
        <SettingsNote note={note} />
      </SettingsSection>
      <InstallAppRow />
    </>
  );
}
