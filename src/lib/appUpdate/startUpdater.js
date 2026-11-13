/**
 * Start the updater from the update panel: the desktop app if this window
 * is one, otherwise this PC's server, otherwise the sign-in link the
 * launcher registered (censaios-updater:start).
 */

import { appUpdateApi } from './api.js';

export const UPDATER_LINK = 'censaios-updater:start';
export const UPDATER_DOWN = 'updater-not-running';
export const UPDATER_DID_NOT_START = 'The updater did not start. Open censaiOS with its shortcut once so it can start on its own from then on.';

function defaultInvoke() {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null;
}

export function openUpdaterLink(url = UPDATER_LINK) {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** 'app' | 'server' | 'windows' — which way the start was asked for. */
export async function launchUpdater({
  invoke = defaultInvoke(),
  start = () => appUpdateApi.start(),
  open = openUpdaterLink,
} = {}) {
  if (invoke) {
    try {
      await invoke('start_updater');
      return 'app';
    } catch { /* this window cannot start a program; try the next way */ }
  }
  try {
    const res = await start();
    if (res?.started) return 'server';
  } catch { /* the server cannot start a program from here */ }
  open(UPDATER_LINK);
  return 'windows';
}

const sleepMs = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * After a start: the updater's heartbeat, or a running commit that changed
 * because the built update went in (the server drops out for a few seconds).
 */
export async function afterUpdaterStarted({
  read, sleep = sleepMs, alive = () => true, before = '', tries = 20,
} = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (!alive()) return null;
    const status = await read().catch(() => null);
    if (status?.watching) return status;
    if (status?.running && before && status.running !== before) return { ...status, swapped: true };
    await sleep(1500);
  }
  return null;
}
