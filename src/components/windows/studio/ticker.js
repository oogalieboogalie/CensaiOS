import React from 'react';

// Playhead and meters arrive ~30 times a second from the audio thread. They
// live in this tiny store instead of React state so only the playhead and
// the meters re-render, not the whole Studio.

export function createTicker() {
  let state = { beat: 0, playing: false, meters: { tracks: {}, master: [0, 0], fx: {} } };
  const listeners = new Set();
  return {
    get: () => state,
    set(next) { state = { ...state, ...next }; listeners.forEach(l => l()); },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  };
}

export function useTick(ticker, select) {
  return React.useSyncExternalStore(ticker.subscribe, () => select(ticker.get()), () => select(ticker.get()));
}
