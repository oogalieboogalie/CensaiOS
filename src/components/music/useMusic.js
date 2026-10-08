import React from 'react';
import { parseSpotifyEmbedUrl } from '../spotify/spotifyEmbed.js';
import { detectMusicSource, nextVisualizerMode, VISUALIZER_MODES } from './musicSkins.js';

// The retro device needs room for its screen and click wheel.
export const MUSIC_DEVICE_SIZE = { w: 300, h: 460 };

function withYouTubeApi(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('enablejsapi', '1');
    if (typeof window !== 'undefined') u.searchParams.set('origin', window.location.origin);
    return u.toString();
  } catch {
    return url.includes('?') ? `${url}&enablejsapi=1` : `${url}?enablejsapi=1`;
  }
}

export function parseMusicUrl(url) {
  if (!url) return '';
  // Spotify
  if (url.startsWith('spotify:') || url.includes('spotify.com')) {
    if (url.includes('/embed/')) return url;
    return parseSpotifyEmbedUrl(url) || url.replace('spotify.com/', 'spotify.com/embed/');
  }
  // SoundCloud
  if (url.includes('soundcloud.com')) {
    if (url.includes('w.soundcloud.com')) return url;
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true`;
  }
  // YouTube (including music.youtube.com watch links)
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    if (url.includes('/embed/')) return withYouTubeApi(url);
    let videoId = '';
    if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split('?')[0];
    else if (url.includes('v=')) videoId = url.split('v=')[1]?.split('&')[0];
    if (videoId) return withYouTubeApi(`https://www.youtube.com/embed/${videoId}?autoplay=1`);
  }
  return url;
}

export function isYouTubeEmbed(url) {
  return /youtube\.com\/embed\//.test(url || '');
}

export function titleFromUrl(url) {
  if (!url) return 'Current stream';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'Current stream';
  }
}

function parseMessage(data) {
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return data && typeof data === 'object' ? data : null;
}

/**
 * Translate a postMessage from a YouTube, SoundCloud or Spotify embed into
 * `{ playing, position, duration }` (seconds; fields only when reported).
 */
export function readPlayerMessage(raw) {
  const data = parseMessage(raw);
  if (!data) return null;
  // YouTube iframe API: infoDelivery / initialDelivery.
  if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info) {
    const out = {};
    const { currentTime, duration, playerState } = data.info;
    if (Number.isFinite(currentTime)) out.position = currentTime;
    if (Number.isFinite(duration) && duration > 0) out.duration = duration;
    if (Number.isFinite(playerState)) out.playing = playerState === 1 || playerState === 3;
    return out;
  }
  // SoundCloud widget API.
  if (typeof data.method === 'string') {
    const v = data.value;
    if (data.method === 'playProgress' && v) return { playing: true, position: (v.currentPosition || 0) / 1000 };
    if (data.method === 'play') return { playing: true };
    if (data.method === 'pause' || data.method === 'finish') return { playing: false };
    if (data.method === 'getDuration' && Number.isFinite(v)) return { duration: v / 1000 };
    return null;
  }
  // Spotify embed.
  if (data.type === 'playback_update' && data.payload) {
    const p = data.payload;
    const out = {};
    if (typeof p.isPaused === 'boolean') out.playing = !p.isPaused;
    if (Number.isFinite(p.position)) out.position = p.position / 1000;
    if (Number.isFinite(p.duration) && p.duration > 0) out.duration = p.duration / 1000;
    return out;
  }
  return null;
}

function embedKind(src) {
  if (isYouTubeEmbed(src)) return 'youtube';
  if (/w\.soundcloud\.com/.test(src || '')) return 'soundcloud';
  if (/spotify\.com\/embed\//.test(src || '')) return 'spotify';
  return 'other';
}

export function useMusic({ win, onUpdate }) {
  const [inputUrl, setInputUrl] = React.useState('');
  const [paused, setPaused] = React.useState(Boolean(win.musicPaused));
  const [progress, setProgress] = React.useState({ position: 0, duration: 0 });
  const [embedVisible, setEmbedVisible] = React.useState(false);
  const frameRef = React.useRef(null);
  const normalizedSrc = React.useMemo(() => parseMusicUrl(win.src || ''), [win.src]);
  const kind = embedKind(win.src);
  const source = win.musicSource || detectMusicSource(win.src);
  const visMode = VISUALIZER_MODES.includes(win.musicVis) ? win.musicVis : 'bars';

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
  }, [kind, post, win.id]);

  const loadTrack = (src, title, sourceHint) => {
    onUpdate({
      src: parseMusicUrl(src),
      trackTitle: title || titleFromUrl(src),
      musicSource: sourceHint || detectMusicSource(src),
      musicDevice: true,
      musicPaused: false,
      h: Math.max(win.h || 0, MUSIC_DEVICE_SIZE.h),
      w: Math.max(win.w || 0, MUSIC_DEVICE_SIZE.w),
    });
    setPaused(false);
  };

  const handleLoad = () => {
    const raw = inputUrl.trim();
    if (!raw) return;
    loadTrack(raw, titleFromUrl(parseMusicUrl(raw)), detectMusicSource(raw));
    setInputUrl('');
  };

  const controllable = kind !== 'other';

  const togglePlayback = () => {
    if (!controllable) return;
    const nextPaused = !paused;
    if (kind === 'youtube') post({ event: 'command', func: nextPaused ? 'pauseVideo' : 'playVideo', args: [] });
    else if (kind === 'soundcloud') post({ method: nextPaused ? 'pause' : 'play' }, 'https://w.soundcloud.com');
    else if (kind === 'spotify') post({ command: 'toggle' });
    setPaused(nextPaused);
    onUpdate({ musicPaused: nextPaused });
  };

  const seekBy = (delta) => {
    if (!controllable) return;
    const max = progress.duration || Infinity;
    const target = Math.max(0, Math.min(max, progress.position + delta));
    if (kind === 'youtube') post({ event: 'command', func: 'seekTo', args: [target, true] });
    else if (kind === 'soundcloud') post({ method: 'seekTo', value: target * 1000 }, 'https://w.soundcloud.com');
    else if (kind === 'spotify') post({ command: 'seek', timestamp: target });
    setProgress(prev => ({ ...prev, position: target }));
  };

  const cycleVisualizer = () => onUpdate({ musicVis: nextVisualizerMode(visMode) });

  const clearTrack = () => {
    onUpdate({ src: '', trackTitle: '', musicSource: '', musicPaused: false });
    setPaused(false);
  };

  return {
    inputUrl, setInputUrl,
    paused, setPaused,
    progress,
    embedVisible, setEmbedVisible,
    frameRef,
    source, kind, controllable, visMode,
    handleFrameLoad,
    loadTrack,
    handleLoad,
    togglePlayback,
    seekBy,
    cycleVisualizer,
    clearTrack,
  };
}
