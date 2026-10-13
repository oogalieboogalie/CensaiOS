/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { addressLabel, driverLine } from '../../../lib/vm/vmAddress.js';
import { windowMeta } from './meta.js';
import { useVmWindow } from './useVmWindow.js';
import { VmConnectForm, VmPasswordForm } from './VmConnectForm.jsx';

export { windowMeta };

/** Teammates: the driver's screen, a couple of times a second. Read only. */
function Watch({ vm, picture, lastPicture, onConnectHere }) {
  return (
    <div className="hb-vm-watch" data-testid="vm-watch">
      {lastPicture && <img className="hb-vm-watch-img" data-stale={picture ? undefined : 'true'} src={lastPicture.frame} alt={`${addressLabel(vm)}, shared by ${vm.hostName || 'a teammate'}`} />}
      <div className="hb-vm-bar">
        <span className="hb-vm-dot" data-live={picture ? 'true' : undefined} aria-hidden="true" />
        <span>{driverLine(vm)}</span>
        <span className="hb-vm-muted">{picture ? 'View only' : vm.cast === false ? 'Picture not shared' : lastPicture ? 'Paused' : 'Waiting for a picture'}</span>
        <button type="button" className="hb-btn" onClick={onConnectHere} title="Open your own connection. The address has to work from your computer.">Connect from here</button>
      </div>
    </div>
  );
}

/** Text for the VM: typed key by key, or put on its clipboard. */
function PasteSheet({ initial, onType, onClipboard, onClose }) {
  const [text, setText] = React.useState(initial);
  React.useEffect(() => { if (initial) setText((t) => t || initial); }, [initial]);
  return (
    <div className="hb-vm-sheet" data-testid="vm-paste" onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="hb-vm-sheet-head">
        <span className="hb-vm-label">Paste into the VM</span>
        <button type="button" className="hb-vm-icon-btn" aria-label="Close" onClick={onClose}><Icon.Close size={14} /></button>
      </div>
      <textarea className="hb-vm-input hb-vm-textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type text here" aria-label="Text for the VM" />
      <div className="hb-vm-actions">
        <button type="button" className="hb-btn" data-primary="true" disabled={!text} onClick={() => { onType(text); onClose(); }}>Type it</button>
        <button type="button" className="hb-btn" disabled={!text} onClick={() => { onClipboard(text); onClose(); }}>Send to VM clipboard</button>
      </div>
      <p className="hb-vm-muted">Type it works everywhere. The VM clipboard needs a VNC server that supports it; press Ctrl+V inside the VM afterwards.</p>
    </div>
  );
}

/**
 * VM window: a virtual machine the person runs themselves, shown and
 * controlled through noVNC. Whoever connects drives it; teammates watch a
 * live picture, or connect from their own computer.
 */
export function VmWindow({ win = {}, onUpdate }) {
  const v = useVmWindow({ win, onUpdate });
  const [paste, setPaste] = React.useState(null);
  const [focused, setFocused] = React.useState(false);
  const live = v.status === 'connected';
  const label = addressLabel(v.lastAddress || v.shared);

  // Opens at once; the browser may ask before handing over the clipboard.
  const openPaste = () => {
    setPaste('');
    navigator.clipboard?.readText?.()
      .then((text) => { if (text) setPaste((current) => (current === '' ? text : current)); })
      .catch(() => { /* the sheet still takes typed text */ });
  };

  let subtitle = 'Not connected';
  if (live) subtitle = v.desktopName ? `${v.desktopName} · ${label}` : label;
  else if (v.status === 'connecting') subtitle = `Connecting to ${label}`;
  else if (v.watching) subtitle = driverLine(v.vm);

  const actions = live ? [
    { id: 'paste', label: null, title: 'Paste into the VM', icon: <Icon.Copy size={14} />, onSelect: openPaste },
    { id: 'cast', label: null, title: v.casting ? 'Teammates see a picture' : 'Picture hidden from teammates', pressed: v.casting,
      icon: v.casting ? <Icon.Eye size={14} /> : <Icon.Stop size={14} />, onSelect: () => v.setCast(!v.casting) },
    { id: 'reconnect', label: null, title: 'Reconnect', icon: <Icon.Refresh size={14} />, onSelect: v.reconnect },
  ] : v.status === 'dropped' && v.canReconnect ? [
    { id: 'reconnect', label: null, title: 'Reconnect', icon: <Icon.Refresh size={14} />, onSelect: v.reconnect },
  ] : undefined;
  const menu = live ? [
    { id: 'cad', label: 'Send Ctrl+Alt+Del', onSelect: v.ctrlAltDel },
    { id: 'scale', label: v.scale === 'fit' ? 'Show at actual size' : 'Fit to window', onSelect: () => v.setScale(v.scale === 'fit' ? 'actual' : 'fit') },
    { id: 'view', label: v.viewOnly ? 'Let me control it' : 'View only', onSelect: () => v.setViewOnly(!v.viewOnly) },
    v.vmClipboard && { id: 'copy', label: 'Copy the VM clipboard', onSelect: () => navigator.clipboard?.writeText(v.vmClipboard).catch(() => {}) },
    { id: 'address', label: 'Change address', onSelect: () => { v.disconnect(); v.setEditing(true); } },
    { id: 'disconnect', label: 'Disconnect', onSelect: v.disconnect },
  ] : v.shared ? [
    { id: 'address', label: 'Change address', onSelect: () => v.setEditing(true) },
  ] : undefined;

  const showScreen = live || v.status === 'connecting' || v.status === 'password';
  let overlay = null;
  if (v.status === 'connecting') {
    overlay = <div className="hb-vm-center hb-vm-muted" data-testid="vm-connecting">Connecting to {label}…</div>;
  } else if (v.status === 'password') {
    overlay = <div className="hb-vm-center"><VmPasswordForm address={label} onSubmit={v.sendPassword} onCancel={v.disconnect} /></div>;
  } else if (!live && v.watching && !v.editing) {
    overlay = <Watch vm={v.vm} picture={v.picture} lastPicture={v.lastPicture} onConnectHere={v.reconnect} />;
  } else if (!live) {
    overlay = (
      <div className="hb-vm-center hb-vm-scroll">
        <VmConnectForm
          key={`${addressLabel(v.shared)}|${v.status}`}
          initial={v.lastAddress || v.shared}
          savedPassword={v.lastPassword ?? v.savedPassword}
          error={v.status === 'dropped' ? v.error : null}
          title={v.status === 'dropped' ? 'Disconnected' : v.shared ? 'Connect to this VM' : 'Connect to a VM'}
          submitLabel={v.status === 'dropped' ? 'Reconnect' : 'Connect'}
          onConnect={v.connect}
          onCancel={v.editing && v.watching ? () => v.setEditing(false) : null}
        />
      </div>
    );
  }

  return (
    <>
      <WindowTitle icon={<Icon.Monitor size={14} />} label={win.title || windowMeta.label} subtitle={subtitle} actions={actions} menu={menu} />
      <div className="hb-vm" data-testid="vm" data-status={v.status}>
        <div
          ref={v.screenRef}
          className="hb-vm-screen"
          data-testid="vm-screen"
          data-scale={v.scale}
          hidden={!showScreen}
          onFocus={(e) => { setFocused(true); v.screenProps.onFocus(e); }}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); v.screenProps.onBlur(e); }}
          onKeyDownCapture={(e) => { if (e.key === 'Escape' && e.shiftKey) setFocused(false); v.screenProps.onKeyDownCapture(e); }}
        />
        {overlay}
        {live && focused && !v.viewOnly && <div className="hb-vm-hint" data-testid="vm-hint">The VM has your keyboard. Shift+Esc gives it back.</div>}
        {live && v.viewOnly && <div className="hb-vm-hint">View only</div>}
        {paste !== null && <PasteSheet initial={paste} onType={v.typeText} onClipboard={v.sendClipboard} onClose={() => setPaste(null)} />}
      </div>
    </>
  );
}
