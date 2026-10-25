import React from 'react';
import { linkHost, logMusic } from './linkAudio.js';
import { kindFromDuration } from './tryLinkKind.js';

// Plays a local audio file through the Web Audio API so the visualizer reads
// the real signal. The graph is
//
//   <audio> -> source -> analyser (spectrum + waveform)
//                     -> splitter -> left / right analysers (VU meters)
//                     -> gain (this viewer's volume) -> speakers
//
// The analysers tap the signal before the volume, so the meters still dance
// when this person has turned their own sound down. Browsers only allow an
// AudioContext after a click, so the graph is built on the first play.
//
// With `remote` (a song or radio link from another website) the file is asked
// for with permission to read its sound. A site that refuses that still
// plays: the player starts over on a fresh element without the analyser, and
// the visualizer falls back to its made-up beat for that link.

function buildGraph(audio) {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  try {
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    const splitter = ctx.createChannelSplitter(2);
    const left = ctx.createAnalyser();
    const right = ctx.createAnalyser();
    left.fftSize = 1024;
    right.fftSize = 1024;
    const gain = ctx.createGain();
    source.connect(analyser);
    source.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    source.connect(gain);
    gain.connect(ctx.destination);
    return { ctx, gain, signal: { analyser, left, right } };
  } catch {
    return null;
  }
}

function newAudio() {
  if (typeof Audio === 'undefined') return null;
  const audio = new Audio();
  audio.preload = 'metadata';
  return audio;
}

export function useLocalAudio({ track, volume, muted, onEnded, remote = false, onHeard }) {
  const url = track?.url || '';
  const audioRef = React.useRef(null);
  const graphRef = React.useRef(null);
  const plainRef = React.useRef(false);
  const wantRef = React.useRef(false);
  const endedRef = React.useRef(onEnded);
  const onHeardRef = React.useRef(onHeard);
  const urlRef = React.useRef(url);
  endedRef.current = onEnded;
  onHeardRef.current = onHeard;
  urlRef.current = url;
  const [state, setState] = React.useState({ playing: false, position: 0, duration: 0 });
  const [signal, setSignal] = React.useState(null);
  const [problem, setProblem] = React.useState('');
  const [problemUrl, setProblemUrl] = React.useState('');
  const [element, setElement] = React.useState(0);

  if (!audioRef.current) audioRef.current = newAudio();

  // Start this link again on a fresh element that skips the analyser.
  const playPlain = () => {
    const old = audioRef.current;
    const src = old?.getAttribute('src');
    const next = newAudio();
    if (!old || !src || !next) return;
    old.pause();
    old.removeAttribute('src');
    if (graphRef.current) {
      graphRef.current.ctx.close?.().catch?.(() => {});
      graphRef.current = null;
      setSignal(null);
    }
    plainRef.current = true;
    next.volume = muted ? 0 : volume / 100;
    next.src = src;
    audioRef.current = next;
    setElement(n => n + 1);
    if (wantRef.current) next.play()?.catch?.(() => {});
  };
  const playPlainRef = React.useRef(playPlain);
  playPlainRef.current = playPlain;

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const sync = () => {
      setState({
        // A file the browser cannot decode never really plays: no PLAYING.
        playing: !audio.paused && !audio.ended && !audio.error,
        position: audio.currentTime || 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      });
      if (!remote) return;
      const kind = kindFromDuration(audio.duration, audio.readyState);
      if (kind) onHeardRef.current?.(kind);
    };
    const ended = () => { sync(); endedRef.current?.(); };
    const ready = () => {
      sync();
      if (remote) logMusic('info', `a link from ${linkHost(audio.src)} is ready${plainRef.current ? ', without the live visualizer (the site does not allow it)' : ', with the live visualizer'}`);
    };
    const failed = () => {
      if (!audio.getAttribute('src')) return;
      if (remote && audio.crossOrigin === 'anonymous') { playPlainRef.current(); return; }
      wantRef.current = false;
      audio.pause();
      sync();
      setProblem(remote ? 'This link could not be played.' : 'This file could not be played.');
      setProblemUrl(urlRef.current);
      logMusic('warn', remote ? `could not play a link from ${linkHost(audio.src)}` : 'could not play a file from this computer');
    };
    const events = ['play', 'pause', 'timeupdate', 'durationchange', 'seeked'];
    events.forEach(ev => audio.addEventListener(ev, sync));
    audio.addEventListener('loadedmetadata', ready);
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', failed);
    sync();
    return () => {
      events.forEach(ev => audio.removeEventListener(ev, sync));
      audio.removeEventListener('loadedmetadata', ready);
      audio.removeEventListener('ended', ended);
      audio.removeEventListener('error', failed);
    };
  }, [element, remote]);

  React.useEffect(() => () => {
    if (audioRef.current?.getAttribute('src')) audioRef.current.pause();
    graphRef.current?.ctx.close?.().catch?.(() => {});
  }, []);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setProblem('');
    setProblemUrl('');
    if (!url) {
      wantRef.current = false;
      if (!audio.getAttribute('src')) return;
      audio.pause();
      audio.removeAttribute('src');
      setState({ playing: false, position: 0, duration: 0 });
      return;
    }
    if (remote) {
      // A plain element with no analyser yet can ask again; one with an
      // analyser already asks every time.
      if (!graphRef.current) plainRef.current = false;
      audio.crossOrigin = 'anonymous';
    }
    audio.src = url;
    audio.currentTime = 0;
    setState({ playing: false, position: 0, duration: 0 });
  }, [url, remote]);

  const level = muted ? 0 : volume / 100;
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (graphRef.current) {
      graphRef.current.gain.gain.value = level;
      audio.volume = 1;
    } else {
      audio.volume = level;
    }
  }, [level]);

  const play = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    wantRef.current = true;
    if (!graphRef.current && !plainRef.current) {
      graphRef.current = buildGraph(audio);
      if (graphRef.current) {
        graphRef.current.gain.gain.value = level;
        audio.volume = 1;
        setSignal(graphRef.current.signal);
      }
    }
    graphRef.current?.ctx.resume?.().catch?.(() => {});
    const started = audio.play();
    if (started && typeof started.catch === 'function') started.catch(() => {});
  }, [level]);

  const pause = React.useCallback(() => {
    wantRef.current = false;
    if (audioRef.current?.getAttribute('src')) audioRef.current.pause();
  }, []);

  const toggle = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play(); else pause();
  }, [play, pause]);

  const seekTo = React.useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
    audio.currentTime = Math.max(0, Math.min(max, seconds));
  }, []);

  return { ...state, signal, problem: problemUrl === url ? problem : '', play, pause, toggle, seekTo };
}
