import React from 'react';
import { detectMusicSource, nextVisualizerMode, VISUALIZER_MODES } from './musicSkins.js';
import { parseMusicUrl, titleFromUrl } from './musicUrls.js';
import {
  addToQueue, clampVolume, normalizeQueue, readMusicPrefs, removeFromQueue, stepTrack, writeMusicPrefs,
} from './musicLibrary.js';
import { MUSIC_DEVICE_SIZE, useStreamPlayer } from './useStreamPlayer.js';
import { useLocalAudio } from './useLocalAudio.js';
import { useUsbTracks } from './useUsbTracks.js';
import { directAudioKind, linkHost, logMusic } from './linkAudio.js';

export * from './musicUrls.js';
export { MUSIC_DEVICE_SIZE } from './useStreamPlayer.js';

/**
 * Everything the Music window's device needs. Two kinds of track play here:
 * streamed links, shared on the window so the whole board hears the same
 * thing, and USB files from this person's computer, which play only for
 * them. Volume, mute and which screen the device shows are per viewer.
 */
export function useMusic({ win, onUpdate }) {
  const [prefs] = React.useState(readMusicPrefs);
  const [volume, setVolumeState] = React.useState(clampVolume(prefs.volume ?? 80));
  const [muted, setMutedState] = React.useState(Boolean(prefs.muted));
  const [volumeShownAt, setVolumeShownAt] = React.useState(0);
  const [usbId, setUsbId] = React.useState(null);
  const [view, setView] = React.useState(win.src ? 'player' : 'library');
  const [inputUrl, setInputUrl] = React.useState('');

  const usb = useUsbTracks();
  const usbIndex = usb.tracks.findIndex(t => t.id === usbId);
  const usbTrack = usbIndex >= 0 ? usb.tracks[usbIndex] : null;
  const mode = usbTrack ? 'local' : (win.src ? 'stream' : null);
  // Song and radio links play in our own player, not a web frame.
  const direct = Boolean(directAudioKind(win.src));
  const linkTrack = React.useMemo(() => (direct ? { id: win.src, url: win.src } : null), [direct, win.src]);

  const queue = React.useMemo(() => normalizeQueue(win.musicQueue), [win.musicQueue]);
  const queueIndex = queue.findIndex(item => item.url === win.src);

  const loadTrack = (src, title, sourceHint) => {
    const url = parseMusicUrl(src);
    const source = sourceHint || detectMusicSource(src);
    const trackTitle = title || titleFromUrl(src);
    const kind = directAudioKind(url);
    if (kind) logMusic('info', `loaded a ${kind} link from ${linkHost(url)}`);
    onUpdate({
      src: url,
      trackTitle,
      musicSource: source,
      musicDevice: true,
      musicPaused: false,
      musicQueue: addToQueue(queue, { url, title: trackTitle, source }),
      h: Math.max(win.h || 0, MUSIC_DEVICE_SIZE.h),
      w: Math.max(win.w || 0, MUSIC_DEVICE_SIZE.w),
    });
    setUsbId(null);
    setView('player');
  };

  const playQueueItem = (index) => {
    const item = queue[index];
    if (!item) return;
    onUpdate({ src: item.url, trackTitle: item.title, musicSource: item.source, musicPaused: false });
    setUsbId(null);
    setView('player');
  };

  const removeQueueItem = (url) => onUpdate({ musicQueue: removeFromQueue(queue, url) });

  const playUsb = (id) => { setUsbId(id); setView('player'); };

  const step = (delta) => {
    if (mode === 'local') {
      const next = stepTrack(usb.tracks.length, usbIndex, delta);
      if (next >= 0) setUsbId(usb.tracks[next].id);
    } else if (queue.length > 1) {
      playQueueItem(stepTrack(queue.length, queueIndex, delta));
    }
  };
  const stepRef = React.useRef(step);
  stepRef.current = step;
  const onEnded = React.useCallback(() => stepRef.current(1), []);

  const stream = useStreamPlayer({ win, onUpdate, volume, muted: muted || mode === 'local' || direct, onEnded });
  const local = useLocalAudio({ track: usbTrack, volume, muted, onEnded });
  const link = useLocalAudio({ track: linkTrack, volume, muted, onEnded, remote: true });

  // The whole board shares play and pause of a link; a USB pick pauses it.
  const { play: linkPlay, pause: linkPause } = link;
  React.useEffect(() => {
    if (!linkTrack) return;
    if (usbTrack || win.musicPaused) linkPause(); else linkPlay();
  }, [linkTrack, usbTrack?.id, win.musicPaused]);
  const toggleLink = () => {
    const nextPaused = link.playing;
    if (nextPaused) linkPause(); else linkPlay();
    onUpdate({ musicPaused: nextPaused });
  };

  // A USB pick starts playing straight away (the click is the user gesture).
  const localPlay = local.play;
  React.useEffect(() => { if (usbTrack) localPlay(); }, [usbTrack?.id]);

  const setVolume = (value) => {
    const next = clampVolume(value);
    setVolumeState(next);
    setVolumeShownAt(Date.now());
    if (muted && next > 0) setMutedState(false);
    writeMusicPrefs({ volume: next, muted: muted && next > 0 ? false : muted });
  };
  const nudgeVolume = (delta) => setVolume(volume + delta);
  const toggleMute = () => {
    setMutedState(!muted);
    setVolumeShownAt(Date.now());
    writeMusicPrefs({ muted: !muted });
  };

  const isLocal = mode === 'local';
  const player = isLocal ? local : (direct ? link : null);
  const progress = player ? { position: player.position, duration: player.duration } : stream.progress;
  const seekTo = (seconds) => (player ? player.seekTo(seconds) : stream.seekTo(seconds));

  const eject = () => {
    if (isLocal) {
      local.pause();
      setUsbId(null);
      if (!win.src) setView('library');
      return;
    }
    onUpdate({ src: '', trackTitle: '', musicSource: '', musicPaused: false });
    setView('library');
  };

  const handleLoad = () => {
    const raw = inputUrl.trim();
    if (!raw) return;
    loadTrack(raw, titleFromUrl(parseMusicUrl(raw)), detectMusicSource(raw));
    setInputUrl('');
  };

  const visMode = VISUALIZER_MODES.includes(win.musicVis) ? win.musicVis : 'bars';

  return {
    mode,
    view: mode ? view : 'library',
    setView,
    source: isLocal ? 'local' : (win.musicSource || detectMusicSource(win.src)),
    title: isLocal ? usbTrack.title : (win.trackTitle || titleFromUrl(win.src)),
    usbTrack,
    paused: player ? !player.playing : stream.paused,
    progress,
    controllable: Boolean(player) || stream.controllable,
    canStep: isLocal ? usb.tracks.length > 1 : queue.length > 1,
    signal: player ? player.signal : null,
    togglePlayback: isLocal ? local.toggle : (direct ? toggleLink : stream.togglePlayback),
    direct,
    linkProblem: direct && !isLocal ? link.problem : '',
    seekTo,
    seekBy: (delta) => seekTo(progress.position + delta),
    next: () => step(1),
    prev: () => step(-1),
    eject,
    volume, muted, volumeShownAt, setVolume, nudgeVolume, toggleMute,
    queue, queueIndex, playQueueItem, removeQueueItem,
    usb, usbId, playUsb,
    visMode,
    cycleVisualizer: () => onUpdate({ musicVis: nextVisualizerMode(visMode) }),
    inputUrl, setInputUrl, handleLoad, loadTrack,
    stream,
    streamSrc: win.src || '',
  };
}
