import React from 'react';
import { getCollaborationClientId } from '../../../lib/collaboration/clientIdentity.js';
import { sendDockCast } from '../../../lib/collaboration/liveText.js';
import { useBoardEvent } from '../../../lib/collaboration/boardEvents.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { claimKeyboard, releaseKeyboard } from '../../../lib/keyboardClaim.js';
import { encodeCanvasFrame } from '../../../lib/dock/castFrame.js';
import { CAST_EVERY_MS, CAST_STALE_MS, CAST_TYPE, dockSlotId, normalizeCast } from '../../../lib/dock/wire.js';
import {
  blockedReason, describeDrop, keysymsFor, normalizeAddress, readSavedPassword, savePassword, vmRecord, wsUrl,
} from '../../../lib/vm/vmAddress.js';

// noVNC is big; it loads the first time someone connects. Tests swap it.
let loadRfb = () => import('@novnc/novnc').then((m) => m.default);
export function __setRfbLoaderForTests(loader) {
  loadRfb = loader;
}

function storage() {
  try { return window.localStorage; } catch { return null; }
}

/**
 * Everything a VM window does. The address and who is driving ride the
 * shared window record (`win.vm`, see vmAddress.js); the connection itself
 * is this browser's own. Whoever is connected sends small pictures of the
 * screen to teammates over the same relay Dock app windows use, so the rest
 * of the board watches read-only without reaching the VM themselves.
 */
export function useVmWindow({ win, onUpdate }) {
  const selfId = React.useMemo(() => getCollaborationClientId(), []);
  const vm = win.vm || null;
  const shared = React.useMemo(() => normalizeAddress(vm), [vm]);
  const slot = dockSlotId(win.id);
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;
  const vmRef = React.useRef(vm);
  vmRef.current = vm;

  const screenRef = React.useRef(null);
  const rfbRef = React.useRef(null);
  const lastRef = React.useRef(null); // { address, password } for Reconnect
  const [last, setLast] = React.useState(null);
  const [status, setStatus] = React.useState('idle'); // idle | connecting | password | connected | dropped
  const [error, setError] = React.useState(null);
  const [desktopName, setDesktopName] = React.useState('');
  const [scale, setScale] = React.useState('fit'); // fit | actual
  const [viewOnly, setViewOnlyState] = React.useState(false);
  const [vmClipboard, setVmClipboard] = React.useState('');
  const [editing, setEditing] = React.useState(false);

  const savedPassword = React.useMemo(() => readSavedPassword(storage(), win.id), [win.id]);
  const hosting = status === 'connected' && vm?.hostClientId === selfId;
  const casting = hosting && vm?.cast !== false;

  const writeVm = React.useCallback((patch) => {
    const next = vmRecord({ ...(vmRef.current || {}), ...patch });
    if (next) updateRef.current?.({ vm: next });
  }, []);

  const teardown = React.useCallback(() => {
    const rfb = rfbRef.current;
    rfbRef.current = null;
    if (rfb) {
      rfb.__censaiQuiet = true;
      try { rfb.disconnect(); } catch { /* already closed */ }
    }
    releaseKeyboard(win.id);
  }, [win.id]);

  const connect = React.useCallback(async ({ address, password = '', remember = true } = {}) => {
    const target = normalizeAddress(address);
    if (!target) return;
    const blocked = blockedReason(target, typeof window !== 'undefined' ? window.location.protocol : 'http:');
    if (blocked) { setError(blocked); setStatus('dropped'); return; }
    teardown();
    if (remember) savePassword(storage(), win.id, password);
    lastRef.current = { address: target, password };
    setLast(lastRef.current);
    setEditing(false);
    setError(null);
    setStatus('connecting');
    let RFB;
    try {
      RFB = await loadRfb();
    } catch {
      setError('The VNC viewer didn’t load. Check your connection and try again.');
      setStatus('dropped');
      return;
    }
    const el = screenRef.current;
    if (!el) return;
    el.replaceChildren();
    let rfb;
    try {
      rfb = new RFB(el, wsUrl(target), { shared: true, credentials: password ? { password } : undefined });
    } catch (e) {
      setError(describeDrop({ reason: e?.message }));
      setStatus('dropped');
      return;
    }
    rfbRef.current = rfb;
    rfb.scaleViewport = scale === 'fit';
    rfb.clipViewport = scale !== 'fit';
    rfb.viewOnly = viewOnly;
    rfb.focusOnClick = true;
    rfb.background = 'transparent';
    let connected = false;
    let refusal = null;
    const mine = () => rfbRef.current === rfb;
    rfb.addEventListener('connect', () => {
      if (!mine()) return;
      connected = true;
      setStatus('connected');
      writeVm({ ...target, hostClientId: selfId, hostName: getSelf().label || 'Someone' });
    });
    rfb.addEventListener('credentialsrequired', () => {
      if (!mine()) return;
      const pass = lastRef.current?.password;
      if (pass && !refusal) rfb.sendCredentials({ password: pass });
      else setStatus('password');
    });
    rfb.addEventListener('securityfailure', (event) => {
      refusal = { reason: event.detail?.reason, status: event.detail?.status };
    });
    rfb.addEventListener('desktopname', (event) => { if (mine()) setDesktopName(String(event.detail?.name || '').slice(0, 80)); });
    rfb.addEventListener('clipboard', (event) => { if (mine()) setVmClipboard(String(event.detail?.text || '')); });
    rfb.addEventListener('disconnect', (event) => {
      if (rfb.__censaiQuiet || !mine()) return;
      rfbRef.current = null;
      releaseKeyboard(win.id);
      setError(describeDrop({ clean: event.detail?.clean, wasConnected: connected, ...(refusal || {}) }));
      setStatus('dropped');
      if (vmRef.current?.hostClientId === selfId) writeVm({ hostClientId: null });
    });
  }, [scale, viewOnly, selfId, teardown, win.id, writeVm]);

  const sendPassword = React.useCallback((password, remember = true) => {
    if (!rfbRef.current || !password) return;
    lastRef.current = { ...(lastRef.current || {}), password };
    setLast(lastRef.current);
    if (remember) savePassword(storage(), win.id, password);
    setStatus('connecting');
    rfbRef.current.sendCredentials({ password });
  }, [win.id]);

  const disconnect = React.useCallback(() => {
    teardown();
    setStatus('idle');
    setError(null);
    if (vmRef.current?.hostClientId === selfId) writeVm({ hostClientId: null });
  }, [selfId, teardown, writeVm]);

  const reconnect = React.useCallback(() => {
    const last = lastRef.current;
    if (last) connect({ address: last.address, password: last.password, remember: false });
    else if (shared) connect({ address: shared, password: savedPassword, remember: false });
  }, [connect, shared, savedPassword]);

  React.useEffect(() => () => {
    teardown();
    if (vmRef.current?.hostClientId === selfId && vmRef.current) {
      sendDockCast({ type: CAST_TYPE, windowId: slot, frame: null });
    }
  }, [teardown, selfId, slot]);

  // Display options apply to a live connection right away.
  React.useEffect(() => {
    const rfb = rfbRef.current;
    if (!rfb) return;
    rfb.scaleViewport = scale === 'fit';
    rfb.clipViewport = scale !== 'fit';
  }, [scale, status]);
  React.useEffect(() => { if (rfbRef.current) rfbRef.current.viewOnly = viewOnly; }, [viewOnly, status]);

  // Pictures for teammates while this browser drives.
  React.useEffect(() => {
    if (!casting) return undefined;
    const send = () => {
      const canvas = screenRef.current?.querySelector('canvas');
      const encoded = canvas ? encodeCanvasFrame(canvas) : null;
      if (encoded) sendDockCast({ type: CAST_TYPE, windowId: slot, ...encoded });
    };
    send();
    const timer = setInterval(send, CAST_EVERY_MS);
    return () => {
      clearInterval(timer);
      sendDockCast({ type: CAST_TYPE, windowId: slot, frame: null });
    };
  }, [casting, slot]);

  // Pictures from whoever drives, when this browser isn't connected itself.
  const [picture, setPicture] = React.useState(null);
  const [now, setNow] = React.useState(() => Date.now());
  const watching = status !== 'connected' && Boolean(vm?.hostClientId) && vm.hostClientId !== selfId;
  useBoardEvent(CAST_TYPE, (message) => {
    const cast = normalizeCast(message);
    if (!cast || cast.windowId !== slot || status === 'connected') return;
    setPicture(cast.frame ? { ...cast, at: Date.now() } : null);
  });
  React.useEffect(() => {
    if (!watching) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [watching]);
  React.useEffect(() => { if (!vm?.hostClientId) setPicture(null); }, [vm?.hostClientId]);
  const fresh = picture && now - picture.at <= CAST_STALE_MS ? picture : null;

  // The VM gets every key while its screen has focus (the games contract).
  // Shift+Escape gives the keyboard back; a plain Escape goes to the VM.
  const onFocusIn = React.useCallback(() => { if (rfbRef.current) claimKeyboard(win.id); }, [win.id]);
  const onFocusOut = React.useCallback((event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) releaseKeyboard(win.id);
  }, [win.id]);
  const onKeyDownCapture = React.useCallback((event) => {
    if (event.key === 'Escape' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      rfbRef.current?.blur();
      releaseKeyboard(win.id);
    }
  }, [win.id]);

  const typeText = React.useCallback((text) => {
    const rfb = rfbRef.current;
    if (!rfb || viewOnly) return 0;
    const keys = keysymsFor(text);
    for (const keysym of keys) rfb.sendKey(keysym, null);
    rfb.focus?.();
    return keys.length;
  }, [viewOnly]);

  const sendClipboard = React.useCallback((text) => {
    rfbRef.current?.clipboardPasteFrom(String(text || ''));
  }, []);

  return {
    vm, shared, slot, status, error, desktopName, editing, setEditing,
    hosting, casting, watching, picture: fresh, lastPicture: picture,
    scale, setScale, viewOnly, setViewOnly: setViewOnlyState, vmClipboard, savedPassword,
    screenRef, connect, sendPassword, disconnect, reconnect, canReconnect: Boolean(last || shared),
    lastAddress: last?.address || null, lastPassword: last ? last.password : undefined,
    setCast: (on) => writeVm({ cast: Boolean(on) }),
    ctrlAltDel: () => rfbRef.current?.sendCtrlAltDel(),
    typeText, sendClipboard,
    screenProps: { onFocus: onFocusIn, onBlur: onFocusOut, onKeyDownCapture },
  };
}
