import React from 'react';
import QRCode from 'qrcode';
import { ThemePanelCard } from './ThemeControls.jsx';
import { InstallAppRow } from './InstallAppRow.jsx';
import {
  addressesFor,
  getOpenAnywhere,
  makePairCode,
  pairLink,
  saveOpenAnywhere,
} from '../../lib/webOs.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '8px 12px', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' };
const primary = { ...button, border: 0, background: 'var(--accent-line)', color: 'var(--surface)' };
const input = { minWidth: 0, flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit' };
const code = { fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-xs)', wordBreak: 'break-all' };

function copy(text) {
  try { globalThis.navigator?.clipboard?.writeText(text); } catch { /* the text stays on screen */ }
}

function Switch({ checked, disabled, onChange, label }) {
  return (
    <label style={{ ...row, cursor: disabled ? 'default' : 'pointer', fontWeight: 650, color: 'var(--ink)' }}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
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
    <div style={{ display: 'grid', gap: 8 }} data-testid="add-computer">
      <div style={row}>
        <button type="button" style={{ ...primary, opacity: enabled ? 1 : 0.5 }} disabled={!enabled} onClick={make}>
          {pair ? 'Make a new code' : 'Add a computer'}
        </button>
        {!enabled && <span style={muted}>Turn on the switch above first.</span>}
      </div>
      {error && <p role="alert" style={{ ...muted, color: 'var(--ps-red)' }}>{error}</p>}
      {pair && (
        <div style={{ ...row, alignItems: 'flex-start' }}>
          <img src={pair.qr} alt="Code to scan with the other device" width={140} height={140} style={{ borderRadius: 'var(--radius-sm)', background: 'var(--on-fill)' }} />
          <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 180 }}>
            <p style={muted}>Scan this with the other device, or open this link there. It works once, for ten minutes.</p>
            <div style={code} data-testid="pair-link">{pair.link}</div>
            <div><button type="button" style={button} onClick={() => copy(pair.link)}>Copy link</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddressList({ addresses, status, onSaveName }) {
  const [name, setName] = React.useState(status.address || '');
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontWeight: 650, color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>Type one of these on the other computer</div>
      {addresses.length === 0 && <p style={muted}>censaiOS can't see this computer's name from inside Docker. Type it below.</p>}
      {addresses.map((address) => (
        <div key={address} style={{ ...row, justifyContent: 'space-between', padding: '7px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>
          <span style={code} data-testid="open-anywhere-address">{address}</span>
          <button type="button" style={button} onClick={() => copy(address)}>Copy</button>
        </div>
      ))}
      {status.canManage && (
        <form style={row} onSubmit={(e) => { e.preventDefault(); onSaveName(name); }}>
          <input aria-label="This computer's name" style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="This computer's name, like r2d2" />
          <button type="submit" style={button}>Save name</button>
        </form>
      )}
      <p style={muted}>On Windows the name is in Settings, System, About, Device name.</p>
    </div>
  );
}

export function OpenAnywhereSection() {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    getOpenAnywhere().then(setStatus).catch((err) => setError(err.message));
  }, []);

  async function save(patch) {
    setError('');
    try {
      setStatus(await saveOpenAnywhere(patch));
    } catch (err) {
      setError(err.message);
    }
  }

  const addresses = status ? addressesFor(status.hosts, globalThis.location, status.port) : [];

  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 14 }} data-testid="open-anywhere">
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>Open anywhere</div>
        <p style={{ ...muted, marginTop: 3 }}>
          Open this censaiOS from your other computers, tablet or phone on the same Wi-Fi, with nothing to install.
          Every device opens the same board where you left it, with your windows and agents. AI keys stay in the vault on this computer.
        </p>
      </div>
      {error && <p role="alert" style={{ ...muted, color: 'var(--ps-red)' }}>{error}</p>}
      {!status && !error && <p style={muted}>Loading…</p>}
      {status?.thisComputerOnly && (
        <p style={muted} data-testid="open-anywhere-local-only">
          The desktop app keeps censaiOS on this computer only, so other computers can't open it.
          To open your board from other computers, run the one-file install (docker compose up -d) on this computer.
        </p>
      )}
      {status && !status.thisComputerOnly && !status.available && (
        <p style={muted}>This censaiOS already lives at its own web address. Open it from any browser and sign in.</p>
      )}
      {status?.available && (
        <>
          <div style={{ display: 'grid', gap: 4 }}>
            <Switch
              checked={status.open}
              disabled={!status.canManage}
              onChange={(open) => save({ open })}
              label="Let my other computers open censaiOS"
            />
            <p style={muted}>
              Off unless you turn it on. Other computers still need a code from this one to sign in;
              typing an email does not work from another computer.
            </p>
          </div>
          <AddressList addresses={addresses} status={status} onSaveName={(address) => save({ address })} />
          <AddComputer address={addresses[0] || globalThis.location?.origin || ''} enabled={status.open} />
        </>
      )}
      <InstallAppRow />
    </ThemePanelCard>
  );
}
