import React from 'react';

// "Block ads on web pages" (Settings > Canvas). The blocking itself happens
// in the desktop app (src-tauri/src/adblock.rs); this keeps the switch, which
// is a per-computer choice, and tells the desktop app when it changes.

const KEY = 'homebase.adblock.v1';
const EVENT = 'homebase:adblock';

export function isAdBlockEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAdBlockEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
  // An older desktop app without the command just ignores this.
  const invoke = typeof window !== 'undefined' ? (window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke) : null;
  invoke?.('adblock_set_enabled', { enabled: Boolean(on) })?.catch?.(() => {});
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: Boolean(on) }));
}

export function useAdBlockEnabled() {
  const [on, setOn] = React.useState(isAdBlockEnabled);
  React.useEffect(() => {
    const sync = () => setOn(isAdBlockEnabled());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [on, setAdBlockEnabled];
}
