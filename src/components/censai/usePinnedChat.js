import React from 'react';

// Open or shrunk-to-a-bubble state for Censai's pinned chat, remembered per
// browser. The dock's chat button and the C key toggle it from anywhere by
// firing TOGGLE_EVENT; OPEN_EVENT only opens it (for "ask Censai" links).

export const TOGGLE_EVENT = 'censai:pinned-chat-toggle';
export const OPEN_EVENT = 'censai:pinned-chat-open';
const STORAGE_KEY = 'homebase.censai.pinned.v1';
const TALKING_MS = 4000;

function loadOpen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'open';
  } catch {
    return false;
  }
}

export function toggleCensaiChat() {
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
}

export function openCensaiChat() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function usePinnedOpen() {
  const [open, setOpen] = React.useState(loadOpen);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? 'open' : 'bubble');
    } catch {}
  }, [open]);

  React.useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    const onOpen = () => setOpen(true);
    window.addEventListener(TOGGLE_EVENT, onToggle);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(TOGGLE_EVENT, onToggle);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  return [open, setOpen];
}

// Censai's avatar state, a hook for the animations that come later:
// 'working' while a reply is on its way, 'talking' for a moment after one
// lands, 'idle' otherwise.
export function useCensaiState({ sending, lastReplyAt }) {
  const [talking, setTalking] = React.useState(false);

  React.useEffect(() => {
    if (!lastReplyAt || Date.now() - lastReplyAt > TALKING_MS) return undefined;
    setTalking(true);
    const id = setTimeout(() => setTalking(false), TALKING_MS);
    return () => clearTimeout(id);
  }, [lastReplyAt]);

  if (sending) return 'working';
  return talking ? 'talking' : 'idle';
}
