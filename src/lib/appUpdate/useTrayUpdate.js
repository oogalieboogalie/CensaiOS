/**
 * The tray's "Update censaiOS" flow: look for an update now, list what is
 * still being worked on, then update now or wait for that work to land.
 * The panel (src/components/TrayUpdatePanel.jsx) only draws what this holds.
 */

import React from 'react';
import { appUpdateApi } from './api.js';
import { TRAY_UPDATE_EVENT, lookedSince, readWait, saveWait, stillOpen } from './trayFlow.js';

const LOOK_EVERY_MS = 2000;
const BACK_EVERY_MS = 3000;
const WAIT_EVERY_MS = 2 * 60_000;
const WAIT_GIVE_UP_MS = 12 * 60 * 60_000;
const BACK_GIVE_UP_MS = 15 * 60_000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function friendly(error) {
  if (error?.status === 401) return "You're signed out. Sign in again to update censaiOS.";
  if (error?.status === 403 && error.ownerName && error.yourName) {
    return `Only the owner account (${error.ownerName}) can update censaiOS. You're signed in as ${error.yourName}. Sign in as ${error.ownerName} to update.`;
  }
  if (error?.status === 403) return 'Only the owner of this censaiOS can update it.';
  if (error?.status === 404) return 'This copy of censaiOS updates by installing a new release, not from here.';
  return error?.message || 'Something went wrong asking for the update.';
}

/** Ask the updater to look now and wait until it has. */
async function lookNow(alive) {
  const asked = await appUpdateApi.check();
  for (;;) {
    const status = await appUpdateApi.status().catch(() => null);
    if (!alive()) return null;
    if (status && lookedSince(status, asked.askedAt)) return status;
    await sleep(LOOK_EVERY_MS);
  }
}

export function useTrayUpdate() {
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState('idle'); // idle | checking | shown | restarting | waiting
  const [status, setStatus] = React.useState(null);
  const [inFlight, setInFlight] = React.useState(null);
  const [error, setError] = React.useState('');
  const [waitFor, setWaitFor] = React.useState(() => readWait());
  const run = React.useRef(0);

  // After Restart: the page reloads once the new copy answers.
  const restart = React.useCallback(async (want) => {
    setError('');
    setPhase('restarting');
    try {
      const res = await appUpdateApi.restart();
      if (res.waiting) setStatus((s) => ({ ...s, pendingRestart: res }));
    } catch (err) {
      setPhase('shown');
      setError(friendly(err));
      return;
    }
    const started = Date.now();
    while (Date.now() - started < BACK_GIVE_UP_MS) {
      await sleep(BACK_EVERY_MS);
      const now = await appUpdateApi.status().catch(() => null);
      if (now?.running && now.running === want) { window.location.reload(); return; }
      if (now) setStatus(now);
    }
    setPhase('shown');
    setError('The update is taking longer than expected. Close censaiOS and open it again.');
  }, []);

  const start = React.useCallback(async () => {
    const mine = ++run.current;
    const alive = () => run.current === mine;
    setOpen(true);
    setError('');
    setPhase('checking');
    appUpdateApi.inFlight().then((data) => { if (alive()) setInFlight(data); }).catch(() => {});
    try {
      const looked = await lookNow(alive);
      if (!alive() || !looked) return;
      setStatus(looked);
      setPhase('shown');
    } catch (err) {
      if (!alive()) return;
      setError(friendly(err));
      setPhase('shown');
    }
  }, []);

  React.useEffect(() => {
    const onTray = () => { start(); };
    window.addEventListener(TRAY_UPDATE_EVENT, onTray);
    return () => window.removeEventListener(TRAY_UPDATE_EVENT, onTray);
  }, [start]);

  const wait = React.useCallback(() => {
    const value = { numbers: (inFlight?.changes || []).map((c) => c.number), since: new Date().toISOString() };
    saveWait(value);
    setWaitFor(value);
    setPhase('waiting');
  }, [inFlight]);

  const stopWaiting = React.useCallback(() => { saveWait(null); setWaitFor(null); setPhase('idle'); setOpen(false); }, []);

  // "Wait for them": look every few minutes; once they have all landed,
  // fetch and build the update with them in, then put it in.
  React.useEffect(() => {
    if (!waitFor) return undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() - Date.parse(waitFor.since) > WAIT_GIVE_UP_MS) { stopWaiting(); return; }
      const now = await appUpdateApi.inFlight().catch(() => null);
      if (stopped) return;
      if (now) setInFlight(now);
      if (!now || stillOpen(waitFor, now).length) { timer = setTimeout(tick, WAIT_EVERY_MS); return; }
      saveWait(null);
      setWaitFor(null);
      const looked = await lookNow(() => !stopped).catch(() => null);
      if (stopped || !looked) return;
      setStatus(looked);
      if (looked.ready) { setOpen(true); restart(looked.ready.commit); } else { setPhase('idle'); setOpen(false); }
    };
    let timer = setTimeout(tick, WAIT_EVERY_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [waitFor, restart, stopWaiting]);

  const close = React.useCallback(() => { run.current += 1; setOpen(false); if (phase !== 'waiting') setPhase('idle'); }, [phase]);

  return { open, phase, status, inFlight, error, waitFor, start, restart, wait, stopWaiting, close };
}
