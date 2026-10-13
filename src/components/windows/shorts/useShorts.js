import React from 'react';
import { claimKeyboard, releaseKeyboard } from '../../../lib/keyboardClaim.js';
import {
  CURATED_CHANNELS, createWheelStepper, embedUrlFor, normalizeSource, playerCommand,
  sourceKey, sourceLength, stepIndex,
} from '../../../lib/shorts/shortsFeed.js';

// Per-viewer settings: sound and the last source this person picked. The
// source a window plays is shared on the window record; where each person is
// in the feed, and whether their sound is on, is their own.
const PREFS_KEY = 'censai.shorts';

function readPrefs() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefs(patch) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // Private windows and blocked storage just forget; nothing else breaks.
  }
}

export function useShorts({ win, onUpdate }) {
  const [prefs] = React.useState(readPrefs);
  const source = React.useMemo(
    () => normalizeSource(win.shortsSource) || normalizeSource(prefs.last) || CURATED_CHANNELS[0],
    [win.shortsSource, prefs.last],
  );
  const key = sourceKey(source);
  const [index, setIndex] = React.useState(0);
  const [muted, setMutedState] = React.useState(prefs.muted !== false);
  const [paused, setPaused] = React.useState(false);
  const iframeRef = React.useRef(null);
  const rootRef = React.useRef(null);
  const stageRef = React.useRef(null);
  const mutedRef = React.useRef(muted);
  mutedRef.current = muted;

  React.useEffect(() => { setIndex(0); setPaused(false); }, [key]);

  // The URL only changes with the source and position; sound and pause are
  // player commands so toggling them never reloads the video.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = React.useMemo(
    () => embedUrlFor(source, index, { muted: mutedRef.current, origin }),
    [key, index, origin], // muted is read once per video on purpose
  );

  const send = React.useCallback((func, args) => {
    iframeRef.current?.contentWindow?.postMessage(playerCommand(func, args), '*');
  }, []);

  const onFrameLoad = React.useCallback(() => {
    // Opens the IFrame Player API channel so later commands are heard.
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: win.id || 'shorts' }), '*');
    send(mutedRef.current ? 'mute' : 'unMute');
  }, [send, win.id]);

  const step = React.useCallback((delta) => {
    setPaused(false);
    if (source.type === 'channel') {
      send(delta > 0 ? 'nextVideo' : 'previousVideo');
      setIndex(i => Math.max(0, i + (delta > 0 ? 1 : -1)));
      return;
    }
    setIndex(i => stepIndex(source, i, delta));
  }, [source, send]);

  const setMuted = React.useCallback((next) => {
    setMutedState(next);
    writePrefs({ muted: next });
    send(next ? 'mute' : 'unMute');
  }, [send]);

  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;
  const togglePlay = React.useCallback(() => {
    const was = pausedRef.current;
    send(was ? 'playVideo' : 'pauseVideo');
    setPaused(!was);
  }, [send]);

  const choose = React.useCallback((next) => {
    const clean = normalizeSource(next);
    if (!clean) return;
    writePrefs({ last: clean });
    onUpdate?.({ shortsSource: clean });
  }, [onUpdate]);

  // Wheel and trackpad swipes over the player move one short at a time and
  // never reach the canvas (which would zoom).
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const stepper = createWheelStepper();
    const onWheel = (e) => {
      if (e.ctrlKey) return; // pinch zoom stays with the canvas
      e.preventDefault();
      e.stopPropagation();
      const delta = stepper(e.deltaY, Date.now());
      if (delta) step(delta);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [step]);

  // Touch and pen: a vertical swipe steps, a tap plays or pauses.
  const swipe = React.useRef(null);
  const onPointerDown = React.useCallback((e) => { swipe.current = { y: e.clientY, x: e.clientX }; }, []);
  const onPointerUp = React.useCallback((e) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(e.clientX - start.x)) step(dy < 0 ? 1 : -1);
    else if (Math.abs(dy) < 8) togglePlay();
  }, [step, togglePlay]);

  // While focus is inside the window it owns the arrow keys (the canvas
  // stands down, as it does for games); focus leaving gives them back.
  const claimId = `shorts:${win.id || 'window'}`;
  const onFocus = React.useCallback(() => { claimKeyboard(claimId); }, [claimId]);
  const onBlur = React.useCallback((e) => {
    if (!rootRef.current?.contains(e.relatedTarget)) releaseKeyboard(claimId);
  }, [claimId]);
  React.useEffect(() => () => releaseKeyboard(claimId), [claimId]);

  const onKeyDown = React.useCallback((e, { closePanel } = {}) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '');
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (closePanel?.()) return;
      releaseKeyboard(claimId);
      rootRef.current?.blur();
      return;
    }
    if (typing) return;
    const map = { ArrowDown: 1, PageDown: 1, j: 1, ArrowUp: -1, PageUp: -1, k: -1 };
    if (map[e.key]) { e.preventDefault(); e.stopPropagation(); step(map[e.key]); return; }
    if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); togglePlay(); return; }
    if (e.key === 'm') { e.stopPropagation(); setMuted(!mutedRef.current); }
  }, [claimId, step, togglePlay, setMuted]);

  const length = sourceLength(source);
  return {
    source, index, url, muted, paused, length,
    atStart: index === 0, atEnd: Number.isFinite(length) && index >= length - 1,
    iframeRef, rootRef, stageRef,
    onFrameLoad, step, setMuted, togglePlay, choose,
    onPointerDown, onPointerUp, onFocus, onBlur, onKeyDown,
  };
}
