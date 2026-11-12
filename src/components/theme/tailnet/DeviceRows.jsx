import React from 'react';
import { Icon } from '../../Icons.jsx';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const SYSTEMS = { android: 'Android', ios: 'iPhone or iPad', ipados: 'iPad', windows: 'Windows', macos: 'Mac', linux: 'Linux' };

function PhoneGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <path d="M11 17.5h2" />
    </svg>
  );
}

function about(device) {
  const system = SYSTEMS[String(device.system || '').toLowerCase()] || device.system || (device.kind === 'phone' ? 'Phone or tablet' : 'Computer');
  return `${system} · ${device.online ? 'on now' : 'off right now'}`;
}

/** Whose device it is, when it is not signed in to Tailscale as the owner. */
function whose(device) {
  if (device.mine) return '';
  if (device.shared) return 'A shared device, not signed in as one person.';
  return device.owner ? `Signed in to Tailscale as ${device.owner}.` : 'Signed in to Tailscale as someone else.';
}

function DeviceRow({ device, disabled, onSwitch }) {
  const note = whose(device);
  return (
    <div role="listitem" data-testid="tailnet-device" data-on={device.on ? 'true' : 'false'}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <span style={{ color: device.online ? 'var(--ink-soft)' : 'var(--ink-faint)', display: 'inline-flex', flexShrink: 0 }}>
        {device.kind === 'phone' ? <PhoneGlyph /> : <Icon.Computer size={16} aria-hidden="true" />}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 650, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{device.name}</span>
          {device.here ? <span style={{ ...muted, color: 'var(--accent-ink)', fontWeight: 650 }}>This device</span> : null}
        </div>
        <p style={muted}>{about(device)}</p>
        {note ? <p style={{ ...muted, color: device.on ? 'var(--warning)' : 'var(--ink-faint)' }}>{note}{device.on ? ' It opens censaiOS as you.' : ''}</p> : null}
      </div>
      <input type="checkbox" role="switch" aria-label={`Let ${device.name} open censaiOS`} checked={device.on} disabled={disabled}
        onChange={(event) => onSwitch(device, event.target.checked)} />
    </div>
  );
}

/** The devices on the tailnet, one switch each. */
export function DeviceRows({ devices, disabled, onSwitch }) {
  if (!devices.length) {
    return (
      <p style={muted} data-testid="tailnet-no-devices">
        No other devices on your tailnet yet. Put Tailscale on your phone, tablet or laptop and sign in with the same account. They show up here.
      </p>
    );
  }
  return (
    <div role="list" aria-label="Devices on your tailnet" style={{ display: 'grid', gap: 6 }}>
      {devices.map((device) => <DeviceRow key={device.id} device={device} disabled={disabled} onSwitch={onSwitch} />)}
    </div>
  );
}
