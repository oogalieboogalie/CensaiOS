import React from 'react';
import { cliAgentsApi } from './cliAgentsApi.js';

// One shared poll of /api/cli-agents/roster for every subscriber (Agent
// Console windows, the dock's presence row, Action Approvals). Fast while
// anything is running or installing, slow when idle, off when the server
// says this mode cannot run CLIs (cloud).

let state = { clis: [], loaded: false, unavailable: false, error: null };
const listeners = new Set();
let timer = null;
let inflight = null;

function emit(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
  schedule();
}

function busy() {
  return state.clis.some((c) => c.running > 0 || c.state === 'installing' || c.needsApproval > 0);
}

export async function refreshCliRoster(force = false) {
  if (inflight && !force) return inflight;
  inflight = cliAgentsApi.roster(force)
    .then((data) => emit({ clis: data.clis || [], loaded: true, unavailable: false, error: null }))
    .catch((err) => emit({ loaded: true, unavailable: err.status === 401 || err.status === 403 || err.status === 404, error: err.message }))
    .finally(() => { inflight = null; });
  return inflight;
}

function schedule() {
  clearTimeout(timer);
  if (listeners.size === 0 || state.unavailable) return;
  const hidden = typeof document !== 'undefined' && document.hidden;
  timer = setTimeout(async () => {
    await refreshCliRoster();
    schedule();
  }, hidden ? 15000 : busy() ? 1500 : 6000);
}

const identity = (s) => s;

/**
 * Subscribe to the roster. `select` narrows what this component re-renders
 * on (the dock only cares about CLIs at work), compared by value.
 */
export function useCliRoster(select = identity) {
  const selectRef = React.useRef(select);
  selectRef.current = select;
  const [snapshot, setSnapshot] = React.useState(() => select(state));
  React.useEffect(() => {
    let last = JSON.stringify(selectRef.current(state));
    const listener = (next) => {
      const picked = selectRef.current(next);
      const key = JSON.stringify(picked);
      if (key === last) return;
      last = key;
      setSnapshot(picked);
    };
    listeners.add(listener);
    if (!state.loaded && !inflight) refreshCliRoster();
    schedule();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) clearTimeout(timer);
    };
  }, []);
  return snapshot;
}
