import React from 'react';
import { embedKind, parseMusicUrl, readPlayerMessage, volumeMessages } from './musicUrls.js';

// The retro device needs room for its screen and click wheel.
export const MUSIC_DEVICE_SIZE = { w: 300, h: 460 };

/**
 * Drives the streamed source's embed (YouTube, SoundCloud, Spotify) through
 * postMessage: play state and progress come back from the embed, commands go
 * out to it. Which stream plays and whether it is paused is shared on the
 * window; volume and mute are this viewer's own.
 */
export function useStreamPlayer({ win, onUpdate, volume, muted, onEnded }) {
  const [paused, setPaused] = React.useState(Boolean(win.musicPaused));
  const [progress, setProgress] = React.useState({ position: 0, duration: 0 });
  const [embedVisible, setEmbedVisible] = React.useState(false);
  const frameRef = React.useRef(null);
  const endedRef = React.useRef(onEnded);
  endedRef.current = onEnded;
  const normalizedSrc = React.useMemo(() => parseMusicUrl(win.src || ''), [win.src]);
  const kind = embedKind(win.src);

  React.useEffect(() => {
    if (!win.src) return;
    const patch = {};
    if (normalizedSrc && normalizedSrc !== win.src) patch.src = normalizedSrc;
    if (!win.musicDevice) {
      // Older windows were squeezed into a 104px strip; grow them to fit the device.
      patch.musicDevice = true;
      patch.h = Math.max(win.h || 0, MUSIC_DEVICE_SIZE.h);
      patch.w = Math.max(win.w || 0, MUSIC_DEVICE_SIZE.w);
    }
    if (Object.keys(patch).length > 0) onUpdate(patch);
  }, [win.src, normalizedSrc, win.musicDevice, win.h, win.w, onUpdate]);

  React.useEffect(() => {
    setPaused(Boolean(win.musicPaused));
  }, [win.musicPaused]);

  React.useEffect(() => {
    setProgress({ position: 0, duration: 0 });
    setEmbedVisible(false);
    // Spotify embeds can't autoplay, so they start paused until they report.
    if (embedKind(win.src) === 'spotify') setPaused(true);
  }, [win.src]);

  const post = React.useCallback((message, origin = '*') => {
    frameRef.current?.contentWindow?.postMessage(
      typeof message === 'string' ? message : JSON.stringify(message),
      origin,
    );
  }, []);

  const sendVolume = React.useCallback(() => {
    const messages = volumeMessages(kind, volume, muted);
    const origin = kind === 'soundcloud' ? 'https://w.soundcloud.com' : '*';
    messages?.forEach(m => post(m, origin));
  }, [kind, volume, muted, post]);

  React.useEffect(() => { sendVolume(); }, [sendVolume]);

  React.useEffect(() => {
    if (!win.src || typeof window === 'undefined') return undefined;
    const onMessage = (event) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const update = readPlayerMessage(event.data);
      if (!update) return;
      if (typeof update.playing === 'boolean') setPaused(!update.playing);
      if (update.position !== undefined || update.duration !== undefined) {
        setProgress(prev => ({
          position: update.position ?? prev.position,
          duration: update.duration ?? prev.duration,
        }));
      }
      if (update.ended) endedRef.current?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [win.src]);

  // Ask the embed to start streaming its state once it has loaded.
  const handleFrameLoad = React.useCallback(() => {
    if (kind === 'youtube') {
      post({ event: 'listening', id: win.id || 'music', channel: 'widget' });
    } else if (kind === 'soundcloud') {
      for (const ev of ['playProgress', 'play', 'pause', 'finish']) {
        post({ method: 'addEventListener', value: ev }, 'https://w.soundcloud.com');
      }
      post({ method: 'getDuration' }, 'https://w.soundcloud.com');
    }
    sendVolume();
  }, [kind, post, win.id, sendVolume]);

  const controllable = Boolean(win.src) && kind !== 'other';

  const togglePlayback = () => {
    if (!controllable) return;
    const nextPaused = !paused;
    if (kind === 'youtube') post({ event: 'command', func: nextPaused ? 'pauseVideo' : 'playVideo', args: [] });
    else if (kind === 'soundcloud') post({ method: nextPaused ? 'pause' : 'play' }, 'https://w.soundcloud.com');
    else if (kind === 'spotify') post({ command: 'toggle' });
    setPaused(nextPaused);
    onUpdate({ musicPaused: nextPaused });
  };

  const seekTo = (seconds) => {
    if (!controllable) return;
    const max = progress.duration || Infinity;
    const target = Math.max(0, Math.min(max, seconds));
    if (kind === 'youtube') post({ event: 'command', func: 'seekTo', args: [target, true] });
    else if (kind === 'soundcloud') post({ method: 'seekTo', value: target * 1000 }, 'https://w.soundcloud.com');
    else if (kind === 'spotify') post({ command: 'seek', timestamp: target });
    setProgress(prev => ({ ...prev, position: target }));
  };

  return {
    paused, setPaused, progress, embedVisible, setEmbedVisible, frameRef, kind, controllable,
    handleFrameLoad, togglePlayback, seekTo,
  };
}
