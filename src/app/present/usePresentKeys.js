import React from 'react';
import { keyboardClaimed } from '../../lib/keyboardClaim.js';
import { usePresentStore } from '../../lib/presentStore.js';

// Present mode keys. Listens in the capture phase so it gets F-keys and
// Escape before the plain group hotkeys (useGroupHotkeys.js):
//   F1..F9          start presenting at that scene (or jump to it); the same
//                   key again ends the run, like the group view did.
//   Right / Left    next / previous scene (PageDown / PageUp too, which is
//                   what presentation clickers send).
//   N               open or close the presenter notes window.
//   Escape          back to the board exactly as it was (Shift+Escape works
//                   even while a game holds the keyboard).
// An F-key with no scene behind it is left alone, so the old group view and
// an unbound F5 (refresh) still work.

const isEditing = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.('[contenteditable="true"]'));
};
const inTerminal = (target) => Boolean(target?.closest?.('.xterm'));
// A new scene leaves the box you were typing in, so N and the arrows work
// straight away instead of typing into a chat that is now off screen.
const leaveTyping = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (isEditing(el)) el.blur?.();
};

export function handlePresentKey(e) {
  const store = usePresentStore.getState();
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  const done = () => { e.preventDefault(); e.stopImmediatePropagation?.(); return true; };

  if (store.presenting && e.key === 'Escape' && e.shiftKey && plain) return store.stop() && done();
  if (inTerminal(e.target) || keyboardClaimed()) return false;

  const fn = /^F([1-9])$/.exec(e.key || '');
  if (fn && plain && !e.shiftKey) {
    const current = store.presenting && store.scenes.find((s) => s.id === store.sceneId);
    if (current && current.key === fn[1]) return store.stop() && done();
    if (!store.startKey(fn[1])) return false;
    leaveTyping();
    return done();
  }
  if (!store.presenting) return false;
  if (e.key === 'Escape' && plain) return store.stop() && done();
  if (isEditing(e.target) || !plain || e.shiftKey) return false;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { store.step(1); return done(); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { store.step(-1); return done(); }
  if (e.key === 'n' || e.key === 'N') { store.setNotesOpen(!store.notesOpen); return done(); }
  return false;
}

export function usePresentKeys(workspaceId) {
  React.useEffect(() => {
    usePresentStore.getState().stop();
    usePresentStore.getState().setWorkspace(workspaceId);
  }, [workspaceId]);

  React.useEffect(() => {
    window.addEventListener('keydown', handlePresentKey, true);
    return () => window.removeEventListener('keydown', handlePresentKey, true);
  }, []);

  React.useEffect(() => {
    const onResize = () => usePresentStore.getState().refresh();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
}
