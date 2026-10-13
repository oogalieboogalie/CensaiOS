/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { DEFAULT_ADDRESS, EXPOSE_HELP, parseAddress } from '../../../lib/vm/vmAddress.js';

function HowTo() {
  const [tab, setTab] = React.useState(EXPOSE_HELP[0].id);
  const item = EXPOSE_HELP.find((h) => h.id === tab) || EXPOSE_HELP[0];
  return (
    <div className="hb-vm-help" data-testid="vm-help">
      <div className="hb-vm-tabs" role="tablist">
        {EXPOSE_HELP.map((h) => (
          <button key={h.id} type="button" role="tab" className="hb-vm-tab" aria-selected={h.id === tab} onClick={() => setTab(h.id)}>{h.title}</button>
        ))}
      </div>
      <p className="hb-vm-muted">{item.body}</p>
      <pre className="hb-vm-code"><code>{item.command}</code></pre>
    </div>
  );
}

/**
 * Where the VM is. Host also takes a whole ws:// URL. The password never
 * leaves this device; "remember" keeps it for this window on this device.
 */
export function VmConnectForm({ initial, savedPassword = '', error, onConnect, onCancel, title = 'Connect to a VM', submitLabel = 'Connect' }) {
  const start = initial || DEFAULT_ADDRESS;
  const [host, setHost] = React.useState(start.path ? `${start.host}/${start.path}` : start.host);
  const [port, setPort] = React.useState(String(start.port));
  const [secure, setSecure] = React.useState(Boolean(start.secure));
  const [password, setPassword] = React.useState(savedPassword);
  const [remember, setRemember] = React.useState(true);
  const [problem, setProblem] = React.useState(null);
  const [help, setHelp] = React.useState(false);

  const submit = (event) => {
    event.preventDefault();
    const { address, error: bad } = parseAddress({ host, port, secure });
    if (bad) { setProblem(bad); return; }
    setProblem(null);
    onConnect({ address, password, remember });
  };

  const shown = problem || error;
  return (
    <form className="hb-vm-card" onSubmit={submit} data-testid="vm-connect">
      <div className="hb-vm-title">{title}</div>
      <p className="hb-vm-body">Runs a virtual machine you host, over VNC on a WebSocket. Your keyboard and mouse go to it while you work in this window.</p>
      {shown && <p className="hb-vm-error" role="alert">{shown}</p>}
      <div className="hb-vm-row">
        <label className="hb-vm-field hb-vm-grow">
          <span className="hb-vm-label">Host</span>
          <input className="hb-vm-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" spellCheck={false} autoComplete="off" aria-label="Host" />
        </label>
        <label className="hb-vm-field hb-vm-port">
          <span className="hb-vm-label">Port</span>
          <input className="hb-vm-input" value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" placeholder="6080" aria-label="Port" />
        </label>
      </div>
      <label className="hb-vm-field">
        <span className="hb-vm-label">Password <span className="hb-vm-optional">optional</span></span>
        <input className="hb-vm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" aria-label="Password" />
      </label>
      <div className="hb-vm-checks">
        <label className="hb-vm-check"><input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} /> Secure (wss)</label>
        <label className="hb-vm-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember password on this device</label>
      </div>
      <div className="hb-vm-actions">
        <button type="submit" className="hb-btn" data-primary="true">{submitLabel}</button>
        {onCancel && <button type="button" className="hb-btn" onClick={onCancel}>Cancel</button>}
        <button type="button" className="hb-vm-link" aria-expanded={help} onClick={() => setHelp((v) => !v)}>How do I expose a VM?</button>
      </div>
      {help && <HowTo />}
      <p className="hb-vm-foot">Teammates see a live picture while you are connected. The password stays on this device and is never shared.</p>
    </form>
  );
}

/** Asked mid-connection when the VM wants a password we don't have. */
export function VmPasswordForm({ address, onSubmit, onCancel }) {
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  return (
    <form className="hb-vm-card" data-testid="vm-password" onSubmit={(e) => { e.preventDefault(); if (password) onSubmit(password, remember); }}>
      <div className="hb-vm-title">Password for {address}</div>
      <label className="hb-vm-field">
        <span className="hb-vm-label">VNC password</span>
        <input className="hb-vm-input" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} aria-label="VNC password" />
      </label>
      <label className="hb-vm-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device</label>
      <div className="hb-vm-actions">
        <button type="submit" className="hb-btn" data-primary="true" disabled={!password}>Unlock</button>
        <button type="button" className="hb-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
