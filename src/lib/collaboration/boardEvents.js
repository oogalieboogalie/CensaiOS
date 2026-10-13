// A tiny pub/sub for collaboration-socket events that aren't canvas sync:
// comment pins, guest board pictures, the host's camera, reactions, raised
// hands. The socket hook publishes; comment and guest UI subscribe. Keeping
// it out of React state means a busy board doesn't re-render the app shell.
import React from 'react';

const listeners = new Map();

export function emitBoardEvent(message) {
  if (!message?.type) return;
  for (const key of [message.type, '*']) {
    const set = listeners.get(key);
    if (!set) continue;
    for (const listener of [...set]) {
      try { listener(message); } catch (error) { console.error('board event listener failed', error); }
    }
  }
}

export function onBoardEvent(type, listener) {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

export function useBoardEvent(type, handler) {
  const ref = React.useRef(handler);
  React.useEffect(() => { ref.current = handler; }, [handler]);
  React.useEffect(() => onBoardEvent(type, (message) => ref.current?.(message)), [type]);
}
