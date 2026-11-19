import React from 'react';
import { Icon } from '../../Icons.jsx';

import { SettingsNote, SettingsSwitch } from '../settingsKit.jsx';
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
    <div role="listitem" data-testid="tailnet-device" data-on={device.on ? 'true' : 'false'} className="hb-set-item">
      <span className={device.online ? 'hb-set-device hb-set-device--on' : 'hb-set-device'}>
        {device.kind === 'phone' ? <PhoneGlyph /> : <Icon.Computer size={16} aria-hidden="true" />}
      </span>
      <div className="hb-set-item-main">
        <span className="hb-set-label">{device.name}</span>
        {device.here ? <span className="hb-set-hint">This device</span> : null}
        <span className="hb-set-hint">{about(device)}</span>
        {note ? <span className={device.on ? 'hb-set-note hb-set-note--warn' : 'hb-set-hint'}>{note}{device.on ? ' It opens censaiOS as you.' : ''}</span> : null}
      </div>
      <SettingsSwitch label={`Let ${device.name} open censaiOS`} checked={device.on} disabled={disabled}
        onChange={(on) => onSwitch(device, on)} />
    </div>
  );
}

/** The devices on the tailnet, one switch each. */
export function DeviceRows({ devices, disabled, onSwitch }) {
  if (!devices.length) {
    return (
      <SettingsNote data-testid="tailnet-no-devices">
        No other devices on your tailnet yet. Put Tailscale on your phone, tablet or laptop and sign in with the same account. They show up here.
      </SettingsNote>
    );
  }
  return (
    <div role="list" aria-label="Devices on your tailnet" className="hb-set-list">
      {devices.map((device) => <DeviceRow key={device.id} device={device} disabled={disabled} onSwitch={onSwitch} />)}
    </div>
  );
}
